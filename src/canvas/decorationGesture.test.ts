import { describe, expect, it } from 'vitest'

import { transformDecorationGesture } from './decorationGesture'

const IMAGE = { x: 0.5, y: 0.5, size: 0.3, rotation: 0 }

describe('decoration image multi-touch gesture', () => {
  it('combines midpoint movement, pinch scaling, and rotation', () => {
    const transformed = transformDecorationGesture(
      IMAGE,
      { first: { x: 400, y: 500 }, second: { x: 600, y: 500 } },
      { first: { x: 500, y: 400 }, second: { x: 500, y: 800 } },
      1000,
      1000,
    )

    expect(transformed.x).toBeCloseTo(0.5)
    expect(transformed.y).toBeCloseTo(0.6)
    expect(transformed.size).toBeCloseTo(0.6)
    expect(transformed.rotation).toBeCloseTo(90)
  })

  it('keeps position, size, and rotation inside persisted limits', () => {
    expect(
      transformDecorationGesture(
        { x: 0.95, y: 0.95, size: 1.4, rotation: 170 },
        { first: { x: 0, y: 0 }, second: { x: 10, y: 0 } },
        { first: { x: 900, y: 900 }, second: { x: 900, y: 1100 } },
        1000,
        1000,
      ),
    ).toMatchObject({ x: 1, y: 1, size: 1.5, rotation: -100 })
  })
})
