import { describe, expect, it, vi } from 'vitest'

import { createStarterGraph, type GraphLayoutMode } from '../domain/graph'
import type { LocalImageAsset } from '../editor/assets'
import { createGraphLayout, renderGraph } from './renderGraph'

function createCanvasContext() {
  const gradient = { addColorStop: vi.fn() }
  const globalAlphaValues: number[] = []
  let globalAlpha = 1
  return {
    get globalAlpha() {
      return globalAlpha
    },
    set globalAlpha(value: number) {
      globalAlpha = value
      globalAlphaValues.push(value)
    },
    globalAlphaValues,
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
    document.categories[0]!.attributes[0]!.children[0]!.imageTransform = {
      zoom: 1.5,
      offsetX: 0.2,
      offsetY: -0.3,
      rotation: 30,
    }
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
    expect(visibleContext.rotate).toHaveBeenCalledWith(Math.PI / 6)
  })

  it('can leave node text to the SVG variable-font overlay', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.canvas.templateId = 'endfield'
    const context = createCanvasContext()

    renderGraph(context, document, {}, { drawNodeText: false })

    expect(context.fillText).not.toHaveBeenCalled()
  })

  it('renders migrated APP decoration presets on their configured side of data', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.decoration.presetIds = ['fox', 'nya-shop']
    const fox = {
      naturalWidth: 1280,
      naturalHeight: 1847,
    } as HTMLImageElement
    const nyaShop = {
      naturalWidth: 1280,
      naturalHeight: 1847,
    } as HTMLImageElement
    const context = createCanvasContext()

    renderGraph(
      context,
      document,
      {},
      {
        decorationPresetAssets: { fox, 'nya-shop': nyaShop },
      },
    )

    expect(context.drawImage).toHaveBeenCalledWith(
      nyaShop,
      0,
      0,
      document.canvas.width,
      document.canvas.height,
    )
    expect(context.drawImage).toHaveBeenCalledWith(
      fox,
      0,
      0,
      document.canvas.width,
      document.canvas.height,
    )
    const calls = (
      context.drawImage as unknown as {
        mock: { calls: unknown[][] }
      }
    ).mock.calls
    expect(calls.findIndex((call) => call[0] === nyaShop)).toBeLessThan(
      calls.findIndex((call) => call[0] === fox),
    )
  })

  it('can hide the unified data layer without hiding decorations', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.decoration.presetIds = ['fox']
    document.decoration.hiddenLayerIds = ['data']
    const fox = {
      naturalWidth: 1280,
      naturalHeight: 1847,
    } as HTMLImageElement
    const context = createCanvasContext()

    renderGraph(
      context,
      document,
      {},
      {
        decorationPresetAssets: { fox },
      },
    )

    expect(context.fillText).not.toHaveBeenCalled()
    expect(context.drawImage).toHaveBeenCalledWith(
      fox,
      0,
      0,
      document.canvas.width,
      document.canvas.height,
    )
  })

  it('renders a free local decoration image with its element transform', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.decoration.images = [
      {
        id: 'decoration-image-one',
        name: '贴纸.png',
        assetId: 'asset-free-decoration',
        visible: true,
        x: 0.7,
        y: 0.25,
        size: 0.5,
        rotation: 30,
        opacity: 0.6,
      },
    ]
    const blob = new Blob(['image'], { type: 'image/png' })
    const asset: LocalImageAsset = {
      id: 'asset-free-decoration',
      fileName: '贴纸.png',
      mimeType: 'image/png',
      byteLength: blob.size,
      blob,
      objectUrl: 'blob:free-decoration',
      image: {
        naturalWidth: 400,
        naturalHeight: 200,
        width: 400,
        height: 200,
      } as HTMLImageElement,
    }
    const context = createCanvasContext()

    renderGraph(context, document, { [asset.id]: asset })

    expect(context.translate).toHaveBeenCalledWith(
      document.canvas.width * 0.7,
      document.canvas.height * 0.25,
    )
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 6)
    expect(
      (
        context as unknown as {
          globalAlphaValues: number[]
        }
      ).globalAlphaValues,
    ).toContain(0.6)
    expect(context.drawImage).toHaveBeenCalledWith(
      asset.image,
      -document.canvas.width * 0.25,
      -document.canvas.width * 0.125,
      document.canvas.width * 0.5,
      document.canvas.width * 0.25,
    )
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
