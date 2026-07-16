import type { GraphDocument, GraphLabelSettings } from '../domain/graph'
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
import { drawAlimamaLabelsToCanvas } from './graphLabelOverlay'
import {
  loadProfileTemplateAssets,
  type ProfileTemplateAssetMap,
} from './profileTemplateAssets'
import { drawProfileCustomTexts, drawProfileTemplate } from './profileRenderer'
import { drawAlimamaProfileTextsToCanvas } from './profileTextOverlay'

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
  fitLayoutToBounds(layout, width, height)
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

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
): void {
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (sourceWidth <= 0 || sourceHeight <= 0) return

  const sourceRatio = sourceWidth / sourceHeight
  let sourceX = 0
  let sourceY = 0
  let cropWidth = sourceWidth
  let cropHeight = sourceHeight

  if (sourceRatio > 1) {
    cropWidth = sourceHeight
    sourceX = (sourceWidth - cropWidth) / 2
  } else {
    cropHeight = sourceWidth
    sourceY = (sourceHeight - cropHeight) / 2
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    x,
    y,
    size,
    size,
  )
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
    return Math.max(18, Math.min(32, node.radius * 0.16))
  }
  return Math.max(15, Math.min(28, node.radius * 0.3))
}

function drawNodeLabel(
  context: CanvasRenderingContext2D,
  node: LayoutNode,
  hasImage: boolean,
  settings: GraphLabelSettings,
): void {
  const fontSize = nodeFontSize(node)
  const textColor =
    settings.textColorOverride ?? (hasImage ? '#FFFFFF' : '#242429')
  const fontFamily = getGraphFontCssFamily(settings)
  const maxWidth = Math.max(30, node.radius * 1.48)
  context.save()
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = textColor
  context.font = `${settings.fontWeight} ${fontSize}px ${fontFamily}`
  if (hasImage) {
    context.shadowColor = 'rgba(0, 0, 0, 0.6)'
    context.shadowBlur = Math.max(5, fontSize * 0.35)
    context.shadowOffsetY = 2
  }

  const lines = splitLabel(context, node.name || '未命名', maxWidth)
  const isContainer = node.children.length > 0
  const startY = isContainer
    ? node.y - node.radius + fontSize * 1.45
    : node.y - ((lines.length - 1) * fontSize * 0.58 + fontSize * 0.14)
  lines.forEach((line, index) => {
    context.fillText(line, node.x, startY + index * fontSize * 1.1, maxWidth)
  })

  if (!isContainer && node.radius >= 48) {
    context.shadowBlur = hasImage ? 4 : 0
    context.font = `${Math.max(300, settings.fontWeight - 100)} ${Math.max(12, fontSize * 0.58)}px ${fontFamily}`
    context.globalAlpha = 0.82
    context.fillText(
      `${Math.round(node.value)}`,
      node.x,
      startY + lines.length * fontSize * 1.04,
    )
  }
  context.restore()
}

function drawNode(
  context: CanvasRenderingContext2D,
  node: LayoutNode,
  assets: LocalImageAssetMap,
  selectedNodeId: string | null | undefined,
  settings: GraphLabelSettings,
  canvasWidth: number,
  drawNodeText: boolean,
): void {
  const asset =
    settings.showImages && node.imageAssetId
      ? assets[node.imageAssetId]
      : undefined
  const color = settings.colorOverride ?? node.color
  const fillAlpha =
    node.kind === 'category' ? 0.09 : node.kind === 'attribute' ? 0.2 : 0.82
  const strokeAlpha = node.kind === 'category' ? 0.62 : 0.72
  const strokeWidth =
    (node.kind === 'category'
      ? settings.categoryStrokeWidth
      : settings.labelStrokeWidth) *
    (canvasWidth / 1000)

  context.save()
  context.beginPath()
  context.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
  context.fillStyle = hexToRgba(color, fillAlpha * settings.fillOpacity)
  context.fill()

  if (asset) {
    context.save()
    context.clip()
    drawImageCover(
      context,
      asset.image,
      node.x - node.radius,
      node.y - node.radius,
      node.radius * 2,
    )
    const overlay = context.createLinearGradient(
      node.x,
      node.y - node.radius,
      node.x,
      node.y + node.radius,
    )
    overlay.addColorStop(0, 'rgba(10, 10, 14, 0.04)')
    overlay.addColorStop(0.58, 'rgba(10, 10, 14, 0.12)')
    overlay.addColorStop(1, 'rgba(10, 10, 14, 0.68)')
    context.fillStyle = overlay
    context.fillRect(
      node.x - node.radius,
      node.y - node.radius,
      node.radius * 2,
      node.radius * 2,
    )
    context.restore()
  }

  context.beginPath()
  context.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
  if (strokeWidth > 0) {
    context.lineWidth = strokeWidth
    context.strokeStyle = hexToRgba(color, strokeAlpha)
    context.stroke()
  }
  context.restore()

  node.children.forEach((child) =>
    drawNode(
      context,
      child,
      assets,
      selectedNodeId,
      settings,
      canvasWidth,
      drawNodeText,
    ),
  )
  const showText =
    node.kind === 'category'
      ? settings.showCategoryText
      : settings.showLabelText
  if (showText && drawNodeText) {
    drawNodeLabel(context, node, Boolean(asset), settings)
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
  context.fillStyle = 'rgba(32, 32, 37, 0.38)'
  context.font = '600 18px Inter, system-ui, sans-serif'
  context.fillText(
    'MADE LOCALLY WITH ACG DNA WEB',
    document.canvas.width * 0.935,
    document.canvas.height * 0.965,
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
  if (options.templateBackground) {
    context.drawImage(options.templateBackground, 0, 0, width, height)
  }

  const template = getGraphTemplate(document.canvas.templateId)
  if (template.showCanvasText) drawHeader(context, document)
  const layout = options.layout ?? createGraphLayout(document)
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
        document.canvas.labelSettings,
        width,
        options.drawNodeText ?? true,
      ),
    )
  }
  context.restore()
  drawProfileCustomTexts(context, document, options.selectedCustomTextId)
  if (options.drawProfileTemplate ?? true) {
    drawProfileTemplate(
      context,
      document,
      assets,
      options.profileTemplateAssets ?? {},
    )
  }
  if (options.showContentBounds) drawContentBounds(context, document)
  if (template.showCanvasText) drawFooter(context, document)
  context.restore()
  return layout
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
    ensureGraphFontLoaded(document.canvas.labelSettings),
    ensureProfileFontsLoaded(document.profile),
  ])
  const [templateBackground, profileTemplateAssets] = await Promise.all([
    loadTemplateBackground(document.canvas.templateId),
    loadProfileTemplateAssets(
      document.profile.subTemplateId,
      document.profile.gender,
    ),
  ])
  const usesAlimama =
    document.canvas.labelSettings.fontFamily === 'alimama-fangyuan'
  const layout = createGraphLayout(document)
  renderGraph(context, document, assets, {
    templateBackground,
    profileTemplateAssets,
    layout,
    drawNodeText: !usesAlimama,
    drawProfileTemplate: false,
  })
  if (usesAlimama) {
    await drawAlimamaLabelsToCanvas(context, document, layout, assets)
  }
  await drawAlimamaProfileTextsToCanvas(context, document)
  drawProfileTemplate(context, document, assets, profileTemplateAssets)
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
