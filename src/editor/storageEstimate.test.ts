import { describe, expect, it } from 'vitest'

import { formatStorageBytes } from './storageEstimate'

describe('browser storage estimate formatting', () => {
  it('uses readable binary units', () => {
    expect(formatStorageBytes(0)).toBe('0 B')
    expect(formatStorageBytes(1024)).toBe('1 KB')
    expect(formatStorageBytes(12.5 * 1024 * 1024)).toBe('12.5 MB')
    expect(formatStorageBytes(3 * 1024 * 1024 * 1024)).toBe('3 GB')
  })
})
