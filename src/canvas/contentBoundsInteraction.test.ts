import { describe, expect, it } from 'vitest'

import type { GraphContentBounds } from '../domain/graph'
import {
  hitTestContentBounds,
  transformContentBounds,
} from './contentBoundsInteraction'

const BOUNDS: GraphContentBounds = {
  left: 0.2,
  top: 0.2,
  right: 0.8,
  bottom: 0.8,
  rotation: 0,
}

describe('content bounds canvas interaction', () => {
  it('prioritizes corners, borders, then the movable center', () => {
    expect(hitTestContentBounds(BOUNDS, 1000, 1000, 200, 200, 20)).toBe(
      'top-left',
    )
    expect(hitTestContentBounds(BOUNDS, 1000, 1000, 500, 200, 20)).toBe('top')
    expect(hitTestContentBounds(BOUNDS, 1000, 1000, 500, 500, 20)).toBe(
      'center',
    )
    expect(hitTestContentBounds(BOUNDS, 1000, 1000, 50, 50, 20)).toBe('none')
  })

  it('hit-tests a rotated frame in its local coordinate space', () => {
    const rotated = { ...BOUNDS, rotation: 90 }
    expect(hitTestContentBounds(rotated, 1000, 1000, 800, 200, 20)).toBe(
      'top-left',
    )
  })

  it('moves the whole range while preserving size and canvas limits', () => {
    expect(
      transformContentBounds(BOUNDS, 'center', 1000, 1000, 500, 500),
    ).toEqual({
      left: 0.4,
      top: 0.4,
      right: 1,
      bottom: 1,
      rotation: 0,
    })
  })

  it('resizes from the dragged corner and enforces the minimum size', () => {
    expect(
      transformContentBounds(BOUNDS, 'top-left', 1000, 1000, 500, 500),
    ).toEqual({
      left: 0.6,
      top: 0.6,
      right: 0.8,
      bottom: 0.8,
      rotation: 0,
    })
  })
})
