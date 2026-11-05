/**
 * Provider 注册表。
 *
 * 加一个平台 = 写一个 `<platform>.ts` 实现 ImageProvider，在这里加一行。
 * 想让某个平台成为默认，改 `src/config.ts` 的 DEFAULT_PROVIDER_ID。
 */
import { DEFAULT_PROVIDER_ID } from '../config.js'
import { siliconflowProvider } from './siliconflow.js'
import type { ImageProvider } from './types.js'

const REGISTRY: Readonly<Record<string, ImageProvider>> = {
  [siliconflowProvider.id]: siliconflowProvider,
}

export const PROVIDER_IDS = Object.keys(REGISTRY)

export function getProvider(id: string = DEFAULT_PROVIDER_ID): ImageProvider {
  const provider = REGISTRY[id]
  if (provider === undefined) {
    throw new Error(`未知的生图平台：${id}（已注册：${PROVIDER_IDS.join(', ')}）`)
  }
  return provider
}

export function listProviders(): readonly ImageProvider[] {
  return Object.values(REGISTRY)
}

export { siliconflowProvider }
export type { ImageProvider, ProviderInput, ProviderRequest } from './types.js'
