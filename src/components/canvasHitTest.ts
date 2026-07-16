import type { LayoutNode } from '../layout/basicLayout'

export function findLayoutNodeAtPoint(
  nodes: LayoutNode[],
  x: number,
  y: number,
  minimumHitRadius: number,
): LayoutNode | undefined {
  const measured = [...nodes].reverse().map((node) => ({
    node,
    distance: Math.hypot(node.x - x, node.y - y),
  }))
  const directHit = measured.find(
    ({ node, distance }) => distance <= node.radius,
  )
  if (directHit) return directHit.node

  let nearest: { node: LayoutNode; distance: number } | undefined
  for (const candidate of measured) {
    if (
      candidate.distance <= Math.max(candidate.node.radius, minimumHitRadius) &&
      (!nearest || candidate.distance < nearest.distance)
    ) {
      nearest = candidate
    }
  }
  return nearest?.node
}
