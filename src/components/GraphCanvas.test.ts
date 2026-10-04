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

  it.each([
    ['375px mobile', 331, 250],
    ['768px tablet', 716, 360],
    ['1024px desktop', 580, 680],
    ['1440px desktop', 950, 900],
  ])('keeps the whole portrait canvas visible at %s', (_, width, height) => {
    const scale = computeFitScale(width, height, 1380, 2000)
    expect(1380 * scale).toBeLessThanOrEqual(width)
    expect(2000 * scale).toBeLessThanOrEqual(height)
  })
})
