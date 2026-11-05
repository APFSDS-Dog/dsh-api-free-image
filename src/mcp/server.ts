/**
 * dsh-api-free-image · 本地 MCP Server（stdio，零依赖）
 *
 * 手写 JSON-RPC 2.0 而不用 @modelcontextprotocol/sdk，是有意的：
 *   - 插件一共只有两个工具，协议面就 initialize / tools/list / tools/call 三件事；
 *   - 零依赖意味着 `node lib/mcp-server.js` 在任何装了 Node 的机器上直接能跑，
 *     用户装上 .tgz 也不用再联网拉 SDK。
 *
 * 用法（任何 MCP 客户端都行）：
 *   command: node
 *   args:    ["<插件目录>/lib/mcp-server.js"]
 *
 * 自检（不看协议，直接跑一次 check_status）：
 *   node lib/mcp-server.js --selftest
 */
import { createInterface } from 'node:readline'
import { PLUGIN_ID } from '../config.js'
import { formatStatus, readStatus } from '../core.js'
import { TOOL_SPECS, findTool } from '../tools.js'

const SERVER_VERSION = __PLUGIN_VERSION__
/** 日志一律走 stderr：stdout 是协议通道，混一行字就会把客户端搞崩。 */
const log = (...parts: unknown[]): void => {
  console.error(`[${PLUGIN_ID}]`, ...parts)
}

interface JsonRpcRequest {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: unknown
}

interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

const DEFAULT_PROTOCOL_VERSION = '2024-11-05'

function writeMessage(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function reply(id: number | string | null | undefined, result: unknown): void {
  writeMessage({ jsonrpc: '2.0', id: id ?? null, result })
}

function replyError(id: number | string | null | undefined, error: JsonRpcError): void {
  writeMessage({ jsonrpc: '2.0', id: id ?? null, error })
}

function toolList(): unknown[] {
  return TOOL_SPECS.map((spec) => ({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.parameters,
  }))
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const spec = findTool(name)
  if (spec === undefined) {
    return {
      content: [{ type: 'text', text: `没有这个工具：${name}。可用工具：${TOOL_SPECS.map((t) => t.name).join(', ')}` }],
      isError: true,
    }
  }
  const outcome = await spec.run(args, { surface: 'mcp' })
  return {
    content: [{ type: 'text', text: outcome.text }],
    ...(outcome.isError ? { isError: true } : {}),
    structuredContent: outcome.value,
  }
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  const method = request.method ?? ''
  // 通知（没有 id）不需要应答。
  const isNotification = request.id === undefined && method.startsWith('notifications/')

  switch (method) {
    case 'initialize': {
      const params =
        typeof request.params === 'object' && request.params !== null
          ? (request.params as Record<string, unknown>)
          : {}
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION
      reply(request.id, {
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: PLUGIN_ID, version: SERVER_VERSION },
        instructions:
          '免费生图：generate_image(prompt, aspect_ratio, image_size, negative_prompt) 出图并落盘；' +
          'check_status() 只读本地状态。模型写死为免费模型，本地限额 IPM=2 / IPD=400。',
      })
      log('initialize，协议版本', requested)
      return
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      if (!isNotification) reply(request.id, {})
      return
    case 'ping':
      reply(request.id, {})
      return
    case 'tools/list':
      reply(request.id, { tools: toolList() })
      return
    case 'tools/call': {
      const params =
        typeof request.params === 'object' && request.params !== null
          ? (request.params as Record<string, unknown>)
          : {}
      const toolName = typeof params.name === 'string' ? params.name : ''
      const args =
        typeof params.arguments === 'object' && params.arguments !== null
          ? (params.arguments as Record<string, unknown>)
          : {}
      try {
        reply(request.id, await callTool(toolName, args))
      } catch (error) {
        reply(request.id, {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        })
      }
      return
    }
    case 'resources/list':
      reply(request.id, { resources: [] })
      return
    case 'prompts/list':
      reply(request.id, { prompts: [] })
      return
    default:
      if (isNotification) return
      replyError(request.id, { code: -32601, message: `Method not found: ${method}` })
  }
}

function serveStdio(): void {
  const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
  rl.on('line', (line) => {
    const text = line.trim()
    if (text === '') return
    let parsed: JsonRpcRequest
    try {
      parsed = JSON.parse(text) as JsonRpcRequest
    } catch {
      replyError(null, { code: -32700, message: 'Parse error：收到的不是 JSON' })
      return
    }
    if (Array.isArray(parsed)) {
      // 批量请求：逐个处理，MCP 已不推荐批量，这里只保证不崩。
      for (const item of parsed) void handleRequest(item as JsonRpcRequest)
      return
    }
    if (typeof parsed !== 'object' || parsed === null) {
      replyError(null, { code: -32600, message: 'Invalid Request' })
      return
    }
    void handleRequest(parsed).catch((error: unknown) => {
      log('处理请求时出错：', error)
      replyError(parsed.id ?? null, { code: -32603, message: error instanceof Error ? error.message : String(error) })
    })
  })
  rl.on('close', () => {
    process.exitCode = 0
  })
  log(`stdio MCP Server 已启动（v${SERVER_VERSION}），工具：${TOOL_SPECS.map((t) => t.name).join(', ')}`)
}

async function selftest(): Promise<void> {
  const report = await readStatus()
  process.stdout.write(`${formatStatus(report)}\n`)
  process.stdout.write(`\n可用工具：${TOOL_SPECS.map((t) => t.name).join(', ')}\n`)
  const sample = await TOOL_SPECS[1]?.run({}, { surface: 'cli' })
  if (sample !== undefined) process.stdout.write(`\ncheck_status 输出：\n${sample.text}\n`)
}

const argv = process.argv.slice(2)
if (argv.includes('--selftest') || argv.includes('--check')) {
  await selftest()
} else if (argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(
    `${PLUGIN_ID} — 免费生图的本地 MCP Server（v${SERVER_VERSION}）\n\n` +
      '  node lib/mcp-server.js              以 stdio MCP 协议运行（给 IDE / 客户端调用）\n' +
      '  node lib/mcp-server.js --selftest   直接打印本地状态，不联网\n',
  )
} else {
  serveStdio()
}
