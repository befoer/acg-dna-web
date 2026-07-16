import { describe, expect, it } from 'vitest'

import { computeFitScale } from './canvasScale'

describe('canvas fit scale', () => {
  it('uses the limiting viewport dimension without stretching', () => {
    expect(computeFitScale(1000, 500, 1000, 1000)).toBe(0.5)
    expect(computeFitScale(500, 1000, 1000, 1000)).toBe(0.5)
    expect(computeFitScale(690, 1000, 1380, 2000)).toBe(0.5)
  })

  it('returns a safe scale before the viewport has been measured', () => {
    expect(computeFitScale(0, 500, 1380, 2000)).toBe(1)
    expect(computeFitScale(500, 0, 1380, 2000)).toBe(1)
  })
})
