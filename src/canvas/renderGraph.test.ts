import { describe, expect, it, vi } from 'vitest'

import { createStarterGraph, type GraphLayoutMode } from '../domain/graph'
import type { LocalImageAsset } from '../editor/assets'
import { createGraphLayout, renderGraph } from './renderGraph'

function createCanvasContext() {
  const gradient = { addColorStop: vi.fn() }
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    strokeRect: vi.fn(),
    measureText: vi.fn(() => ({
      width: 20,
      actualBoundingBoxAscent: 15,
      actualBoundingBoxDescent: 5,
    })),
    createLinearGradient: vi.fn(() => gradient),
  } as unknown as CanvasRenderingContext2D
}

describe('graph layout content bounds', () => {
  it.each<GraphLayoutMode>(['packing', 'gravity'])(
    'keeps %s roots inside the configured label range',
    (layoutMode) => {
      const document = createStarterGraph('2026-07-16T00:00:00.000Z')
      document.canvas.layoutMode = layoutMode
      document.canvas.contentBounds = {
        left: 0.2,
        top: 0.25,
        right: 0.72,
        bottom: 0.8,
        rotation: 12,
      }

      const layout = createGraphLayout(document)
      const left = document.canvas.width * 0.2
      const top = document.canvas.height * 0.25
      const right = document.canvas.width * 0.72
      const bottom = document.canvas.height * 0.8
      const occupiedLeft = Math.min(
        ...layout.roots.map((root) => root.x - root.radius),
      )
      const occupiedTop = Math.min(
        ...layout.roots.map((root) => root.y - root.radius),
      )
      const occupiedRight = Math.max(
        ...layout.roots.map((root) => root.x + root.radius),
      )
      const occupiedBottom = Math.max(
        ...layout.roots.map((root) => root.y + root.radius),
      )

      for (const root of layout.roots) {
        expect(root.x - root.radius).toBeGreaterThanOrEqual(left - 0.05)
        expect(root.y - root.radius).toBeGreaterThanOrEqual(top - 0.05)
        expect(root.x + root.radius).toBeLessThanOrEqual(right + 0.05)
        expect(root.y + root.radius).toBeLessThanOrEqual(bottom + 0.05)
      }
      expect(
        Math.max(
          (occupiedRight - occupiedLeft) / (right - left),
          (occupiedBottom - occupiedTop) / (bottom - top),
        ),
      ).toBeGreaterThan(0.999)
    },
  )

  it('applies global text and image visibility while rendering', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.canvas.templateId = 'endfield'
    document.canvas.labelSettings.showCategoryText = false
    document.canvas.labelSettings.showLabelText = false
    document.canvas.labelSettings.showImages = false
    document.categories[0]!.attributes[0]!.children[0]!.imageAssetId =
      'asset-render'
    const image = {
      naturalWidth: 64,
      naturalHeight: 64,
      width: 64,
      height: 64,
    } as HTMLImageElement
    const blob = new Blob(['image'], { type: 'image/png' })
    const asset: LocalImageAsset = {
      id: 'asset-render',
      fileName: 'render.png',
      mimeType: 'image/png',
      byteLength: blob.size,
      blob,
      objectUrl: 'blob:render',
      image,
    }
    const hiddenContext = createCanvasContext()

    renderGraph(hiddenContext, document, { [asset.id]: asset })
    expect(hiddenContext.fillText).not.toHaveBeenCalled()
    expect(hiddenContext.drawImage).not.toHaveBeenCalled()

    document.canvas.labelSettings.showCategoryText = true
    document.canvas.labelSettings.showLabelText = true
    document.canvas.labelSettings.showImages = true
    const visibleContext = createCanvasContext()
    renderGraph(visibleContext, document, { [asset.id]: asset })
    expect(visibleContext.fillText).toHaveBeenCalled()
    expect(visibleContext.drawImage).toHaveBeenCalled()
  })

  it('can leave node text to the SVG variable-font overlay', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.canvas.templateId = 'endfield'
    const context = createCanvasContext()

    renderGraph(context, document, {}, { drawNodeText: false })

    expect(context.fillText).not.toHaveBeenCalled()
  })

  it('renders the selected APP profile sub-template', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.canvas.templateId = 'cute-pink'
    document.profile.subTemplateId = 'cute_pink_2'
    document.profile.nickname = '本地作者'
    const context = createCanvasContext()

    renderGraph(context, document, {})

    expect(context.fillText).toHaveBeenCalledWith(
      '本地作者',
      expect.any(Number),
      expect.any(Number),
    )
  })
})
