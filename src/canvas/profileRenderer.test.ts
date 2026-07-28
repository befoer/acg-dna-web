import { describe, expect, it } from 'vitest'

import {
  isProfileCustomTextResizeHandleHit,
  type ProfileCustomTextRegion,
} from './profileRenderer'

const region: ProfileCustomTextRegion = {
  id: 'text-one',
  left: 100,
  top: 100,
  width: 100,
  height: 50,
  rotation: 0,
}

describe('isProfileCustomTextResizeHandleHit', () => {
  it('recognizes each padded corner and ignores the text body', () => {
    expect(isProfileCustomTextResizeHandleHit(region, 94, 94, 4)).toBe(true)
    expect(isProfileCustomTextResizeHandleHit(region, 206, 156, 4)).toBe(true)
    expect(isProfileCustomTextResizeHandleHit(region, 150, 125, 4)).toBe(false)
  })

  it('uses the rendered rotation when checking a corner', () => {
    const rotated = { ...region, rotation: 90 }
    expect(isProfileCustomTextResizeHandleHit(rotated, 181, 69, 4)).toBe(true)
    expect(isProfileCustomTextResizeHandleHit(rotated, 150, 125, 4)).toBe(false)
  })
})
