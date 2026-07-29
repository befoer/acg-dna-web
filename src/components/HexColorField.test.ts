import { describe, expect, it } from 'vitest'

import { normalizeHexColor } from './hexColor'

describe('normalizeHexColor', () => {
  it('accepts six-digit values with a hash prefix', () => {
    expect(normalizeHexColor('#FFFFFF')).toBe('#ffffff')
  })

  it('expands three-digit shorthand values', () => {
    expect(normalizeHexColor('0Af')).toBe('#00aaff')
  })

  it('rejects invalid color values', () => {
    expect(normalizeHexColor('#FFFF')).toBeNull()
    expect(normalizeHexColor('blue')).toBeNull()
  })
})
