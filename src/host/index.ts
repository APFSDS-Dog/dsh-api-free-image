/**
 * dsh-api-free-image · Host 半
 *
 * 这一半在 DSH 主进程里跑，负责三件事：
 *   1. 把两个工具（generate_image / check_status）注册到 ctx.tools；
 *   2. 处理配置：给设置卡片提供读写 API Key、看/改输出目录的 HTTP 路由；
 *   3. 生图核心本身（src/core.ts），无子进程、无 Python、无 uv。
 *
 * 选文件夹不在这里做：DSH 已有原生 `ctx.uiWorkspace.pickDirectory()`
 * （Windows 上是 IFileOpenDialog，走宿主的 koffi/COM 子进程），
 * 让 Client 半直接调它，比我们自己 spawn 对话框稳得多。
 *
 * 关于「MCP Server」：同一份核心同时以标准 stdio MCP Server 的形式发布
 * （lib/mcp-server.js），可以接给任意 MCP 客户端。DSH 内部则用原生工具注册，
 * 因为反过来再套一层子进程 MCP 只会多一个可能挂掉的环节，功能完全一样。
 */
import { PLUGIN_ID } from '../config.js'
import { clearApiKey, RATE_LIMIT_IPD, RATE_LIMIT_IPM, readStatus, setOutputDir, writeApiKey } from '../core.js'
import { errorMessage } from '../errors.js'
import { TOOL_SPECS } from '../tools.js'

export const name = PLUGIN_ID

/** 必须等工具注册表就位；webServer 是可选依赖（没有它插件照样能出图）。 */
export const inject = ['tools']

/** 路由前缀，客户端（设置卡片）用的就是这个。 */
export const ROUTE_PREFIX = `/${PLUGIN_ID}/api`

/** DSH 那一侧的接口只声明这里实际用到的成员，避免依赖不可导入的内部类型。 */
interface RegisterableTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render(args: unknown, value: unknown): unknown[]
  }
  execute(args: unknown, exec: { signal: AbortSignal }): Promise<unknown>
}

interface HostContext {
  tools: { register(definition: RegisterableTool): () => void }
  effect(callback: () => () => void, label?: string): unknown
  inject(deps: readonly string[], callback: (scoped: HostContext) => void): unknown
  webServer?: { register(route: WebRoute): () => void }
}

interface WebRoute {
  kind: 'exact'
  path: string
  handler(request: IncomingMessageLike, response: ServerResponseLike): void | Promise<void>
}

interface IncomingMessageLike {
  method?: string | undefined
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array | string>
}

interface ServerResponseLike {
  writeHead(status: number, headers?: Record<string, string>): unknown
  end(body?: string): unknown
}

const MAX_BODY_BYTES = 64 * 1024

function sendJson(response: ServerResponseLike, status: number, payload: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

async function readJsonBody(request: IncomingMessageLike): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk)
    total += buffer.byteLength
    if (total > MAX_BODY_BYTES) throw new Error('请求体太大')
    chunks.push(buffer)
  }
  if (total === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('请求体必须是 JSON 对象')
  return parsed as Record<string, unknown>
}

/** 设置卡片读的完整状态：Key 来源 + 用量 + 输出目录 + 锁死的模型。 */
async function buildStatusPayload(): Promise<Record<string, unknown>> {
  const report = await readStatus()
  return {
    ok: true,
    configured: report.apiKey.configured,
    source: report.apiKey.source,
    maskedKey: report.apiKey.masked,
    keyFile: report.apiKey.keyFile,
    envName: report.apiKey.envName,
    provider: report.provider,
    limits: { ipm: RATE_LIMIT_IPM, ipd: RATE_LIMIT_IPD },
    usage: {
      date: report.usage.date,
      todayCount: report.usage.todayCount,
      minuteCount: report.usage.minuteCount,
      remainingToday: report.usage.remainingToday,
    },
    output: report.output,
    paths: report.paths,
  }
}

function registerRoutes(ctx: HostContext): void {
  const statusRoute: WebRoute = {
    kind: 'exact',
    path: `${ROUTE_PREFIX}/status`,
    async handler(request, response) {
      if ((request.method ?? 'GET').toUpperCase() !== 'GET') {
        sendJson(response, 405, { ok: false, error: '只支持 GET' })
        return
      }
      try {
        sendJson(response, 200, await buildStatusPayload())
      } catch (error) {
        sendJson(response, 500, { ok: false, error: errorMessage(error) })
      }
    },
  }

  const keyRoute: WebRoute = {
    kind: 'exact',
    path: `${ROUTE_PREFIX}/key`,
    async handler(request, response) {
      if ((request.method ?? 'GET').toUpperCase() !== 'POST') {
        sendJson(response, 405, { ok: false, error: '只支持 POST' })
        return
      }
      try {
        const body = await readJsonBody(request)
        const rawKey = body.apiKey
        if (typeof rawKey !== 'string') {
          sendJson(response, 400, { ok: false, error: 'apiKey 必须是字符串（传空字符串表示清除）' })
          return
        }
        const state = rawKey.trim() === '' ? await clearApiKey() : await writeApiKey(rawKey)
        sendJson(response, 200, {
          ok: true,
          saved: state.configured && rawKey.trim() !== '',
          configured: state.configured,
          source: state.source,
          maskedKey: state.masked,
        })
      } catch (error) {
        sendJson(response, 400, { ok: false, error: errorMessage(error) })
      }
    },
  }

  /**
   * 保存图片输出目录。
   * 传 `{ outputDir: '' }` 恢复默认（系统的「我的图片」）。
   * Host 会建目录 + 试写探针，不可写就带原因返回 400——不会等到出图才炸。
   */
  const outputDirRoute: WebRoute = {
    kind: 'exact',
    path: `${ROUTE_PREFIX}/output-dir`,
    async handler(request, response) {
      if ((request.method ?? 'GET').toUpperCase() !== 'POST') {
        sendJson(response, 405, { ok: false, error: '只支持 POST' })
        return
      }
      try {
        const body = await readJsonBody(request)
        const rawDir = body.outputDir
        if (typeof rawDir !== 'string') {
          sendJson(response, 400, { ok: false, error: 'outputDir 必须是字符串（传空字符串表示恢复默认）' })
          return
        }
        const output = await setOutputDir(rawDir)
        sendJson(response, 200, { ok: true, output })
      } catch (error) {
        sendJson(response, 400, { ok: false, error: errorMessage(error) })
      }
    },
  }

  // 只有 web 宿主才有的服务：没有它（例如 headless 组合）就跳过 UI 路由。
  ctx.inject(['webServer'], (scoped) => {
    if (scoped.webServer === undefined) return
    scoped.effect(() => {
      const disposers = [
        scoped.webServer?.register(statusRoute) ?? (() => {}),
        scoped.webServer?.register(keyRoute) ?? (() => {}),
        scoped.webServer?.register(outputDirRoute) ?? (() => {}),
      ]
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            // 卸载阶段互相踩踏时忽略，不要让清理抛错。
          }
        }
      }
    }, `${PLUGIN_ID}: settings routes`)
  })
}

function registerTools(ctx: HostContext): void {
  ctx.effect(() => {
    const disposers = TOOL_SPECS.map((spec) =>
      ctx.tools.register({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
          // 值形状宽松一点：不同分支（成功/失败/状态）字段不同。
          schema: { type: 'object', additionalProperties: true },
          render: (_args: unknown, value: unknown) => {
            const text =
              typeof value === 'object' && value !== null && typeof (value as { message?: unknown }).message === 'string'
                ? (value as { message: string }).message
                : '（没有内容）'
            return [{ type: 'text', text }]
          },
        },
        async execute(args: unknown, exec: { signal: AbortSignal }) {
          const record = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
          const outcome = await spec.run(record, { signal: exec.signal, surface: 'host' })
          if (outcome.isError) throw new Error(outcome.text)
          // 保留人读文案，render 直接取用；结构化字段一并给出去。
          return { ...outcome.value, message: outcome.text }
        },
      }),
    )
    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // 同上。
        }
      }
    }
  }, `${PLUGIN_ID}: tools`)
}

export function apply(ctx: HostContext): void {
  registerTools(ctx)
  registerRoutes(ctx)
}

// 供调试与自检使用。
export const internals = { buildStatusPayload, ROUTE_PREFIX }
