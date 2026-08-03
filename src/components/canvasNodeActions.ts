export type CanvasNodeAction = 'image' | 'child' | 'delete'

export interface CanvasNodeActionRequest {
  nodeId: string
  action: CanvasNodeAction
}

export interface CanvasNodeActionGeometry {
  distance: number
  angles: readonly [number, number, number]
}

export interface CanvasNodeActionAnchor {
  nodeX: number
  nodeY: number
  width: number
  height: number
}

const ACTION_CENTER_ANGLE = -45
const ACTION_BUTTON_SEPARATION = 48
const MINIMUM_ACTION_DISTANCE = 94

export function resolveCanvasNodeActionCenterAngle(
  anchor: CanvasNodeActionAnchor,
  isMobile: boolean,
): number {
  if (!isMobile) return ACTION_CENTER_ANGLE

  const candidates = [
    { angle: -45, xDirection: 1, yDirection: -1 },
    { angle: -135, xDirection: -1, yDirection: -1 },
    { angle: 45, xDirection: 1, yDirection: 1 },
    { angle: 135, xDirection: -1, yDirection: 1 },
  ]
  let best = candidates[0]!
  let bestClearance = -Infinity

  for (const candidate of candidates) {
    const horizontalClearance =
      candidate.xDirection > 0 ? anchor.width - anchor.nodeX : anchor.nodeX
    const verticalClearance =
      candidate.yDirection > 0 ? anchor.height - anchor.nodeY : anchor.nodeY
    const clearance = Math.min(horizontalClearance, verticalClearance)
    if (clearance > bestClearance) {
      best = candidate
      bestClearance = clearance
    }
  }
  return best.angle
}

export function computeCanvasNodeActionGeometry(
  displayedNodeRadius: number,
  centerAngle = ACTION_CENTER_ANGLE,
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
    angles: [centerAngle - angleStep, centerAngle, centerAngle + angleStep],
  }
}
