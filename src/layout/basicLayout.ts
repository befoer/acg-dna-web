import type {
  GraphAttribute,
  GraphCategory,
  GraphDocument,
  GraphNodeKind,
  GraphSubAttribute,
} from '../domain/graph'

export interface LayoutNode {
  id: string
  name: string
  kind: GraphNodeKind
  value: number
  color: string
  x: number
  y: number
  radius: number
  imageAssetId?: string
  children: LayoutNode[]
}

export interface BasicLayoutOptions {
  width: number
  height: number
  horizontalPadding?: number
  topInset?: number
  bottomInset?: number
}

export interface BasicLayoutResult {
  width: number
  height: number
  roots: LayoutNode[]
  flatNodes: LayoutNode[]
}

interface PackedNode {
  id: string
  name: string
  kind: GraphNodeKind
  value: number
  color: string
  radius: number
  x: number
  y: number
  imageAssetId?: string
  children: PackedNode[]
}

const TAU = Math.PI * 2
const ANGLE_STEPS = 48
const EPSILON = 0.0001

function compareIds(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function compareByValueThenId<T extends { id: string; value: number }>(
  left: T,
  right: T,
): number {
  return right.value - left.value || compareIds(left.id, right.id)
}

function safeSquareRoot(value: number): number {
  return Math.sqrt(Math.max(1, Number.isFinite(value) ? value : 1))
}

function leafRadius(value: number): number {
  return 28 + safeSquareRoot(value) * 5.2
}

function containerRadius(
  value: number,
  kind: 'attribute' | 'category',
): number {
  return kind === 'attribute'
    ? 82 + safeSquareRoot(value) * 8
    : 170 + safeSquareRoot(value) * 14
}

function collides(
  x: number,
  y: number,
  radius: number,
  placed: PackedNode[],
  padding: number,
): boolean {
  return placed.some((node) => {
    const minimumDistance = node.radius + radius + padding
    return Math.hypot(x - node.x, y - node.y) + EPSILON < minimumDistance
  })
}

function containingRadius(nodes: PackedNode[]): number {
  return nodes.reduce(
    (largest, node) =>
      Math.max(largest, Math.hypot(node.x, node.y) + node.radius),
    0,
  )
}

function packSiblings(nodes: PackedNode[], padding: number): number {
  if (nodes.length === 0) {
    return 0
  }

  nodes.sort(
    (left, right) =>
      right.radius - left.radius || compareIds(left.id, right.id),
  )
  const placed: PackedNode[] = []

  for (const node of nodes) {
    if (placed.length === 0) {
      node.x = 0
      node.y = 0
      placed.push(node)
      continue
    }

    if (placed.length === 1) {
      const first = placed[0]!
      node.x = first.radius + node.radius + padding
      node.y = 0
      placed.push(node)
      continue
    }

    let best:
      { x: number; y: number; radius: number; distance: number } | undefined

    for (const anchor of placed) {
      const tangentDistance = anchor.radius + node.radius + padding
      for (let step = 0; step < ANGLE_STEPS; step += 1) {
        const angle = (step / ANGLE_STEPS) * TAU
        const x = anchor.x + Math.cos(angle) * tangentDistance
        const y = anchor.y + Math.sin(angle) * tangentDistance
        if (collides(x, y, node.radius, placed, padding)) {
          continue
        }

        node.x = x
        node.y = y
        const radius = containingRadius([...placed, node])
        const distance = Math.hypot(x, y)
        const isBetter =
          !best ||
          radius < best.radius - EPSILON ||
          (Math.abs(radius - best.radius) <= EPSILON &&
            (distance < best.distance - EPSILON ||
              (Math.abs(distance - best.distance) <= EPSILON &&
                (Math.abs(y) < Math.abs(best.y) - EPSILON ||
                  (Math.abs(Math.abs(y) - Math.abs(best.y)) <= EPSILON &&
                    x < best.x)))))

        if (isBetter) {
          best = { x, y, radius, distance }
        }
      }
    }

    if (best) {
      node.x = best.x
      node.y = best.y
    } else {
      const rightEdge = Math.max(...placed.map((item) => item.x + item.radius))
      node.x = rightEdge + padding + node.radius
      node.y = 0
    }
    placed.push(node)
  }

  const minX = Math.min(...nodes.map((node) => node.x - node.radius))
  const maxX = Math.max(...nodes.map((node) => node.x + node.radius))
  const minY = Math.min(...nodes.map((node) => node.y - node.radius))
  const maxY = Math.max(...nodes.map((node) => node.y + node.radius))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  for (const node of nodes) {
    node.x -= centerX
    node.y -= centerY
  }

  return containingRadius(nodes)
}

function withOptionalImage<T extends PackedNode>(
  node: T,
  imageAssetId: string | undefined,
): T {
  if (imageAssetId) {
    node.imageAssetId = imageAssetId
  }
  return node
}

function scalePackedNode(node: PackedNode, factor: number): void {
  node.x *= factor
  node.y *= factor
  node.radius *= factor
  node.children.forEach((child) => scalePackedNode(child, factor))
}

function fitChildrenInsideParent(
  children: PackedNode[],
  contentRadius: number,
  parentRadius: number,
  inset: number,
): void {
  if (contentRadius <= EPSILON) return
  const availableRadius = Math.max(EPSILON, parentRadius - inset)
  const factor = availableRadius / contentRadius
  children.forEach((child) => scalePackedNode(child, factor))
}

function buildSubAttribute(node: GraphSubAttribute, color: string): PackedNode {
  return withOptionalImage(
    {
      id: node.id,
      name: node.name,
      kind: 'subAttribute',
      value: node.value,
      color,
      radius: leafRadius(node.value),
      x: 0,
      y: 0,
      children: [],
    },
    node.imageAssetId,
  )
}

function buildAttribute(node: GraphAttribute, color: string): PackedNode {
  const children = node.children
    .filter((child) => !child.hidden)
    .sort(compareByValueThenId)
    .map((child) => buildSubAttribute(child, color))
  const contentRadius = packSiblings(children, 9)
  const radius = containerRadius(node.value, 'attribute')
  fitChildrenInsideParent(children, contentRadius, radius, 22)

  return withOptionalImage(
    {
      id: node.id,
      name: node.name,
      kind: 'attribute',
      value: node.value,
      color,
      radius,
      x: 0,
      y: 0,
      children,
    },
    node.imageAssetId,
  )
}

function buildCategory(node: GraphCategory): PackedNode {
  const children = node.attributes
    .filter((attribute) => !attribute.hidden)
    .sort(compareByValueThenId)
    .map((attribute) => buildAttribute(attribute, node.color))
  const contentRadius = packSiblings(children, 14)
  const radius = containerRadius(node.value, 'category')
  fitChildrenInsideParent(children, contentRadius, radius, 34)

  return withOptionalImage(
    {
      id: node.id,
      name: node.name,
      kind: 'category',
      value: node.value,
      color: node.color,
      radius,
      x: 0,
      y: 0,
      children,
    },
    node.imageAssetId,
  )
}

function placeNode(
  node: PackedNode,
  originX: number,
  originY: number,
  scale: number,
): LayoutNode {
  const x = originX + node.x * scale
  const y = originY + node.y * scale
  const children = node.children.map((child) => placeNode(child, x, y, scale))
  const placed: LayoutNode = {
    id: node.id,
    name: node.name,
    kind: node.kind,
    value: node.value,
    color: node.color,
    x,
    y,
    radius: node.radius * scale,
    children,
  }
  if (node.imageAssetId) {
    placed.imageAssetId = node.imageAssetId
  }
  return placed
}

function flattenNodes(nodes: LayoutNode[]): LayoutNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)])
}

export function createBasicLayout(
  document: GraphDocument,
  options: BasicLayoutOptions = {
    width: document.canvas.width,
    height: document.canvas.height,
  },
): BasicLayoutResult {
  const width = Math.max(1, options.width)
  const height = Math.max(1, options.height)
  const horizontalPadding = options.horizontalPadding ?? width * 0.065
  const topInset = options.topInset ?? height * 0.14
  const bottomInset = options.bottomInset ?? height * 0.065
  const availableWidth = Math.max(1, width - horizontalPadding * 2)
  const availableHeight = Math.max(1, height - topInset - bottomInset)

  const packedRoots = document.categories
    .filter((category) => !category.hidden)
    .sort(compareByValueThenId)
    .map(buildCategory)

  if (packedRoots.length === 0) {
    return { width, height, roots: [], flatNodes: [] }
  }

  packSiblings(packedRoots, 24)
  const minX = Math.min(...packedRoots.map((node) => node.x - node.radius))
  const maxX = Math.max(...packedRoots.map((node) => node.x + node.radius))
  const minY = Math.min(...packedRoots.map((node) => node.y - node.radius))
  const maxY = Math.max(...packedRoots.map((node) => node.y + node.radius))
  const packedWidth = Math.max(EPSILON, maxX - minX)
  const packedHeight = Math.max(EPSILON, maxY - minY)
  const scale = Math.min(
    availableWidth / packedWidth,
    availableHeight / packedHeight,
  )
  const packedCenterX = (minX + maxX) / 2
  const packedCenterY = (minY + maxY) / 2
  const originX = width / 2 - packedCenterX * scale
  const originY = topInset + availableHeight / 2 - packedCenterY * scale
  const roots = packedRoots.map((node) =>
    placeNode(node, originX, originY, scale),
  )

  return {
    width,
    height,
    roots,
    flatNodes: flattenNodes(roots),
  }
}
