/** 插件自己抛的、带机器可读 code 的错误。宿主工具与 MCP 都靠 code 区分失败原因。 */
export class ImageGenError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ImageGenError'
    this.code = code
  }
}

export function isImageGenError(error: unknown): error is ImageGenError {
  return error instanceof ImageGenError
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
