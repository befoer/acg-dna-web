export interface CanvasPosition {
  x: number
  y: number
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

export function nudgeCanvasPosition(
  position: CanvasPosition,
  deltaX: number,
  deltaY: number,
  canvasWidth: number,
  canvasHeight: number,
): CanvasPosition {
  return {
    x: clamp(position.x + deltaX / Math.max(1, canvasWidth)),
    y: clamp(position.y + deltaY / Math.max(1, canvasHeight)),
  }
}
