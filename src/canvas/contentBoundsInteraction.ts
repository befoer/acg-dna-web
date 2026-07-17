import type { GraphContentBounds } from '../domain/graph'

export type ContentBoundsDragHandle =
  | 'none'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'center'

const MINIMUM_SIZE = 0.2

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function rounded(value: number): number {
  return Number(value.toFixed(4))
}

function localPoint(
  bounds: GraphContentBounds,
  canvasWidth: number,
  canvasHeight: number,
  x: number,
  y: number,
) {
  const left = bounds.left * canvasWidth
  const top = bounds.top * canvasHeight
  const right = bounds.right * canvasWidth
  const bottom = bounds.bottom * canvasHeight
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2
  const angle = (-bounds.rotation * Math.PI) / 180
  const deltaX = x - centerX
  const deltaY = y - centerY
  return {
    x: centerX + deltaX * Math.cos(angle) - deltaY * Math.sin(angle),
    y: centerY + deltaX * Math.sin(angle) + deltaY * Math.cos(angle),
    left,
    top,
    right,
    bottom,
    centerX,
    centerY,
  }
}

export function hitTestContentBounds(
  bounds: GraphContentBounds,
  canvasWidth: number,
  canvasHeight: number,
  x: number,
  y: number,
  tolerance: number,
): ContentBoundsDragHandle {
  const point = localPoint(bounds, canvasWidth, canvasHeight, x, y)
  const cornerTolerance = tolerance * 1.35
  const near = (targetX: number, targetY: number, radius: number) =>
    Math.abs(point.x - targetX) <= radius &&
    Math.abs(point.y - targetY) <= radius

  if (near(point.left, point.top, cornerTolerance)) return 'top-left'
  if (near(point.right, point.top, cornerTolerance)) return 'top-right'
  if (near(point.left, point.bottom, cornerTolerance)) return 'bottom-left'
  if (near(point.right, point.bottom, cornerTolerance)) return 'bottom-right'
  if (near(point.centerX, point.top, tolerance)) return 'top'
  if (near(point.centerX, point.bottom, tolerance)) return 'bottom'
  if (near(point.left, point.centerY, tolerance)) return 'left'
  if (near(point.right, point.centerY, tolerance)) return 'right'

  const inHorizontalRange =
    point.x >= point.left - tolerance && point.x <= point.right + tolerance
  const inVerticalRange =
    point.y >= point.top - tolerance && point.y <= point.bottom + tolerance
  if (inHorizontalRange && Math.abs(point.y - point.top) <= tolerance) {
    return 'top'
  }
  if (inHorizontalRange && Math.abs(point.y - point.bottom) <= tolerance) {
    return 'bottom'
  }
  if (inVerticalRange && Math.abs(point.x - point.left) <= tolerance) {
    return 'left'
  }
  if (inVerticalRange && Math.abs(point.x - point.right) <= tolerance) {
    return 'right'
  }
  if (
    point.x >= point.left &&
    point.x <= point.right &&
    point.y >= point.top &&
    point.y <= point.bottom
  ) {
    return 'center'
  }
  return 'none'
}

export function transformContentBounds(
  bounds: GraphContentBounds,
  handle: ContentBoundsDragHandle,
  canvasWidth: number,
  canvasHeight: number,
  deltaX: number,
  deltaY: number,
): GraphContentBounds {
  const angle = (-bounds.rotation * Math.PI) / 180
  const localDeltaX = deltaX * Math.cos(angle) - deltaY * Math.sin(angle)
  const localDeltaY = deltaX * Math.sin(angle) + deltaY * Math.cos(angle)
  const normalizedX = localDeltaX / canvasWidth
  const normalizedY = localDeltaY / canvasHeight
  let { left, top, right, bottom } = bounds

  if (handle === 'center') {
    const width = right - left
    const height = bottom - top
    left = clamp(left + normalizedX, 0, 1 - width)
    top = clamp(top + normalizedY, 0, 1 - height)
    right = left + width
    bottom = top + height
  } else {
    if (
      handle === 'top-left' ||
      handle === 'bottom-left' ||
      handle === 'left'
    ) {
      left = clamp(left + normalizedX, 0, right - MINIMUM_SIZE)
    }
    if (
      handle === 'top-right' ||
      handle === 'bottom-right' ||
      handle === 'right'
    ) {
      right = clamp(right + normalizedX, left + MINIMUM_SIZE, 1)
    }
    if (handle === 'top-left' || handle === 'top-right' || handle === 'top') {
      top = clamp(top + normalizedY, 0, bottom - MINIMUM_SIZE)
    }
    if (
      handle === 'bottom-left' ||
      handle === 'bottom-right' ||
      handle === 'bottom'
    ) {
      bottom = clamp(bottom + normalizedY, top + MINIMUM_SIZE, 1)
    }
  }

  return {
    left: rounded(left),
    top: rounded(top),
    right: rounded(right),
    bottom: rounded(bottom),
    rotation: bounds.rotation,
  }
}
