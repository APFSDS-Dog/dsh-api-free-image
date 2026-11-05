/**
 * 生图平台（Provider）接口。
 *
 * 想接第二个免费生图平台时，**不要改 core.ts**：照着这个接口写一个
 * `src/providers/<你的平台>.ts`，在 `src/providers/index.ts` 里注册一行即可。
 * core.ts 只负责“配额 + 落盘 + 状态”，平台差异全部关在 provider 里。
 */
import type { ImageGenError } from '../errors.js'

/** core 已经解算好的输入：尺寸已从 aspect_ratio 翻成像素。 */
export interface ProviderInput {
  readonly prompt: string
  /** "宽x高"，例如 1024x1024。 */
  readonly imageSize: string
  /** 原始画幅比例（可能为 undefined）。 */
  readonly aspectRatio: string | undefined
  readonly negativePrompt: string | undefined
}

/** 一个可以直接 fetch 的请求。 */
export interface ProviderRequest {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  /** 只允许出现「模型 / 提示词 / 尺寸 / 负面提示词」这四个字段。 */
  readonly body: Readonly<Record<string, unknown>>
}

export interface ProviderNote {
  readonly kind: 'info' | 'lock' | 'warn'
  readonly text: string
}

export interface ImageProvider {
  /** 稳定 id，用作配置文件与用量文件的 key，别随便改。 */
  readonly id: string
  /** 给人看的名字（只出现在日志和文档里，UI 主文案保持平台中立）。 */
  readonly label: string
  /** 写死的模型名。 */
  readonly defaultModel: string
  /** 读 Key 的环境变量名（设置卡片没填时的兜底）。 */
  readonly apiKeyEnv: string
  /** 注册 / 取 Key 的链接（邀请码放这里）。 */
  readonly signupUrl: string
  /** 允许的画幅 → 像素尺寸。 */
  readonly aspectRatios: Readonly<Record<string, string>>
  /**
   * 该平台「收下但静默忽略」的参数。只用于文档和自检断言，**永远不会发送**。
   * 现行清单来自 2026-11 的 v3.2 实测。
   */
  readonly ignoredParams: readonly string[]

  /** 组装请求体。实现必须只写四个字段。 */
  buildRequest(input: ProviderInput, apiKey: string): ProviderRequest

  /** 从响应 JSON 里取出图片地址；取不到就抛 ImageGenError。 */
  parseImageUrl(payload: unknown): string

  /** 把 HTTP 失败翻译成人话；不认识的状态码返回 undefined，由 core 兜底。 */
  translateHttpError(status: number, bodyText: string): ImageGenError | undefined
}
