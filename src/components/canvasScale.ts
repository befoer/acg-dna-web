export function computeFitScale(
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): number {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    canvasWidth <= 0 ||
    canvasHeight <= 0
  ) {
    return 1
  }
  return Math.max(
    0.01,
    Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight),
  )
}
