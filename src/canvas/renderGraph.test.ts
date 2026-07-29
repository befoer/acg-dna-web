import { describe, expect, it, vi } from 'vitest'

import { createStarterGraph, type GraphLayoutMode } from '../domain/graph'
import type { LocalImageAsset } from '../editor/assets'
import type { LayoutNode } from '../layout/basicLayout'
import { createGraphLayout, renderGraph } from './renderGraph'

function assertRootsDoNotOverlap(roots: LayoutNode[]): void {
  for (let leftIndex = 0; leftIndex < roots.length; leftIndex += 1) {
    const left = roots[leftIndex]
    if (!left) continue
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < roots.length;
      rightIndex += 1
    ) {
      const right = roots[rightIndex]
      if (!right) continue
      const distance = Math.hypot(right.x - left.x, right.y - left.y)
      expect(
        distance + 0.05,
        `${left.id}/${right.id} overlap: ${(left.radius + right.radius - distance).toFixed(2)}`,
      ).toBeGreaterThanOrEqual(left.radius + right.radius)
    }
  }
}

function assertRootsFormContactCluster(roots: LayoutNode[]): void {
  if (roots.length <= 1) return
  const connected = new Set<number>([0])
  let changed = true

  while (changed) {
    changed = false
    for (let leftIndex = 0; leftIndex < roots.length; leftIndex += 1) {
      if (!connected.has(leftIndex)) continue
      const left = roots[leftIndex]
      if (!left) continue
      for (let rightIndex = 0; rightIndex < roots.length; rightIndex += 1) {
        if (connected.has(rightIndex)) continue
        const right = roots[rightIndex]
        if (!right) continue
        const surfaceGap =
          Math.hypot(right.x - left.x, right.y - left.y) -
          (left.radius + right.radius)
        if (surfaceGap <= 3) {
          connected.add(rightIndex)
          changed = true
        }
      }
    }
  }

  const surfaceGaps = roots.flatMap((left, leftIndex) =>
    roots
      .slice(leftIndex + 1)
      .map(
        (right) =>
          Math.hypot(right.x - left.x, right.y - left.y) -
          (left.radius + right.radius),
      ),
  )
  expect(
    connected.size,
    `surface gaps: ${surfaceGaps.map((gap) => gap.toFixed(2)).join(', ')}`,
  ).toBe(roots.length)
}

function assertTopLabelsDoNotOverlapRoots(roots: LayoutNode[]): void {
  for (const owner of roots) {
    if (owner.children.length === 0 || owner.name.trim().length === 0) continue
    const fontSize = owner.radius * 0.18
    const characterCount = Array.from(owner.name).length
    const estimatedWidth =
      Math.min(characterCount, 6) * fontSize + fontSize * 0.35
    const halfWidth = estimatedWidth / 2 + owner.radius * 0.02
    const halfHeight = owner.radius * 0.04
    const centerY = owner.y - owner.radius - owner.radius * 0.02

    for (const other of roots) {
      if (other === owner) continue
      const closestX = Math.min(
        owner.x + halfWidth,
        Math.max(owner.x - halfWidth, other.x),
      )
      const closestY = Math.min(
        centerY + halfHeight,
        Math.max(centerY - halfHeight, other.y),
      )
      const distance = Math.hypot(other.x - closestX, other.y - closestY)
      expect(
        distance + 0.05,
        `${owner.id} label overlaps ${other.id}: ${(other.radius - distance).toFixed(2)}`,
      ).toBeGreaterThanOrEqual(other.radius)
    }
  }
}

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
      if (layoutMode === 'packing') {
        expect(
          Math.max(
            (occupiedRight - occupiedLeft) / (right - left),
            (occupiedBottom - occupiedTop) / (bottom - top),
          ),
        ).toBeGreaterThan(0.999)
      } else {
        expect(occupiedBottom).toBeCloseTo(bottom, 1)
        expect(
          Math.min(
            (occupiedRight - occupiedLeft) / (right - left),
            (occupiedBottom - occupiedTop) / (bottom - top),
          ),
        ).toBeGreaterThan(0.85)
        expect(
          Math.max(
            (occupiedRight - occupiedLeft) / (right - left),
            (occupiedBottom - occupiedTop) / (bottom - top),
          ),
        ).toBeGreaterThan(0.999)
      }
    },
  )

  it('keeps extreme four-category projects separated and space-filling after final canvas fitting', () => {
    for (let seed = 0; seed < 24; seed += 1) {
      const document = createStarterGraph('2026-07-23T00:00:00.000Z')
      document.id = `graph-extreme-${seed}`
      document.canvas.layoutMode = 'gravity'
      document.canvas.contentBounds = {
        left: 0,
        top: 0,
        right: 1,
        bottom: 1,
        rotation: 0,
      }
      document.categories = [
        ...document.categories.slice(0, 3).map((category, index) => ({
          ...category,
          value: [100, 70, 20][index]!,
          appearance: { fillFactor: [1.5, 1, 0.8][index]! },
          attributes: [],
        })),
        {
          id: 'category-fourth',
          name: '第四分类',
          value: 10,
          color: '#6C8FF0',
          hidden: false,
          appearance: { fillFactor: 0.5 },
          attributes: [],
        },
      ]

      const layout = createGraphLayout(document)
      const left = Math.min(...layout.roots.map((root) => root.x - root.radius))
      const top = Math.min(...layout.roots.map((root) => root.y - root.radius))
      const right = Math.max(
        ...layout.roots.map((root) => root.x + root.radius),
      )
      const bottom = Math.max(
        ...layout.roots.map((root) => root.y + root.radius),
      )
      const occupiedWidth = right - left
      const occupiedHeight = bottom - top

      assertRootsDoNotOverlap(layout.roots)
      assertRootsFormContactCluster(layout.roots)
      expect(bottom).toBeCloseTo(document.canvas.height, 1)
      expect(occupiedWidth / document.canvas.width).toBeGreaterThanOrEqual(0.99)
      expect(occupiedHeight / document.canvas.height).toBeGreaterThanOrEqual(
        0.82,
      )
    }
  })

  it('never overlaps five similarly sized categories across project seeds', () => {
    const values = [92, 80, 68, 56, 44]
    for (let seed = 0; seed < 64; seed += 1) {
      const document = createStarterGraph('2026-07-23T00:00:00.000Z')
      document.id = `graph-five-overlap-${seed}`
      document.canvas.layoutMode = 'gravity'
      document.categories = values.map((value, index) => ({
        id: `category-overlap-${index}`,
        name: `分类 ${index + 1}`,
        value,
        color: ['#15B8A6', '#EF6F9B', '#F09A52', '#6C8FF0'][index % 4]!,
        hidden: false,
        attributes: [],
      }))

      assertRootsDoNotOverlap(createGraphLayout(document).roots)
    }
  })

  it('keeps APP-style top category labels clear of neighboring circles', () => {
    for (let seed = 0; seed < 96; seed += 1) {
      const document = createStarterGraph('2026-07-23T00:00:00.000Z')
      document.id = `graph-top-label-${seed}`
      document.categories = [
        {
          id: 'category-role',
          name: '角色',
          value: 100,
          color: '#15B8A6',
          hidden: false,
          attributes: [],
        },
        {
          id: 'category-animation',
          name: '动画',
          value: 58,
          color: '#EF6F9B',
          hidden: false,
          attributes: [
            {
              id: 'attribute-animation',
              name: '动画标签',
              value: 60,
              hidden: false,
              children: [],
            },
          ],
        },
        {
          id: 'category-game',
          name: '游戏',
          value: 70,
          color: '#F09A52',
          hidden: false,
          attributes: [
            {
              id: 'attribute-game-one',
              name: '游戏标签一',
              value: 80,
              hidden: false,
              children: [],
            },
            {
              id: 'attribute-game-two',
              name: '游戏标签二',
              value: 55,
              hidden: false,
              children: [],
            },
          ],
        },
        {
          id: 'category-number',
          name: '11',
          value: 48,
          color: '#6C8FF0',
          hidden: false,
          attributes: [],
        },
        {
          id: 'category-test',
          name: 'test',
          value: 18,
          color: '#15B8A6',
          hidden: false,
          attributes: [],
        },
      ]

      assertTopLabelsDoNotOverlapRoots(createGraphLayout(document).roots)
    }
  })

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

  it('hides a node label after its image is available', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.canvas.templateId = 'endfield'
    const category = document.categories[0]!
    const imageNode = {
      id: 'image-node',
      name: '图片标签',
      kind: 'subAttribute' as const,
      categoryId: category.id,
      value: 80,
      color: category.color,
      x: 120,
      y: 120,
      radius: 64,
      imageAssetId: 'asset-image-label',
      children: [],
    }
    const image = {
      naturalWidth: 64,
      naturalHeight: 64,
      width: 64,
      height: 64,
    } as HTMLImageElement
    const blob = new Blob(['image'], { type: 'image/png' })
    const asset: LocalImageAsset = {
      id: 'asset-image-label',
      fileName: 'label.png',
      mimeType: 'image/png',
      byteLength: blob.size,
      blob,
      objectUrl: 'blob:image-label',
      image,
    }
    const context = createCanvasContext()

    renderGraph(
      context,
      document,
      { [asset.id]: asset },
      {
        layout: {
          width: document.canvas.width,
          height: document.canvas.height,
          roots: [imageNode],
          flatNodes: [imageNode],
        },
      },
    )

    expect(context.drawImage).toHaveBeenCalled()
    expect(context.fillText).not.toHaveBeenCalledWith(
      '图片标签',
      expect.any(Number),
      expect.any(Number),
      expect.anything(),
    )
  })

  it('places the category name over a rounded gap in the top outline', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.canvas.templateId = 'endfield'
    const category = document.categories[0]!
    const subAttributeNode = {
      id: 'nested-sub-attribute',
      name: '三级标签',
      kind: 'subAttribute' as const,
      categoryId: category.id,
      value: 60,
      color: category.color,
      x: 180,
      y: 190,
      radius: 24,
      children: [],
    }
    const attributeNode = {
      id: 'nested-attribute',
      name: '二级标签',
      kind: 'attribute' as const,
      categoryId: category.id,
      value: 70,
      color: category.color,
      x: 180,
      y: 190,
      radius: 50,
      children: [subAttributeNode],
    }
    const categoryNode = {
      id: category.id,
      name: category.name,
      kind: 'category' as const,
      categoryId: category.id,
      value: category.value,
      color: category.color,
      x: 180,
      y: 180,
      radius: 100,
      children: [attributeNode],
    }
    const context = createCanvasContext()

    renderGraph(
      context,
      document,
      {},
      {
        layout: {
          width: document.canvas.width,
          height: document.canvas.height,
          roots: [categoryNode],
          flatNodes: [categoryNode, attributeNode, subAttributeNode],
        },
      },
    )

    expect(context.fillText).toHaveBeenCalledWith(category.name, 180, 80)
    expect(context.fillText).toHaveBeenCalledWith('二级标签', 180, 140)
    expect(context.fill).toHaveBeenCalledTimes(1)
    const outlineCall = (
      context.arc as unknown as { mock: { calls: number[][] } }
    ).mock.calls.find(
      (call) =>
        call[0] === 180 && call[1] === 180 && call[2] === 100 && call[3] !== 0,
    )
    expect(outlineCall).toBeDefined()
    const secondLevelOutlineCall = (
      context.arc as unknown as { mock: { calls: number[][] } }
    ).mock.calls.find(
      (call) =>
        call[0] === 180 && call[1] === 190 && call[2] === 50 && call[3] !== 0,
    )
    expect(secondLevelOutlineCall).toBeDefined()
  })

  it('keeps a complete outline when a node has no children', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.canvas.templateId = 'endfield'
    const category = document.categories[0]!
    const leafNode = {
      id: category.id,
      name: '动画',
      kind: 'category' as const,
      categoryId: category.id,
      value: 100,
      color: category.color,
      x: 180,
      y: 180,
      radius: 100,
      children: [],
    }
    const context = createCanvasContext()

    renderGraph(
      context,
      document,
      {},
      {
        layout: {
          width: document.canvas.width,
          height: document.canvas.height,
          roots: [leafNode],
          flatNodes: [leafNode],
        },
      },
    )

    const gapArc = (
      context.arc as unknown as { mock: { calls: number[][] } }
    ).mock.calls.find(
      (call) =>
        call[0] === 180 && call[1] === 180 && call[2] === 100 && call[3] !== 0,
    )
    expect(gapArc).toBeUndefined()
    expect(context.fillText).toHaveBeenCalledWith(
      '动画',
      180,
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('does not draw a weight value below third-level text', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.canvas.templateId = 'endfield'
    const category = document.categories[0]!
    const subAttribute = {
      id: 'third-level-node',
      name: '三级标签',
      kind: 'subAttribute' as const,
      categoryId: category.id,
      value: 78,
      color: category.color,
      x: 120,
      y: 120,
      radius: 64,
      children: [],
    }
    const context = createCanvasContext()

    renderGraph(
      context,
      document,
      {},
      {
        layout: {
          width: document.canvas.width,
          height: document.canvas.height,
          roots: [subAttribute],
          flatNodes: [subAttribute],
        },
      },
    )

    expect(context.fillText).toHaveBeenCalledWith(
      '三级标签',
      120,
      expect.any(Number),
      expect.any(Number),
    )
    expect(context.fillText).not.toHaveBeenCalledWith(
      '78',
      expect.any(Number),
      expect.any(Number),
    )
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
