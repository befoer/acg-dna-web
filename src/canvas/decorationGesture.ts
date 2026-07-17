import type { GraphDecorationImage } from '../domain/graph'

export interface GesturePoint {
  x: number
  y: number
}

export interface DecorationGestureStart {
  first: GesturePoint
  second: GesturePoint
}

function midpoint(first: GesturePoint, second: GesturePoint): GesturePoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

function angle(first: GesturePoint, second: GesturePoint): number {
  return Math.atan2(second.y - first.y, second.x - first.x)
}

function distance(first: GesturePoint, second: GesturePoint): number {
  return Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function normalizedRotation(value: number): number {
  let rotation = value
  while (rotation > 180) rotation -= 360
  while (rotation < -180) rotation += 360
  return rotation
}

export function transformDecorationGesture(
  image: Pick<GraphDecorationImage, 'x' | 'y' | 'size' | 'rotation'>,
  start: DecorationGestureStart,
  current: DecorationGestureStart,
  canvasWidth: number,
  canvasHeight: number,
): Pick<GraphDecorationImage, 'x' | 'y' | 'size' | 'rotation'> {
  const startMidpoint = midpoint(start.first, start.second)
  const currentMidpoint = midpoint(current.first, current.second)
  const scale =
    distance(current.first, current.second) /
    distance(start.first, start.second)
  const rotationDelta =
    ((angle(current.first, current.second) - angle(start.first, start.second)) *
      180) /
    Math.PI

  return {
    x: clamp(
      image.x + (currentMidpoint.x - startMidpoint.x) / canvasWidth,
      0,
      1,
    ),
    y: clamp(
      image.y + (currentMidpoint.y - startMidpoint.y) / canvasHeight,
      0,
      1,
    ),
    size: clamp(image.size * scale, 0.05, 1.5),
    rotation: normalizedRotation(image.rotation + rotationDelta),
  }
}
