/**
 * 请求体 + 并发记账自检。
 *
 * 两件事一起钉住：
 *   1. 真正发出去的 body 只有「模型 + 提示词 + 尺寸 + 负面提示词」。
 *      硅基流动的 /v1/images/generations 会**接收但静默忽略** num_images / seed /
 *      output_format 这类字段——发了不报错也不生效，所以一个都不发。
 *   2. 两个并发的 tools/call 不会丢计数（账本是「读→改→写」，必须排队）。
 *
 *   node scripts/check-request.mjs
 *
 * 做法：起一个假 fetch（--import 预加载），把 lib/mcp-server.js 拉起来并发跑两次
 * tools/call，再问一次 check_status 看计数。全程不联网、不消耗额度，图片写临时目录。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(root, 'lib', 'mcp-server.js')

if (!fs.existsSync(serverEntry)) {
  console.error(`找不到 ${serverEntry}，先跑 npm run build`)
  process.exit(1)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kolors-request-check-'))
const fakeHome = path.join(tmp, 'home')
const spyFile = path.join(tmp, 'spy-fetch.mjs')
const spyOut = path.join(tmp, 'spy.jsonl')
fs.mkdirSync(fakeHome, { recursive: true })

/** 1x1 透明 PNG，用来冒充下载回来的图片。 */
const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

fs.writeFileSync(
  spyFile,
  `import fs from 'node:fs'
const out = process.env.KOLORS_SPY_OUT
const record = (row) => fs.appendFileSync(out, JSON.stringify(row) + '\\n')
const png = Buffer.from(${JSON.stringify(ONE_PIXEL_PNG)}, 'base64')
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : String(input.url)
  if (url.includes('/v1/images/generations')) {
    record({ kind: 'api', method: init.method ?? 'GET', body: init.body })
    // 故意慢一点：两个并发调用必然在“读账本”之后才写，暴露丢计数的老毛病。
    await new Promise((resolve) => setTimeout(resolve, 30))
    return new Response(JSON.stringify({ images: [{ url: 'https://example.invalid/fake.png' }], seed: 987654 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  record({ kind: 'download', url })
  return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })
}
`,
  'utf8',
)

const child = spawn(process.execPath, ['--import', pathToFileURL(spyFile).href, serverEntry], {
  env: {
    ...process.env,
    USERPROFILE: fakeHome,
    HOME: fakeHome,
    SILICONFLOW_API_KEY: 'sk-check-0123456789abcdefghijklmnopqrstuv',
    KOLORS_SPY_OUT: spyOut,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  stdout += chunk
})
child.stderr.on('data', (chunk) => {
  stderr += chunk
})

const sent = []
const send = (message) => {
  sent.push(message)
  child.stdin.write(`${JSON.stringify(message)}\n`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 等某个 id 的响应出现（服务端也是逐行回，简单轮询够用）。 */
async function waitForReply(id, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const line of stdout.split('\n')) {
      const text = line.trim()
      if (text === '' || !text.includes(`"id":${id}`)) continue
      try {
        const message = JSON.parse(text)
        if (message.id === id) return message
      } catch {
        // 半行，继续等。
      }
    }
    await sleep(20)
  }
  throw new Error(`等 id=${id} 的响应超时。stdout：${stdout.slice(0, 800)}\nstderr：${stderr.slice(0, 800)}`)
}

const fullArgs = {
  prompt: '一只戴墨镜的柴犬，扁平插画风',
  aspect_ratio: '3:4',
  image_size: '768x1024',
  negative_prompt: '文字, 水印',
}
const bareArgs = { prompt: '雨夜霓虹街道' }

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'check-request', version: '0' } },
})
send({ jsonrpc: '2.0', method: 'notifications/initialized' })
await waitForReply(1)

// 两个调用**同时**发出去 —— 既是请求体检查，也是并发记账的回归测试。
send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'generate_image', arguments: fullArgs } })
send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'generate_image', arguments: bareArgs } })
const [replyFull, replyBare] = await Promise.all([waitForReply(2), waitForReply(3)])

send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'check_status', arguments: {} } })
const replyStatus = await waitForReply(4)
child.stdin.end()
const exitCode = await new Promise((resolve) => {
  child.on('exit', (code) => resolve(code ?? 0))
})

const failures = []
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ✓ ${label}`)
    return
  }
  failures.push(label)
  console.log(`  ✗ ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const rows = fs.existsSync(spyOut)
  ? fs
      .readFileSync(spyOut, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line))
  : []
const bodies = rows
  .filter((row) => row.kind === 'api')
  .map((row) => {
    try {
      return JSON.parse(row.body)
    } catch {
      return {}
    }
  })

const textOf = (reply) => String(reply?.result?.content?.[0]?.text ?? '')
const bodyFor = (prompt) => bodies.find((body) => body.prompt === prompt)

console.log(`\n[1/3] 进程与协议`)
check('MCP Server 正常退出', exitCode === 0, `exit=${exitCode}${stderr === '' ? '' : `\n${stderr.slice(0, 400)}`}`)
check('并发两次出图都成功', textOf(replyFull).includes('出图成功') && textOf(replyBare).includes('出图成功'), `${textOf(replyFull)} | ${textOf(replyBare)}`)

console.log(`\n[2/3] 请求体字段`)
check('抓到了 2 次生图请求', bodies.length === 2, `实际 ${bodies.length} 次`)
const FORBIDDEN = [
  'num_images',
  'seed',
  'output_format',
  'num_inference_steps',
  'guidance_scale',
  'batch_size',
  'image_num',
  'steps',
]
for (const [label, body] of [
  ['带全 4 个参数', bodyFor(fullArgs.prompt) ?? {}],
  ['只给 prompt', bodyFor(bareArgs.prompt) ?? {}],
]) {
  const keys = Object.keys(body).sort()
  console.log(`  · ${label} body：${JSON.stringify(body)}`)
  check(`${label}：没有发任何被忽略的参数`, FORBIDDEN.every((bad) => !keys.includes(bad)), keys.join(','))
  check(`${label}：模型写死为 Kwai-Kolors/Kolors`, body.model === 'Kwai-Kolors/Kolors', String(body.model))
}
const fullKeys = Object.keys(bodyFor(fullArgs.prompt) ?? {}).sort()
const bareKeys = Object.keys(bodyFor(bareArgs.prompt) ?? {}).sort()
check(
  '带全参数时正好 4 个字段（model/prompt/image_size/negative_prompt）',
  JSON.stringify(fullKeys) === JSON.stringify(['image_size', 'model', 'negative_prompt', 'prompt']),
  fullKeys.join(','),
)
check(
  '没给负面提示词时就不带 negative_prompt（3 个字段）',
  JSON.stringify(bareKeys) === JSON.stringify(['image_size', 'model', 'prompt']),
  bareKeys.join(','),
)
check('aspect_ratio 被翻译成像素（3:4 → 768x1024）', bodyFor(fullArgs.prompt)?.image_size === '768x1024', String(bodyFor(fullArgs.prompt)?.image_size))

console.log(`\n[3/3] 并发记账 + 清理`)
const statusValue = replyStatus?.result?.structuredContent ?? {}
check('两次并发出图都记进了账本（今日 2 张）', statusValue.todayCount === 2, String(statusValue.todayCount))
check('本分钟也是 2 张（没丢、也没重复）', statusValue.minuteCount === 2, String(statusValue.minuteCount))

fs.rmSync(tmp, { recursive: true, force: true })
check('临时目录已删除', !fs.existsSync(tmp))

if (failures.length > 0) {
  console.error(`\n❌ ${failures.length} 项失败：${failures.join('、')}\n`)
  process.exitCode = 1
} else {
  console.log('\n✅ 请求体自检通过：只发 model / prompt / image_size（+ negative_prompt），并发记账不丢\n')
}
