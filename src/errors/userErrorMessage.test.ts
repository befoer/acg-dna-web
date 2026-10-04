import { describe, expect, it } from 'vitest'

import { userErrorMessage } from './userErrorMessage'

describe('userErrorMessage', () => {
  it('keeps existing Chinese business errors', () => {
    expect(userErrorMessage(new Error('图片文件过大'), '操作失败')).toBe(
      '图片文件过大',
    )
  })

  it('translates browser network errors', () => {
    expect(userErrorMessage(new TypeError('Failed to fetch'), '搜索失败')).toBe(
      '网络连接失败，请检查网络后重试',
    )
  })

  it('translates IndexedDB errors without exposing English internals', () => {
    expect(
      userErrorMessage(
        new DOMException(
          "Failed to execute 'transaction' on 'IDBDatabase'",
          'InvalidStateError',
        ),
        '保存失败',
      ),
    ).toBe('浏览器本地数据暂时无法访问，请刷新页面后重试')
  })

  it('uses a Chinese fallback for unknown English errors', () => {
    expect(userErrorMessage(new Error('Unknown failure'), '导出失败')).toBe(
      '导出失败',
    )
  })
})
