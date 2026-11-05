/**
 * 两个工具的定义（schema + 执行体）。
 *
 * DSH Host 插件把它注册成原生工具，本地 MCP Server 用同一份定义应答
 * `tools/list` / `tools/call`，所以两边永远是同一套参数与同一套文案。
 *
 * 刻意只暴露四个参数：prompt / aspect_ratio / image_size / negative_prompt。
 * 没有 model —— 模型在 provider 里写死为免费模型。
 */
import { PLUGIN_DISPLAY_NAME } from './config.js'
import { errorMessage, isImageGenError } from './errors.js'
import {
  formatStatus,
  generateImage,
  readStatus,
  type GenerateResult,
  type StatusReport,
} from './core.js'
import { getProvider } from './providers/index.js'

export interface ToolRunContext {
  readonly signal?: AbortSignal | undefined
  /** 标记 MCP / CLI 这类非 DSH 调用，用于输出里换一句提示。 */
  readonly surface?: 'host' | 'mcp' | 'cli' | undefined
}

export interface ToolOutcome {
  /** 给模型看的文本。 */
  readonly text: string
  /** 结构化结果，宿主工具同时作为 value 返回。 */
  readonly value: Record<string, unknown>
  readonly isError: boolean
}

export interface ToolSpec {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  run(args: Record<string, unknown>, context?: ToolRunContext): Promise<ToolOutcome>
}

const HOST_HINT = `打开 DSH 设置 → 插件 → ${PLUGIN_DISPLAY_NAME} 填入 Key`

function asString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error(`❌ 参数 ${key} 必须是字符串。`)
  }
  return value
}

function formatGenerateResult(result: GenerateResult, surface: ToolRunContext['surface']): ToolOutcome {
  const lines = [
    '✅ 出图成功',
    `图片：${result.filePath}`,
    `尺寸：${result.imageSize} ｜ 模型：${result.model}`,
    `用量：今日 ${result.usage.todayCount}/${result.usage.ipd} 张 ｜ 本分钟 ${result.usage.minuteCount}/${result.usage.ipm} 张`,
    `耗时：${(result.elapsedMs / 1000).toFixed(1)} 秒`,
  ]
  if (surface === 'mcp') lines.push('（MCP 调用：图片已存到上面这个本地路径）')
  return {
    text: lines.join('\n'),
    value: {
      ok: true,
      path: result.filePath,
      outputDir: result.outputDir,
      imageSize: result.imageSize,
      model: result.model,
      provider: result.providerId,
      elapsedMs: result.elapsedMs,
      todayCount: result.usage.todayCount,
      minuteCount: result.usage.minuteCount,
      ipd: result.usage.ipd,
      ipm: result.usage.ipm,
    },
    isError: false,
  }
}

export const generateImageTool: ToolSpec = {
  name: 'generate_image',
  description:
    '用免费生图模型生成一张图片，并把图片保存到本地磁盘，返回本地绝对路径。' +
    '模型是写死的免费模型，没有 model 参数，请不要尝试指定别的模型。' +
    '本地限额：每分钟最多 2 张、每天最多 400 张，超限会直接报错。' +
    '用户想要“画一张…／出张图／生成图片／文生图”时用它。',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: '画面描述（中文或英文都行）。写清主体、风格、光线、构图，效果更好。',
      },
      aspect_ratio: {
        type: 'string',
        enum: Object.keys(getProvider().aspectRatios),
        description: '画幅比例，默认 1:1。3:4 竖构图适合人物；16:9 横构图适合风景/封面。被 image_size 覆盖。',
      },
      image_size: {
        type: 'string',
        description:
          '直接指定像素尺寸，写成 "宽x高"（如 1024x1024、768x1024、1024x576），宽高 256~2048。给了它就忽略 aspect_ratio。',
      },
      negative_prompt: {
        type: 'string',
        description: '反向提示词：不想出现的东西，例如 "文字, 水印, 变形的手, 低清晰度"。',
      },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
  async run(args, context = {}) {
    try {
      const result = await generateImage(
        {
          prompt: asString(args, 'prompt') ?? '',
          aspectRatio: asString(args, 'aspect_ratio'),
          imageSize: asString(args, 'image_size'),
          negativePrompt: asString(args, 'negative_prompt'),
        },
        context.signal === undefined ? {} : { signal: context.signal },
      )
      return formatGenerateResult(result, context.surface)
    } catch (error) {
      return errorOutcome(error)
    }
  },
}

export const checkStatusTool: ToolSpec = {
  name: 'check_status',
  description:
    '查询免费生图插件的本地状态：API Key 是否已配置、今天和这一分钟已经出了几张图、配额还剩多少、图片存在哪个目录。' +
    '只读本地文件，不联网、不消耗额度。没有参数。',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async run(_args, context = {}) {
    try {
      const report: StatusReport = await readStatus()
      const text = formatStatus(report)
      const extra = report.apiKey.configured ? '' : `\n👉 怎么配：${HOST_HINT}，或设置环境变量 ${report.apiKey.envName}。`
      return {
        text: `${text}${extra}`,
        value: {
          ok: true,
          configured: report.apiKey.configured,
          source: report.apiKey.source,
          maskedKey: report.apiKey.masked,
          provider: report.provider.id,
          model: report.provider.model,
          date: report.usage.date,
          todayCount: report.usage.todayCount,
          minuteCount: report.usage.minuteCount,
          ipd: report.usage.ipd,
          ipm: report.usage.ipm,
          remainingToday: report.usage.remainingToday,
          outputDir: report.output.dir,
          outputDirSource: report.output.source,
          todayImageDir: report.output.todayImageDir,
          usageFile: report.paths.usageFile,
          configFile: report.paths.configFile,
        },
        isError: false,
      }
    } catch (error) {
      return errorOutcome(error)
    }
  },
}

export function errorOutcome(error: unknown): ToolOutcome {
  const code = isImageGenError(error) ? error.code : 'UNKNOWN'
  const message = errorMessage(error)
  return {
    text: message,
    value: { ok: false, code, error: message },
    isError: true,
  }
}

export const TOOL_SPECS: readonly ToolSpec[] = [generateImageTool, checkStatusTool]

export function findTool(name: string): ToolSpec | undefined {
  return TOOL_SPECS.find((tool) => tool.name === name)
}
