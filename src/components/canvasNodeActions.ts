export type CanvasNodeAction = 'image' | 'child' | 'delete'

export interface CanvasNodeActionRequest {
  nodeId: string
  action: CanvasNodeAction
}

export interface CanvasNodeActionGeometry {
  distance: number
  angles: readonly [number, number, number]
}

const ACTION_CENTER_ANGLE = -45
const ACTION_BUTTON_SEPARATION = 48
const MINIMUM_ACTION_DISTANCE = 94

export function computeCanvasNodeActionGeometry(
  displayedNodeRadius: number,
): CanvasNodeActionGeometry {
  const distance = Math.max(
    MINIMUM_ACTION_DISTANCE,
    Math.max(0, displayedNodeRadius) + 34,
  )
  const angleStep =
    (2 *
      Math.asin(Math.min(1, ACTION_BUTTON_SEPARATION / (2 * distance))) *
      180) /
    Math.PI
  return {
    distance,
    angles: [
      ACTION_CENTER_ANGLE - angleStep,
      ACTION_CENTER_ANGLE,
      ACTION_CENTER_ANGLE + angleStep,
    ],
  }
}
