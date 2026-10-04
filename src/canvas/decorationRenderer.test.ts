import { describe, expect, it } from 'vitest'

import { createStarterGraph } from '../domain/graph'
import type { LocalImageAsset } from '../editor/assets'
import {
  createDecorationFrameRegions,
  createDecorationImageRegions,
  hitTestDecorationFrame,
  hitTestDecorationImage,
  isDecorationFrameResizeHandleHit,
  isDecorationResizeHandleHit,
  isDecorationRotationHandleHit,
} from './decorationRenderer'

function createAsset(): LocalImageAsset {
  const blob = new Blob(['image'], { type: 'image/png' })
  return {
    id: 'asset-decoration',
    fileName: 'decoration.png',
    mimeType: 'image/png',
    byteLength: blob.size,
    blob,
    objectUrl: 'blob:decoration',
    image: {
      naturalWidth: 400,
      naturalHeight: 200,
      width: 400,
      height: 200,
    } as HTMLImageElement,
  }
}

describe('decoration image canvas interaction', () => {
  it('creates an aspect-ratio-preserving region and hit-tests rotation', () => {
    const document = createStarterGraph('2026-07-17T00:00:00.000Z')
    const asset = createAsset()
    document.decoration.images = [
      {
        id: 'decoration-image-one',
        name: asset.fileName,
        assetId: asset.id,
        visible: true,
        x: 0.5,
        y: 0.4,
        size: 0.4,
        rotation: 30,
        opacity: 1,
      },
    ]

    const regions = createDecorationImageRegions(document, {
      [asset.id]: asset,
    })

    expect(regions[0]).toMatchObject({
      id: 'decoration-image-one',
      centerX: document.canvas.width * 0.5,
      centerY: document.canvas.height * 0.4,
      width: document.canvas.width * 0.4,
      height: document.canvas.width * 0.2,
      rotation: 30,
    })
    expect(
      hitTestDecorationImage(
        regions,
        document.canvas.width * 0.5,
        document.canvas.height * 0.4,
      ),
    ).toBe('decoration-image-one')
    expect(hitTestDecorationImage(regions, 0, 0)).toBeNull()
  })

  it('detects the rotated bottom-right resize handle', () => {
    const region = {
      id: 'decoration-image-one',
      centerX: 500,
      centerY: 400,
      width: 300,
      height: 180,
      rotation: 0,
    }

    expect(isDecorationResizeHandleHit(region, 650, 490, 18)).toBe(true)
    expect(isDecorationResizeHandleHit(region, 350, 310, 18)).toBe(false)
  })

  it('uses the supplied front-to-back order for overlapping images', () => {
    const regions = [
      {
        id: 'back',
        centerX: 100,
        centerY: 100,
        width: 80,
        height: 80,
        rotation: 0,
      },
      {
        id: 'front',
        centerX: 100,
        centerY: 100,
        width: 80,
        height: 80,
        rotation: 0,
      },
    ]

    expect(hitTestDecorationImage(regions, 100, 100, ['front', 'back'])).toBe(
      'front',
    )
  })

  it('creates editable frame regions and detects corner handles', () => {
    const document = createStarterGraph('2026-07-17T00:00:00.000Z')
    document.decoration.frames = [
      {
        id: 'frame-one',
        name: '矩形1',
        visible: true,
        width: 0.5,
        height: 0.4,
        x: 0.5,
        y: 0.5,
        cornerRadius: 20,
        fillColor: '#ffffff',
        strokeWidth: 2,
        strokeColor: '#000000',
        rotation: 0,
      },
    ]
    const region = createDecorationFrameRegions(document)[0]!

    expect(
      hitTestDecorationFrame([region], region.centerX, region.centerY),
    ).toBe('frame-one')
    expect(
      isDecorationFrameResizeHandleHit(
        region,
        region.centerX - region.width / 2,
        region.centerY - region.height / 2,
        18,
      ),
    ).toBe(true)
  })

  it('detects the image rotation handle above the selection', () => {
    const region = {
      id: 'image-one',
      centerX: 500,
      centerY: 400,
      width: 300,
      height: 180,
      rotation: 0,
    }

    expect(isDecorationRotationHandleHit(region, 500, 276, 18)).toBe(true)
  })
})
