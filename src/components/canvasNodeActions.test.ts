import { describe, expect, it } from 'vitest'

import { computeCanvasNodeActionGeometry } from './canvasNodeActions'

function distanceBetween(
  radius: number,
  leftAngle: number,
  rightAngle: number,
): number {
  const delta = ((rightAngle - leftAngle) * Math.PI) / 180
  return 2 * radius * Math.sin(Math.abs(delta) / 2)
}

describe('canvas node action geometry', () => {
  it('keeps adjacent buttons at a stable distance for small and large nodes', () => {
    for (const nodeRadius of [12, 60, 220]) {
      const geometry = computeCanvasNodeActionGeometry(nodeRadius)
      expect(
        distanceBetween(
          geometry.distance,
          geometry.angles[0],
          geometry.angles[1],
        ),
      ).toBeCloseTo(48, 5)
      expect(
        distanceBetween(
          geometry.distance,
          geometry.angles[1],
          geometry.angles[2],
        ),
      ).toBeCloseTo(48, 5)
    }
  })

  it('widens the angle for small nodes and tightens it for large nodes', () => {
    const small = computeCanvasNodeActionGeometry(12)
    const large = computeCanvasNodeActionGeometry(220)

    expect(small.distance).toBe(94)
    expect(small.angles[1] - small.angles[0]).toBeGreaterThan(
      large.angles[1] - large.angles[0],
    )
    expect(small.angles[1]).toBe(-45)
    expect(large.angles[1]).toBe(-45)
  })
})
