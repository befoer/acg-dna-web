import { DECORATION_PRESETS } from '../domain/decorationPresets'
import {
  DECORATION_PATTERN_LAYER_ID,
  decorationFrameLayerId,
  decorationImageLayerId,
  decorationPatternLayerId,
  decorationPresetLayerId,
} from '../domain/graph'
import type {
  GraphDecorationFrame,
  GraphDecorationPattern,
  GraphDecorationPresetId,
  GraphDocument,
} from '../domain/graph'
import type { LocalImageAsset } from '../editor/assets'

export type DecorationPresetAssetMap = Partial<
  Record<GraphDecorationPresetId, HTMLImageElement>
>
type LocalImageAssetMap = Readonly<Record<string, LocalImageAsset>>

export interface DecorationImageRegion {
  id: string
  centerX: number
  centerY: number
  width: number
  height: number
  rotation: number
}

export interface DecorationFrameRegion {
  id: string
  centerX: number
  centerY: number
  width: number
  height: number
  rotation: number
}

let presetAssetPromise: Promise<DecorationPresetAssetMap> | null = null

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('装饰素材加载失败'))
    image.src = url
  })
}

export function loadDecorationPresetAssets(): Promise<DecorationPresetAssetMap> {
  presetAssetPromise ??= Promise.all(
    DECORATION_PRESETS.map(
      async (preset) => [preset.id, await loadImage(preset.imageUrl)] as const,
    ),
  ).then((entries) => Object.fromEntries(entries) as DecorationPresetAssetMap)
  return presetAssetPromise
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  )
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function drawFrame(
  context: CanvasRenderingContext2D,
  frame: GraphDecorationFrame,
  width: number,
  height: number,
): void {
  if (!frame.visible) return
  const frameWidth = frame.width * width
  const frameHeight = frame.height * height
  const x = frame.x * width - frameWidth / 2
  const y = frame.y * height - frameHeight / 2
  const scale = height / 800
  context.save()
  context.translate(frame.x * width, frame.y * height)
  context.rotate((frame.rotation * Math.PI) / 180)
  context.translate(-frame.x * width, -frame.y * height)
  roundedRectangle(
    context,
    x,
    y,
    frameWidth,
    frameHeight,
    frame.cornerRadius * scale,
  )
  context.fillStyle = frame.fillColor
  context.fill()
  if (frame.strokeWidth > 0) {
    context.strokeStyle = frame.strokeColor
    context.lineWidth = frame.strokeWidth * scale
    context.stroke()
  }
  context.restore()
}

function drawPattern(
  context: CanvasRenderingContext2D,
  pattern: GraphDecorationPattern,
  width: number,
  height: number,
): void {
  if (!pattern.visible) return
  context.save()
  context.fillStyle = pattern.backgroundColor
  context.fillRect(0, 0, width, height)
  context.beginPath()
  context.rect(0, 0, width, height)
  context.clip()
  context.translate(width / 2, height / 2)
  context.rotate((pattern.rotation * Math.PI) / 180)
  const diagonal = Math.hypot(width, height)
  const origin = -diagonal / 2
  const cell = Math.max(4, pattern.size * (height / 800))
  context.fillStyle = pattern.foregroundColor
  context.strokeStyle = pattern.foregroundColor
  for (let y = origin; y < diagonal / 2; y += cell) {
    for (let x = origin; x < diagonal / 2; x += cell) {
      if (pattern.type === 'checker') {
        const column = Math.round((x - origin) / cell)
        const row = Math.round((y - origin) / cell)
        if ((column + row) % 2 === 0) context.fillRect(x, y, cell, cell)
      } else if (pattern.type === 'dots') {
        context.beginPath()
        context.arc(
          x + cell / 2,
          y + cell / 2,
          (cell / 2) * pattern.weight,
          0,
          Math.PI * 2,
        )
        context.fill()
      }
    }
  }
  if (pattern.type === 'grid') {
    context.lineWidth = Math.max(1, cell * pattern.weight * 0.2)
    for (let value = origin; value < diagonal / 2; value += cell) {
      context.beginPath()
      context.moveTo(origin, value)
      context.lineTo(diagonal / 2, value)
      context.stroke()
      context.beginPath()
      context.moveTo(value, origin)
      context.lineTo(value, diagonal / 2)
      context.stroke()
    }
  }
  context.restore()
}

function drawDecorationImage(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  localAssets: LocalImageAssetMap,
  imageId: string,
): void {
  const element = document.decoration.images.find(
    (image) => image.id === imageId,
  )
  if (!element?.visible) return
  const asset = localAssets[element.assetId]
  const region = createDecorationImageRegions(document, localAssets).find(
    (candidate) => candidate.id === element.id,
  )
  if (!asset || !region) return
  context.save()
  context.globalAlpha = element.opacity
  context.translate(region.centerX, region.centerY)
  context.rotate((element.rotation * Math.PI) / 180)
  context.drawImage(
    asset.image,
    -region.width / 2,
    -region.height / 2,
    region.width,
    region.height,
  )
  context.restore()
}

export function drawDecorationLayer(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  presetAssets: DecorationPresetAssetMap,
  localAssets: LocalImageAssetMap,
  layerId: string,
): void {
  if (document.decoration.hiddenLayerIds.includes(layerId)) return
  const { width, height } = document.canvas
  if (layerId === DECORATION_PATTERN_LAYER_ID) {
    if (document.decoration.pattern) {
      drawPattern(context, document.decoration.pattern, width, height)
    }
    return
  }
  const pattern = document.decoration.patterns.find(
    (candidate) => decorationPatternLayerId(candidate.id) === layerId,
  )
  if (pattern) {
    drawPattern(context, pattern, width, height)
    return
  }
  const preset = DECORATION_PRESETS.find(
    (candidate) => decorationPresetLayerId(candidate.id) === layerId,
  )
  if (preset) {
    const image = presetAssets[preset.id]
    if (image) context.drawImage(image, 0, 0, width, height)
    return
  }
  const frame = document.decoration.frames.find(
    (candidate) => decorationFrameLayerId(candidate.id) === layerId,
  )
  if (frame) {
    drawFrame(context, frame, width, height)
    return
  }
  const image = document.decoration.images.find(
    (candidate) => decorationImageLayerId(candidate.id) === layerId,
  )
  if (image) drawDecorationImage(context, document, localAssets, image.id)
}

export function drawDecorationImageSelection(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  localAssets: LocalImageAssetMap,
  selectedImageId?: string | null,
): void {
  const regions = createDecorationImageRegions(document, localAssets)
  const selectedRegion = regions.find((region) => region.id === selectedImageId)
  if (selectedRegion) {
    const scale = document.canvas.height / 800
    const handleSize = Math.max(12 * scale, 18)
    context.save()
    context.translate(selectedRegion.centerX, selectedRegion.centerY)
    context.rotate((selectedRegion.rotation * Math.PI) / 180)
    context.strokeStyle = '#00D9C5'
    context.lineWidth = Math.max(2, 1.5 * scale)
    context.setLineDash([8 * scale, 4 * scale])
    context.strokeRect(
      -selectedRegion.width / 2,
      -selectedRegion.height / 2,
      selectedRegion.width,
      selectedRegion.height,
    )
    context.setLineDash([])
    context.fillStyle = '#00D9C5'
    context.fillRect(
      selectedRegion.width / 2 - handleSize / 2,
      selectedRegion.height / 2 - handleSize / 2,
      handleSize,
      handleSize,
    )
    const rotationOffset = Math.max(32 * scale, 34)
    context.beginPath()
    context.moveTo(0, -selectedRegion.height / 2)
    context.lineTo(0, -selectedRegion.height / 2 - rotationOffset)
    context.strokeStyle = '#00D9C5'
    context.lineWidth = Math.max(2, 1.5 * scale)
    context.stroke()
    context.beginPath()
    context.arc(
      0,
      -selectedRegion.height / 2 - rotationOffset,
      handleSize * 0.42,
      0,
      Math.PI * 2,
    )
    context.fill()
    context.restore()
  }
}

export function drawDecorationFrameSelection(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  selectedFrameId?: string | null,
): void {
  const region = createDecorationFrameRegions(document).find(
    (candidate) => candidate.id === selectedFrameId,
  )
  if (!region) return
  const scale = document.canvas.height / 800
  const handleSize = Math.max(12 * scale, 18)
  context.save()
  context.translate(region.centerX, region.centerY)
  context.rotate((region.rotation * Math.PI) / 180)
  context.strokeStyle = '#00D9C5'
  context.lineWidth = Math.max(2, 1.5 * scale)
  context.setLineDash([8 * scale, 4 * scale])
  context.strokeRect(
    -region.width / 2,
    -region.height / 2,
    region.width,
    region.height,
  )
  context.setLineDash([])
  context.fillStyle = '#00D9C5'
  ;[
    [-region.width / 2, -region.height / 2],
    [region.width / 2, -region.height / 2],
    [-region.width / 2, region.height / 2],
    [region.width / 2, region.height / 2],
  ].forEach(([x, y]) =>
    context.fillRect(
      (x ?? 0) - handleSize / 2,
      (y ?? 0) - handleSize / 2,
      handleSize,
      handleSize,
    ),
  )
  context.restore()
}

export function createDecorationImageRegions(
  document: GraphDocument,
  localAssets: LocalImageAssetMap,
): DecorationImageRegion[] {
  return document.decoration.images.flatMap((element) => {
    if (
      !element.visible ||
      document.decoration.hiddenLayerIds.includes(
        decorationImageLayerId(element.id),
      )
    ) {
      return []
    }
    const asset = localAssets[element.assetId]
    if (!asset) return []
    const sourceWidth = asset.image.naturalWidth || asset.image.width
    const sourceHeight = asset.image.naturalHeight || asset.image.height
    if (sourceWidth <= 0 || sourceHeight <= 0) return []
    const width = document.canvas.width * element.size
    return [
      {
        id: element.id,
        centerX: document.canvas.width * element.x,
        centerY: document.canvas.height * element.y,
        width,
        height: width * (sourceHeight / sourceWidth),
        rotation: element.rotation,
      },
    ]
  })
}

export function createDecorationFrameRegions(
  document: GraphDocument,
): DecorationFrameRegion[] {
  return document.decoration.frames.flatMap((frame) => {
    if (
      !frame.visible ||
      document.decoration.hiddenLayerIds.includes(
        decorationFrameLayerId(frame.id),
      )
    ) {
      return []
    }
    return [
      {
        id: frame.id,
        centerX: document.canvas.width * frame.x,
        centerY: document.canvas.height * frame.y,
        width: document.canvas.width * frame.width,
        height: document.canvas.height * frame.height,
        rotation: frame.rotation,
      },
    ]
  })
}

function pointInRegion(
  region: DecorationImageRegion | DecorationFrameRegion,
  x: number,
  y: number,
): boolean {
  const angle = (-region.rotation * Math.PI) / 180
  const deltaX = x - region.centerX
  const deltaY = y - region.centerY
  const localX = deltaX * Math.cos(angle) - deltaY * Math.sin(angle)
  const localY = deltaX * Math.sin(angle) + deltaY * Math.cos(angle)
  return (
    Math.abs(localX) <= region.width / 2 &&
    Math.abs(localY) <= region.height / 2
  )
}

export function hitTestDecorationImage(
  regions: readonly DecorationImageRegion[],
  x: number,
  y: number,
  orderedIds: readonly string[] = regions.map((region) => region.id),
): string | null {
  for (const id of orderedIds) {
    const region = regions.find((candidate) => candidate.id === id)
    if (region && pointInRegion(region, x, y)) return region.id
  }
  return null
}

export function hitTestDecorationFrame(
  regions: readonly DecorationFrameRegion[],
  x: number,
  y: number,
  orderedIds: readonly string[] = regions.map((region) => region.id),
): string | null {
  for (const id of orderedIds) {
    const region = regions.find((candidate) => candidate.id === id)
    if (region && pointInRegion(region, x, y)) return region.id
  }
  return null
}

export function isDecorationResizeHandleHit(
  region: DecorationImageRegion,
  x: number,
  y: number,
  tolerance: number,
): boolean {
  const angle = (-region.rotation * Math.PI) / 180
  const deltaX = x - region.centerX
  const deltaY = y - region.centerY
  const localX = deltaX * Math.cos(angle) - deltaY * Math.sin(angle)
  const localY = deltaX * Math.sin(angle) + deltaY * Math.cos(angle)
  return (
    Math.abs(localX - region.width / 2) <= tolerance &&
    Math.abs(localY - region.height / 2) <= tolerance
  )
}

export function isDecorationRotationHandleHit(
  region: DecorationImageRegion,
  x: number,
  y: number,
  tolerance: number,
  rotationOffset = Math.max(tolerance * 1.8, 34),
): boolean {
  const angle = (-region.rotation * Math.PI) / 180
  const deltaX = x - region.centerX
  const deltaY = y - region.centerY
  const localX = deltaX * Math.cos(angle) - deltaY * Math.sin(angle)
  const localY = deltaX * Math.sin(angle) + deltaY * Math.cos(angle)
  return (
    Math.abs(localX) <= tolerance &&
    Math.abs(localY + region.height / 2 + rotationOffset) <= tolerance
  )
}

export function isDecorationFrameResizeHandleHit(
  region: DecorationFrameRegion,
  x: number,
  y: number,
  tolerance: number,
): boolean {
  const angle = (-region.rotation * Math.PI) / 180
  const deltaX = x - region.centerX
  const deltaY = y - region.centerY
  const localX = deltaX * Math.cos(angle) - deltaY * Math.sin(angle)
  const localY = deltaX * Math.sin(angle) + deltaY * Math.cos(angle)
  return (
    Math.abs(Math.abs(localX) - region.width / 2) <= tolerance &&
    Math.abs(Math.abs(localY) - region.height / 2) <= tolerance
  )
}
