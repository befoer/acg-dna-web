import { describe, expect, it } from 'vitest'

import { nudgeCanvasPosition } from './canvasNudge'

describe('canvas keyboard nudge', () => {
  it('converts pixel movement to normalized canvas coordinates', () => {
    expect(nudgeCanvasPosition({ x: 0.5, y: 0.5 }, 10, -1, 1000, 500)).toEqual({
      x: 0.51,
      y: 0.498,
    })
  })

  it('keeps the center inside the canvas', () => {
    expect(
      nudgeCanvasPosition({ x: 0.002, y: 0.998 }, -10, 10, 1000, 500),
    ).toEqual({
      x: 0,
      y: 1,
    })
  })
})
