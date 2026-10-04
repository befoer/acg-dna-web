import {
  DECORATION_DATA_LAYER_ID,
  customTextIdFromDecorationLayer,
  resolveCategoryAppearance,
  resolveDecorationLayerOrder,
  type GraphDocument,
  type GraphLabelSettings,
  type GraphImageMask,
} from '../domain/graph'
import { getGraphTemplate } from '../domain/templates'
import type { LocalImageAsset } from '../editor/assets'
import {
  ensureGraphFontLoaded,
  ensureProfileFontsLoaded,
  getGraphFontCssFamily,
} from '../fonts/fontManager'
import {
  createBasicLayout,
  type BasicLayoutResult,
  type LayoutNode,
} from '../layout/basicLayout'
import { createGravityLayout } from '../layout/gravityLayout'
import { loadTemplateBackground } from './templateBackground'
import { drawTransformedImageCover } from './imageTransform'
import {
  loadProfileTemplateAssets,
  type ProfileTemplateAssetMap,
} from './profileTemplateAssets'
import { drawProfileCustomText, drawProfileTemplate } from './profileRenderer'
import {
  drawDecorationImageSelection,
  drawDecorationFrameSelection,
  drawDecorationLayer,
  loadDecorationPresetAssets,
  type DecorationPresetAssetMap,
} from './decorationRenderer'

export type LocalImageAssetMap = Readonly<Record<string, LocalImageAsset>>

export interface RenderGraphOptions {
  selectedNodeId?: string | null
  layout?: BasicLayoutResult
  templateBackground?: HTMLImageElement | null
  showContentBounds?: boolean
  drawNodeText?: boolean
  profileTemplateAssets?: ProfileTemplateAssetMap
  selectedCustomTextId?: string | null
  drawProfileTemplate?: boolean
  decorationPresetAssets?: DecorationPresetAssetMap
  selectedDecorationImageId?: string | null
  selectedDecorationFrameId?: string | null
}

function fitLayoutToBounds(
  layout: BasicLayoutResult,
  width: number,
  height: number,
): void {
  if (layout.roots.length === 0) return

  const left = Math.min(...layout.roots.map((node) => node.x - node.radius))
  const top = Math.min(...layout.roots.map((node) => node.y - node.radius))
  const right = Math.max(...layout.roots.map((node) => node.x + node.radius))
  const bottom = Math.max(...layout.roots.map((node) => node.y + node.radius))
  const occupiedWidth = Math.max(1, right - left)
  const occupiedHeight = Math.max(1, bottom - top)
  const scale = Math.min(width / occupiedWidth, height / occupiedHeight)
  const sourceCenterX = (left + right) / 2
  const sourceCenterY = (top + bottom) / 2
  const targetCenterX = width / 2
  const targetCenterY = height / 2

  const transformNode = (node: LayoutNode): void => {
    node.x = targetCenterX + (node.x - sourceCenterX) * scale
    node.y = targetCenterY + (node.y - sourceCenterY) * scale
    node.radius *= scale
    node.children.forEach(transformNode)
  }
  layout.roots.forEach(transformNode)
}

function fitGravityLayoutToBounds(
  layout: BasicLayoutResult,
  width: number,
  height: number,
): void {
  if (layout.roots.length === 0) return

  const left = Math.min(...layout.roots.map((node) => node.x - node.radius))
  const top = Math.min(...layout.roots.map((node) => node.y - node.radius))
  const right = Math.max(...layout.roots.map((node) => node.x + node.radius))
  const bottom = Math.max(...layout.roots.map((node) => node.y + node.radius))
  const occupiedWidth = Math.max(1, right - left)
  const occupiedHeight = Math.max(1, bottom - top)
  const scale = Math.min(width / occupiedWidth, height / occupiedHeight)
  const sourceCenterX = (left + right) / 2
  const targetCenterX = width / 2
  const targetBottom = height

  const transformNode = (node: LayoutNode): void => {
    node.x = targetCenterX + (node.x - sourceCenterX) * scale
    node.y = targetBottom + (node.y - bottom) * scale
    node.radius *= scale
    node.children.forEach(transformNode)
  }
  layout.roots.forEach(transformNode)
}

export function createGraphLayout(document: GraphDocument): BasicLayoutResult {
  const bounds = document.canvas.contentBounds
  const left = bounds.left * document.canvas.width
  const top = bounds.top * document.canvas.height
  const width = Math.max(
    1,
    (bounds.right - bounds.left) * document.canvas.width,
  )
  const height = Math.max(
    1,
    (bounds.bottom - bounds.top) * document.canvas.height,
  )
  const options = {
    width,
    height,
    horizontalPadding: 0,
    topInset: 0,
    bottomInset: 0,
  }
  const layout =
    document.canvas.layoutMode === 'gravity'
      ? createGravityLayout(document, options)
      : createBasicLayout(document, options)
  if (document.canvas.layoutMode === 'gravity') {
    fitGravityLayoutToBounds(layout, width, height)
  } else {
    fitLayoutToBounds(layout, width, height)
  }
  const translateNode = (node: LayoutNode) => {
    node.x += left
    node.y += top
    node.children.forEach(translateNode)
  }
  layout.roots.forEach(translateNode)
  return {
    width: document.canvas.width,
    height: document.canvas.height,
    roots: layout.roots,
    flatNodes: layout.flatNodes,
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(value)) {
    return `rgba(21, 184, 166, ${alpha})`
  }
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function splitLabel(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (context.measureText(text).width <= maxWidth) return [text]

  const characters = Array.from(text)
  let firstLine = ''
  let secondLine = ''
  for (const character of characters) {
    const target = secondLine ? secondLine : firstLine
    if (
      !secondLine &&
      context.measureText(target + character).width <= maxWidth
    ) {
      firstLine += character
    } else {
      secondLine += character
    }
  }

  if (context.measureText(secondLine).width > maxWidth) {
    while (
      secondLine.length > 1 &&
      context.measureText(`${secondLine}…`).width > maxWidth
    ) {
      secondLine = secondLine.slice(0, -1)
    }
    secondLine += '…'
  }

  return [firstLine, secondLine].filter(Boolean)
}

function nodeFontSize(node: LayoutNode): number {
  if (node.kind === 'category') {
    return Math.max(22, Math.min(42, node.radius * 0.13))
  }
  if (node.kind === 'attribute') {
    return Math.max(19, Math.min(35, node.radius * 0.175))
  }
  return Math.max(16, Math.min(31, node.radius * 0.33))
}

function drawNodeLabel(
  context: CanvasRenderingContext2D,
  node: LayoutNode,
  settings: GraphLabelSettings,
  isOverImage = false,
): void {
  const fontSize = nodeFontSize(node)
  const isContainer =
    node.children.length > 0 &&
    (node.kind === 'category' || node.kind === 'attribute')
  const textColor = isContainer
    ? (settings.colorOverride ?? node.color)
    : isOverImage
      ? (settings.textColorOverride ?? '#FFFFFF')
      : (settings.textColorOverride ?? '#242429')
  const fontFamily = getGraphFontCssFamily(settings)
  const maxWidth = Math.max(30, node.radius * 1.48)
  context.save()
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = textColor
  context.font = `${settings.fontWeight} ${fontSize}px ${fontFamily}`
  if (isOverImage) {
    const shadowOffset = Math.max(1.5, fontSize * 0.065)
    context.shadowColor = hexToRgba(settings.colorOverride ?? node.color, 0.98)
    context.shadowOffsetX = shadowOffset
    context.shadowOffsetY = shadowOffset
    context.shadowBlur = Math.max(3.5, fontSize * 0.15)
  }
  if (isContainer) {
    context.fillText(node.name || '未命名', node.x, node.y - node.radius)
    context.restore()
    return
  }

  const lines = splitLabel(context, node.name || '未命名', maxWidth)
  const startY =
    node.y - ((lines.length - 1) * fontSize * 0.58 + fontSize * 0.14)
  lines.forEach((line, index) => {
    context.fillText(line, node.x, startY + index * fontSize * 1.1, maxWidth)
  })

  context.restore()
}

function drawNodeStroke(
  context: CanvasRenderingContext2D,
  node: LayoutNode,
  color: string,
  strokeAlpha: number,
  strokeWidth: number,
  settings: GraphLabelSettings,
  hasTopLabel: boolean,
): void {
  if (strokeWidth <= 0) return

  context.beginPath()
  context.lineWidth = strokeWidth
  context.strokeStyle = hexToRgba(color, strokeAlpha)
  if (hasTopLabel) {
    const fontSize = nodeFontSize(node)
    const fontFamily = getGraphFontCssFamily(settings)
    context.font = `${settings.fontWeight} ${fontSize}px ${fontFamily}`
    const gapWidth =
      context.measureText(node.name || '未命名').width + fontSize * 0.5
    const gapAngle = gapWidth / Math.max(1, node.radius)
    context.lineCap = 'round'
    context.arc(
      node.x,
      node.y,
      node.radius,
      -Math.PI / 2 + gapAngle / 2,
      -Math.PI / 2 + Math.PI * 2 - gapAngle / 2,
    )
  } else {
    context.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
  }
  context.stroke()
}

function drawNode(
  context: CanvasRenderingContext2D,
  node: LayoutNode,
  assets: LocalImageAssetMap,
  selectedNodeId: string | null | undefined,
  document: GraphDocument,
  canvasWidth: number,
  drawNodeText: boolean,
): void {
  const category = document.categories.find(
    (item) => item.id === node.categoryId,
  )
  const settings = category
    ? resolveCategoryAppearance(category, document.canvas.labelSettings)
    : {
        ...document.canvas.labelSettings,
        showCategoryImage: document.canvas.labelSettings.showImages,
        showLabelImages: document.canvas.labelSettings.showImages,
        fillFactor: 1,
        imageMask: 'none' as GraphImageMask,
        imageMaskOpacity: 0.35,
      }
  const showsNodeImage =
    node.kind === 'category'
      ? settings.showCategoryImage
      : settings.showLabelImages
  const isContainer =
    node.children.length > 0 &&
    (node.kind === 'category' || node.kind === 'attribute')
  const asset =
    showsNodeImage && node.imageAssetId ? assets[node.imageAssetId] : undefined
  const renderedAsset = isContainer ? undefined : asset
  const color = settings.colorOverride ?? node.color
  const showText =
    node.kind === 'category'
      ? settings.showCategoryText
      : settings.showLabelText
  // Matches the APP behavior: labels without a rendered image always retain a
  // readable name, while the image overlay remains controlled by showLabelText.
  const shouldDrawLabel =
    drawNodeText && (showText || (!isContainer && !renderedAsset))
  const fillAlpha = getGraphTemplate(document.canvas.templateId).labelFillAlpha
  const strokeAlpha = isContainer ? 0.7 : 1
  const strokeWidth =
    (node.kind === 'category'
      ? settings.categoryStrokeWidth
      : settings.labelStrokeWidth) *
    (canvasWidth / 1000)

  context.save()
  if (!isContainer) {
    context.beginPath()
    context.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
    context.fillStyle = hexToRgba(color, fillAlpha * settings.fillOpacity)
    context.fill()
  }

  if (renderedAsset) {
    context.save()
    context.clip()
    drawTransformedImageCover(
      context,
      renderedAsset.image,
      node.x - node.radius,
      node.y - node.radius,
      node.radius * 2,
      node.radius * 2,
      node.imageTransform,
    )
    if (shouldDrawLabel) {
      context.beginPath()
      context.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
      context.fillStyle = hexToRgba(color, 0.32)
      context.fill()
    }
    if (settings.imageMask !== 'none' && settings.imageMaskOpacity > 0) {
      const maskColor =
        settings.imageMask === 'black'
          ? '#000000'
          : settings.imageMask === 'white'
            ? '#FFFFFF'
            : color
      context.fillStyle = hexToRgba(maskColor, settings.imageMaskOpacity)
      context.fillRect(
        node.x - node.radius,
        node.y - node.radius,
        node.radius * 2,
        node.radius * 2,
      )
    }
    context.restore()
  }

  drawNodeStroke(
    context,
    node,
    color,
    strokeAlpha,
    strokeWidth,
    settings,
    isContainer && shouldDrawLabel,
  )
  context.restore()

  node.children.forEach((child) =>
    drawNode(
      context,
      child,
      assets,
      selectedNodeId,
      document,
      canvasWidth,
      drawNodeText,
    ),
  )
  if (shouldDrawLabel) {
    drawNodeLabel(context, node, settings, Boolean(renderedAsset))
  }

  if (node.id === selectedNodeId) {
    context.save()
    context.beginPath()
    context.arc(node.x, node.y, node.radius + 7, 0, Math.PI * 2)
    context.lineWidth = 5
    context.strokeStyle = '#0E9F93'
    context.setLineDash([12, 8])
    context.stroke()
    context.restore()
  }
}

function drawHeader(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
): void {
  const left = document.canvas.width * 0.065
  const top = document.canvas.height * 0.055
  context.save()
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#168F86'
  context.font = '700 24px Inter, system-ui, sans-serif'
  context.fillText('ACG DNA  /  LOCAL GRAPH', left, top)

  context.fillStyle = '#202025'
  context.font = '720 64px Inter, "Noto Sans SC", system-ui, sans-serif'
  const title = document.name.trim() || '未命名属性图'
  context.fillText(title, left, top + 76, document.canvas.width * 0.78)

  context.fillStyle = 'rgba(32, 32, 37, 0.55)'
  context.font = '500 22px Inter, "Noto Sans SC", system-ui, sans-serif'
  context.fillText(
    `${document.categories.filter((category) => !category.hidden).length} 个分类 · Schema v${document.schemaVersion}`,
    left,
    top + 118,
  )
  context.restore()
}

function drawEmptyState(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
): void {
  context.save()
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = 'rgba(32, 32, 37, 0.42)'
  context.font = '600 30px Inter, "Noto Sans SC", system-ui, sans-serif'
  context.fillText(
    '添加一个分类，开始绘制你的 ACG DNA',
    document.canvas.width / 2,
    document.canvas.height / 2,
  )
  context.restore()
}

function drawFooter(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
): void {
  context.save()
  context.textAlign = 'right'
  context.textBaseline = 'alphabetic'
  context.fillStyle = 'rgba(32, 32, 37, 0.28)'
  context.font = '600 16px Inter, system-ui, sans-serif'
  context.fillText(
    'ACG DNA',
    document.canvas.width * 0.992,
    document.canvas.height * 0.993,
  )
  context.restore()
}

function contentBoundsRect(document: GraphDocument) {
  const bounds = document.canvas.contentBounds
  const left = bounds.left * document.canvas.width
  const top = bounds.top * document.canvas.height
  const width = (bounds.right - bounds.left) * document.canvas.width
  const height = (bounds.bottom - bounds.top) * document.canvas.height
  return {
    left,
    top,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  }
}

function rotateForContentBounds(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
): void {
  const rect = contentBoundsRect(document)
  context.translate(rect.centerX, rect.centerY)
  context.rotate((document.canvas.contentBounds.rotation * Math.PI) / 180)
  context.translate(-rect.centerX, -rect.centerY)
}

function drawContentBounds(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
): void {
  const rect = contentBoundsRect(document)
  const handleSize = Math.max(12, document.canvas.width * 0.012)
  context.save()
  rotateForContentBounds(context, document)
  context.strokeStyle = '#00BFAE'
  context.lineWidth = Math.max(2, document.canvas.width * 0.002)
  context.setLineDash([16, 12])
  context.strokeRect(rect.left, rect.top, rect.width, rect.height)
  context.setLineDash([])
  context.fillStyle = '#00BFAE'
  const corners = [
    [rect.left, rect.top],
    [rect.left + rect.width, rect.top],
    [rect.left, rect.top + rect.height],
    [rect.left + rect.width, rect.top + rect.height],
  ]
  corners.forEach(([x, y]) => {
    context.fillRect(
      (x ?? 0) - handleSize / 2,
      (y ?? 0) - handleSize / 2,
      handleSize,
      handleSize,
    )
  })
  const edgeHandleSize = handleSize * 0.72
  const edges = [
    [rect.centerX, rect.top],
    [rect.centerX, rect.top + rect.height],
    [rect.left, rect.centerY],
    [rect.left + rect.width, rect.centerY],
  ]
  edges.forEach(([x, y]) => {
    context.fillRect(
      (x ?? 0) - edgeHandleSize / 2,
      (y ?? 0) - edgeHandleSize / 2,
      edgeHandleSize,
      edgeHandleSize,
    )
  })
  context.restore()
}

export function renderGraph(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  assets: LocalImageAssetMap,
  options: RenderGraphOptions = {},
): BasicLayoutResult {
  const { width, height, backgroundColor } = document.canvas
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, width, height)
  context.fillStyle = backgroundColor
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  if (
    document.decoration.templateBackgroundVisible &&
    options.templateBackground
  ) {
    context.drawImage(options.templateBackground, 0, 0, width, height)
  }
  const template = getGraphTemplate(document.canvas.templateId)
  const layout = options.layout ?? createGraphLayout(document)
  const strokeReferenceWidth =
    (document.canvas.contentBounds.right - document.canvas.contentBounds.left) *
    width
  const drawDataLayer = () => {
    if (template.showCanvasText && template.id !== 'custom') {
      drawHeader(context, document)
    }
    context.save()
    rotateForContentBounds(context, document)
    if (layout.roots.length === 0) {
      drawEmptyState(context, document)
    } else {
      layout.roots.forEach((node) =>
        drawNode(
          context,
          node,
          assets,
          options.selectedNodeId,
          document,
          strokeReferenceWidth,
          options.drawNodeText ?? true,
        ),
      )
    }
    context.restore()
    if (options.drawProfileTemplate ?? true) {
      drawProfileTemplate(
        context,
        document,
        assets,
        options.profileTemplateAssets ?? {},
      )
    }
    if (template.showCanvasText) drawFooter(context, document)
  }
  const hiddenLayers = new Set(document.decoration.hiddenLayerIds)
  ;[
    ...resolveDecorationLayerOrder(
      document.decoration,
      document.profile.customTexts.map((text) => text.id),
    ),
  ]
    .reverse()
    .forEach((layerId) => {
      if (layerId === DECORATION_DATA_LAYER_ID) {
        if (!hiddenLayers.has(layerId)) drawDataLayer()
      } else {
        const customTextId = customTextIdFromDecorationLayer(layerId)
        if (customTextId) {
          if (hiddenLayers.has(layerId)) return
          drawProfileCustomText(
            context,
            document,
            customTextId,
            options.selectedCustomTextId,
          )
          return
        }
        drawDecorationLayer(
          context,
          document,
          options.decorationPresetAssets ?? {},
          assets,
          layerId,
        )
      }
    })
  drawDecorationImageSelection(
    context,
    document,
    assets,
    options.selectedDecorationImageId,
  )
  drawDecorationFrameSelection(
    context,
    document,
    options.selectedDecorationFrameId,
  )
  if (options.showContentBounds) drawContentBounds(context, document)
  context.restore()
  return layout
}

export async function createGraphThumbnailDataUrl(
  document: GraphDocument,
  assets: LocalImageAssetMap,
): Promise<string> {
  const source = window.document.createElement('canvas')
  source.width = document.canvas.width
  source.height = document.canvas.height
  const context = source.getContext('2d')
  if (!context) throw new Error('Canvas 2D unavailable')

  await Promise.all([
    ...document.categories.map((category) =>
      ensureGraphFontLoaded(
        resolveCategoryAppearance(category, document.canvas.labelSettings),
      ),
    ),
    ensureProfileFontsLoaded(document.profile),
  ])
  const [templateBackground, profileTemplateAssets, decorationPresetAssets] =
    await Promise.all([
      loadTemplateBackground(document.canvas.templateId),
      loadProfileTemplateAssets(
        document.profile.subTemplateId,
        document.profile.gender,
      ),
      loadDecorationPresetAssets(),
    ])
  renderGraph(context, document, assets, {
    templateBackground,
    decorationPresetAssets,
    profileTemplateAssets,
    layout: createGraphLayout(document),
    drawNodeText: true,
    drawProfileTemplate: true,
  })

  const maxWidth = 320
  const maxHeight = 180
  const scale = Math.min(maxWidth / source.width, maxHeight / source.height)
  const thumbnail = window.document.createElement('canvas')
  thumbnail.width = Math.max(1, Math.round(source.width * scale))
  thumbnail.height = Math.max(1, Math.round(source.height * scale))
  const thumbnailContext = thumbnail.getContext('2d')
  if (!thumbnailContext) throw new Error('Canvas 2D unavailable')
  thumbnailContext.imageSmoothingEnabled = true
  thumbnailContext.imageSmoothingQuality = 'high'
  thumbnailContext.drawImage(source, 0, 0, thumbnail.width, thumbnail.height)
  return thumbnail.toDataURL('image/png')
}
function safeFileName(name: string): string {
  const normalized = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
  return normalized || 'acg-dna'
}

export async function downloadGraphPng(
  document: GraphDocument,
  assets: LocalImageAssetMap,
): Promise<void> {
  const canvas = window.document.createElement('canvas')
  canvas.width = document.canvas.width
  canvas.height = document.canvas.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('当前浏览器不支持 Canvas 2D')
  }

  await Promise.all([
    ...document.categories.map((category) =>
      ensureGraphFontLoaded(
        resolveCategoryAppearance(category, document.canvas.labelSettings),
      ),
    ),
    ensureProfileFontsLoaded(document.profile),
  ])
  const [templateBackground, profileTemplateAssets, decorationPresetAssets] =
    await Promise.all([
      loadTemplateBackground(document.canvas.templateId),
      loadProfileTemplateAssets(
        document.profile.subTemplateId,
        document.profile.gender,
      ),
      loadDecorationPresetAssets(),
    ])
  const layout = createGraphLayout(document)
  renderGraph(context, document, assets, {
    templateBackground,
    decorationPresetAssets,
    profileTemplateAssets,
    layout,
    drawNodeText: true,
    drawProfileTemplate: true,
  })
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value)
      else reject(new Error('PNG 编码失败'))
    }, 'image/png')
  })
  const objectUrl = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = objectUrl
  link.download = `${safeFileName(document.name)}.png`
  link.style.display = 'none'
  window.document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
}
