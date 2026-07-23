import {
  DEFAULT_IMAGE_TRANSFORM,
  type GraphImageTransform,
} from '../domain/graph'

export interface TransformedImagePlacement {
  centerX: number
  centerY: number
  width: number
  height: number
  rotationRadians: number
}

/**
 * Keeps the complete source image inside the crop rectangle. This is used
 * for AniList square portraits so they are not enlarged by a cover crop.
 */
export function calculateContainedImagePlacement(
  sourceWidth: number,
  sourceHeight: number,
  cropX: number,
  cropY: number,
  cropWidth: number,
  cropHeight: number,
  transform: GraphImageTransform = DEFAULT_IMAGE_TRANSFORM,
): TransformedImagePlacement {
  const safeSourceWidth = Math.max(1, sourceWidth)
  const safeSourceHeight = Math.max(1, sourceHeight)
  const safeCropWidth = Math.max(1, cropWidth)
  const safeCropHeight = Math.max(1, cropHeight)
  const normalized = normalizeImageTransform(transform)
  const rotationRadians = (normalized.rotation * Math.PI) / 180
  const cosine = Math.abs(Math.cos(rotationRadians))
  const sine = Math.abs(Math.sin(rotationRadians))
  const rotatedWidth = safeSourceWidth * cosine + safeSourceHeight * sine
  const rotatedHeight = safeSourceWidth * sine + safeSourceHeight * cosine
  const scale =
    Math.min(safeCropWidth / rotatedWidth, safeCropHeight / rotatedHeight) *
    normalized.zoom
  const width = safeSourceWidth * scale
  const height = safeSourceHeight * scale
  const availableWidth = Math.max(0, safeCropWidth - rotatedWidth * scale)
  const availableHeight = Math.max(0, safeCropHeight - rotatedHeight * scale)

  return {
    centerX:
      cropX + safeCropWidth / 2 + normalized.offsetX * (availableWidth / 2),
    centerY:
      cropY + safeCropHeight / 2 + normalized.offsetY * (availableHeight / 2),
    width,
    height,
    rotationRadians,
  }
}

export function normalizeImageTransform(
  transform: GraphImageTransform | undefined,
): GraphImageTransform {
  return {
    zoom: Math.max(1, Math.min(4, transform?.zoom ?? 1)),
    offsetX: Math.max(-1, Math.min(1, transform?.offsetX ?? 0)),
    offsetY: Math.max(-1, Math.min(1, transform?.offsetY ?? 0)),
    rotation: Math.max(-180, Math.min(180, transform?.rotation ?? 0)),
  }
}

export function panImageTransform(
  transform: GraphImageTransform,
  deltaX: number,
  deltaY: number,
  viewportSize: number,
): GraphImageTransform {
  const safeViewportSize = Math.max(1, viewportSize)
  const rotationRadians = (transform.rotation * Math.PI) / 180
  const cosine = Math.cos(rotationRadians)
  const sine = Math.sin(rotationRadians)
  const localDeltaX = deltaX * cosine + deltaY * sine
  const localDeltaY = -deltaX * sine + deltaY * cosine
  return normalizeImageTransform({
    ...transform,
    offsetX: transform.offsetX + (localDeltaX * 2) / safeViewportSize,
    offsetY: transform.offsetY + (localDeltaY * 2) / safeViewportSize,
  })
}

export function zoomImageTransform(
  transform: GraphImageTransform,
  factor: number,
): GraphImageTransform {
  return normalizeImageTransform({
    ...transform,
    zoom: transform.zoom * (Number.isFinite(factor) ? factor : 1),
  })
}

export function calculateTransformedImagePlacement(
  sourceWidth: number,
  sourceHeight: number,
  cropX: number,
  cropY: number,
  cropWidth: number,
  cropHeight: number,
  transform: GraphImageTransform = DEFAULT_IMAGE_TRANSFORM,
): TransformedImagePlacement {
  const safeSourceWidth = Math.max(1, sourceWidth)
  const safeSourceHeight = Math.max(1, sourceHeight)
  const safeCropWidth = Math.max(1, cropWidth)
  const safeCropHeight = Math.max(1, cropHeight)
  const normalized = normalizeImageTransform(transform)
  const rotationRadians = (normalized.rotation * Math.PI) / 180
  const cosine = Math.abs(Math.cos(rotationRadians))
  const sine = Math.abs(Math.sin(rotationRadians))

  // 将裁切框反向旋转到图片坐标系，按其包围盒计算最小 Cover 比例。
  // 这样正方形头像在旋转后也不会露出透明角。
  const requiredWidth = safeCropWidth * cosine + safeCropHeight * sine
  const requiredHeight = safeCropWidth * sine + safeCropHeight * cosine
  const scale =
    Math.max(
      requiredWidth / safeSourceWidth,
      requiredHeight / safeSourceHeight,
    ) * normalized.zoom
  const width = safeSourceWidth * scale
  const height = safeSourceHeight * scale
  const localOffsetX =
    normalized.offsetX * Math.max(0, (width - requiredWidth) / 2)
  const localOffsetY =
    normalized.offsetY * Math.max(0, (height - requiredHeight) / 2)
  const signedCosine = Math.cos(rotationRadians)
  const signedSine = Math.sin(rotationRadians)
  const canvasOffsetX = localOffsetX * signedCosine - localOffsetY * signedSine
  const canvasOffsetY = localOffsetX * signedSine + localOffsetY * signedCosine

  return {
    centerX: cropX + safeCropWidth / 2 + canvasOffsetX,
    centerY: cropY + safeCropHeight / 2 + canvasOffsetY,
    width,
    height,
    rotationRadians,
  }
}

export function drawTransformedImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  transform?: GraphImageTransform,
): void {
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (sourceWidth <= 0 || sourceHeight <= 0) return
  const placement = calculateTransformedImagePlacement(
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
    transform,
  )
  context.save()
  context.translate(placement.centerX, placement.centerY)
  context.rotate(placement.rotationRadians)
  context.drawImage(
    image,
    -placement.width / 2,
    -placement.height / 2,
    placement.width,
    placement.height,
  )
  context.restore()
}

export function drawTransformedImageContain(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  transform?: GraphImageTransform,
): void {
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (sourceWidth <= 0 || sourceHeight <= 0) return
  const placement = calculateContainedImagePlacement(
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
    transform,
  )
  context.save()
  context.translate(placement.centerX, placement.centerY)
  context.rotate(placement.rotationRadians)
  context.drawImage(
    image,
    -placement.width / 2,
    -placement.height / 2,
    placement.width,
    placement.height,
  )
  context.restore()
}
