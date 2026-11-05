/**
 * 硅基流动（SiliconFlow）实现 —— 当前默认、也是唯一已实测的平台。
 *
 * 关键约束（2026-11 v3.2 实测）：
 *   /v1/images/generations 会**接收但静默忽略** num_images / seed / output_format
 *   等字段。所以这里的 buildRequest 只写四个字段，其余一个都不发。
 */
import { ImageGenError } from '../errors.js'
import { SIGNUP_URL } from '../config.js'
import type { ImageProvider, ProviderInput, ProviderRequest } from './types.js'

export const API_ENDPOINT = 'https://api.siliconflow.cn/v1/images/generations'

/** 免费模型名：写死，不允许调用方覆盖（防止误调收费模型）。 */
export const FREE_MODEL = 'Kwai-Kolors/Kolors'

/** 画幅 → 像素。 */
export const ASPECT_RATIO_SIZES: Readonly<Record<string, string>> = {
  '1:1': '1024x1024',
  '3:4': '768x1024',
  '4:3': '1024x768',
  '9:16': '576x1024',
  '16:9': '1024x576',
}

function extractApiMessage(bodyText: string): string | undefined {
  const text = bodyText.trim()
  if (text === '') return undefined
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>
      for (const candidate of [record.message, record.msg, record.error, record.detail]) {
        if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim().slice(0, 300)
        if (typeof candidate === 'object' && candidate !== null) {
          const nested = (candidate as Record<string, unknown>).message
          if (typeof nested === 'string') return nested.slice(0, 300)
        }
      }
    }
  } catch {
    // 不是 JSON：原样截断。
  }
  return text.slice(0, 300)
}

export const siliconflowProvider: ImageProvider = {
  id: 'siliconflow',
  label: '硅基流动',
  defaultModel: FREE_MODEL,
  apiKeyEnv: 'SILICONFLOW_API_KEY',
  signupUrl: SIGNUP_URL,
  aspectRatios: ASPECT_RATIO_SIZES,
  ignoredParams: [
    'num_images',
    'seed',
    'output_format',
    'num_inference_steps',
    'guidance_scale',
    'batch_size',
  ],

  buildRequest(input: ProviderInput, apiKey: string): ProviderRequest {
    const body: Record<string, unknown> = {
      model: FREE_MODEL,
      prompt: input.prompt,
      image_size: input.imageSize,
    }
    if (input.negativePrompt !== undefined && input.negativePrompt !== '') {
      body.negative_prompt = input.negativePrompt
    }
    return {
      url: API_ENDPOINT,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'dsh-api-free-image',
      },
      body,
    }
  },

  parseImageUrl(payload: unknown): string {
    const images =
      typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).images : undefined
    const first = Array.isArray(images) ? images[0] : undefined
    const url =
      typeof first === 'object' && first !== null ? (first as Record<string, unknown>).url : undefined
    if (typeof url !== 'string' || url === '') {
      const raw = JSON.stringify(payload)?.slice(0, 400) ?? '(空响应)'
      throw new ImageGenError('BAD_RESPONSE', `❌ 接口返回里没有图片地址，原始响应：${raw}`)
    }
    return url
  },

  translateHttpError(status: number, bodyText: string): ImageGenError | undefined {
    const detail = extractApiMessage(bodyText)
    const suffix = detail === undefined ? '' : `\n服务端原文：${detail}`
    switch (status) {
      case 401:
        return new ImageGenError(
          'HTTP_401',
          '❌ API Key 无效或已失效（401）。请在 DSH 设置 → 插件 → ' +
            'API免费生图 卡片里重新填写 Key，或检查对应的环境变量。' +
            suffix,
        )
      case 402:
        return new ImageGenError(
          'HTTP_402',
          '💸 余额不足（402）。硅基流动即使跑免费模型也要求账户余额 ≥ 0（新号赠送额度扣完就会 402）。' +
            '去计费页充 ¥1 就能继续用。' +
            suffix,
        )
      case 429:
        return new ImageGenError(
          'HTTP_429',
          '⏳ 触发官方限速（429）。免费模型大约 2 张/分钟，请等 1 分钟再试。' +
            '（本插件自带 IPM=2 的本地限额，正常不会先撞到官方限速。）' +
            suffix,
        )
      case 403:
        return new ImageGenError(
          'HTTP_403',
          '⛔ 没有权限（403）。请确认账号已开通该模型服务，且 Key 属于该账号。' + suffix,
        )
      case 400:
      case 422:
        return new ImageGenError(
          'HTTP_400',
          `🙅 请求被拒绝（${status}）：提示词或尺寸不合规，换一种说法再试。` + suffix,
        )
      default:
        if (status >= 500) {
          return new ImageGenError(
            'HTTP_5XX',
            `🛠 服务端出错（${status}），通常是对方的临时故障，过几分钟再试。` + suffix,
          )
        }
        return undefined
    }
  },
}
