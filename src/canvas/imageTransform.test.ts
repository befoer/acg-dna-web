import { describe, expect, it, vi } from 'vitest'

import {
  calculateContainedImagePlacement,
  calculateTransformedImagePlacement,
  drawTransformedImageContain,
  drawTransformedImageCover,
  normalizeImageTransform,
  panImageTransform,
  zoomImageTransform,
} from './imageTransform'

describe('non-destructive local image transform', () => {
  it('uses cover sizing and keeps the default image centered', () => {
    const placement = calculateTransformedImagePlacement(
      200,
      100,
      10,
      20,
      100,
      100,
    )

    expect(placement).toMatchObject({
      centerX: 60,
      centerY: 70,
      width: 200,
      height: 100,
      rotationRadians: 0,
    })
  })

  it('keeps a square AniList source contained in a portrait workspace', () => {
    const placement = calculateContainedImagePlacement(400, 400, 0, 0, 324, 444)

    expect(placement.width).toBeCloseTo(324, 5)
    expect(placement.height).toBeCloseTo(324, 5)
    expect(placement.centerX).toBeCloseTo(162, 5)
    expect(placement.centerY).toBeCloseTo(222, 5)
  })

  it('enlarges a square source enough to cover rotated square corners', () => {
    const placement = calculateTransformedImagePlacement(
      100,
      100,
      0,
      0,
      100,
      100,
      { zoom: 1, offsetX: 0, offsetY: 0, rotation: 45 },
    )

    expect(placement.width).toBeCloseTo(Math.SQRT2 * 100, 5)
    expect(placement.height).toBeCloseTo(Math.SQRT2 * 100, 5)
    expect(placement.rotationRadians).toBeCloseTo(Math.PI / 4, 5)
  })

  it('clamps persisted values to the supported editor range', () => {
    expect(
      normalizeImageTransform({
        zoom: 9,
        offsetX: -4,
        offsetY: 2,
        rotation: 800,
      }),
    ).toEqual({
      zoom: 4,
      offsetX: -1,
      offsetY: 1,
      rotation: 180,
    })
  })

  it('converts preview dragging into normalized image offsets', () => {
    expect(
      panImageTransform(
        { zoom: 2, offsetX: 0, offsetY: 0, rotation: 0 },
        30,
        -15,
        300,
      ),
    ).toEqual({
      zoom: 2,
      offsetX: 0.2,
      offsetY: -0.1,
      rotation: 0,
    })
  })

  it('maps preview dragging back into image axes after rotation', () => {
    const result = panImageTransform(
      { zoom: 2, offsetX: 0, offsetY: 0, rotation: 90 },
      30,
      0,
      300,
    )

    expect(result.offsetX).toBeCloseTo(0)
    expect(result.offsetY).toBeCloseTo(-0.2)
  })

  it('clamps gesture zoom to the editor range', () => {
    expect(
      zoomImageTransform({ zoom: 2, offsetX: 0, offsetY: 0, rotation: 0 }, 10)
        .zoom,
    ).toBe(4)
    expect(
      zoomImageTransform({ zoom: 2, offsetX: 0, offsetY: 0, rotation: 0 }, 0.01)
        .zoom,
    ).toBe(1)
  })

  it('draws contained images through the same transform path', () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const image = {
      naturalWidth: 400,
      naturalHeight: 400,
      width: 400,
      height: 400,
    } as HTMLImageElement

    drawTransformedImageContain(context, image, 0, 0, 324, 444)

    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      expect.any(Number),
      expect.any(Number),
      324,
      324,
    )
  })

  it('draws through the same translate and rotate path used by export', () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const image = {
      naturalWidth: 200,
      naturalHeight: 100,
      width: 200,
      height: 100,
    } as HTMLImageElement

    drawTransformedImageCover(context, image, 0, 0, 100, 100, {
      zoom: 2,
      offsetX: 0.5,
      offsetY: -0.25,
      rotation: 90,
    })

    expect(context.translate).toHaveBeenCalled()
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2)
    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    )
  })
})
