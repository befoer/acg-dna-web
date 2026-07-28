const CHINESE_TEXT_PATTERN = /[\u3400-\u9fff]/u

function errorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message.trim() }
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as { name?: unknown; message?: unknown }
    return {
      name: typeof record.name === 'string' ? record.name : '',
      message: typeof record.message === 'string' ? record.message.trim() : '',
    }
  }
  return {
    name: '',
    message: typeof error === 'string' ? error.trim() : '',
  }
}

export function userErrorMessage(error: unknown, fallback: string): string {
  const { name, message } = errorDetails(error)

  if (message && CHINESE_TEXT_PATTERN.test(message)) return message

  if (name === 'AbortError') return '操作已取消'
  if (name === 'QuotaExceededError') {
    return '浏览器存储空间不足，请移除部分图片后重试'
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '浏览器未允许此操作，请检查网站权限后重试'
  }
  if (
    name === 'InvalidStateError' ||
    name === 'TransactionInactiveError' ||
    name === 'DataCloneError' ||
    /indexeddb|idbdatabase|object ?store|transaction/iu.test(message)
  ) {
    return '浏览器本地数据暂时无法访问，请刷新页面后重试'
  }
  if (
    name === 'SyntaxError' ||
    /unexpected token|unexpected end of json|json/iu.test(message)
  ) {
    return '收到的数据格式无效，请稍后重试'
  }
  if (
    name === 'TypeError' ||
    /failed to fetch|networkerror|network request failed|load failed/iu.test(
      message,
    )
  ) {
    return '网络连接失败，请检查网络后重试'
  }

  return fallback
}
