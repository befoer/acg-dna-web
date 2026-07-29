import type {
  GraphAttribute,
  GraphCategory,
  GraphDocument,
  GraphImageTransform,
  GraphLabelSettings,
  GraphNodeKind,
  GraphSubAttribute,
} from '../domain/graph'
import { resolveCategoryAppearance } from '../domain/graph'

export interface LayoutNode {
  id: string
  name: string
  kind: GraphNodeKind
  categoryId: string
  value: number
  color: string
  x: number
  y: number
  radius: number
  imageAssetId?: string
  imageTransform?: GraphImageTransform
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
  categoryId: string
  value: number
  color: string
  radius: number
  x: number
  y: number
  imageAssetId?: string
  imageTransform?: GraphImageTransform
  children: PackedNode[]
}

const TAU = Math.PI * 2
const ANGLE_STEPS = 48
const EPSILON = 0.0001
const FLAT_MODE_ITEM_VALUE_EXPONENT = 1.35
const SIBLING_GAP_INCREMENT = 1

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
  imageTransform: GraphImageTransform | undefined,
): T {
  if (imageAssetId) {
    node.imageAssetId = imageAssetId
  }
  if (imageTransform) {
    node.imageTransform = { ...imageTransform }
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

function buildSubAttribute(
  node: GraphSubAttribute,
  color: string,
  categoryId: string,
): PackedNode {
  return withOptionalImage(
    {
      id: node.id,
      name: node.name,
      kind: 'subAttribute',
      categoryId,
      value: node.value,
      color,
      radius: leafRadius(node.value),
      x: 0,
      y: 0,
      children: [],
    },
    node.imageAssetId,
    node.imageTransform,
  )
}

function buildAttribute(
  node: GraphAttribute,
  color: string,
  categoryId: string,
): PackedNode {
  const children = node.children
    .filter((child) => !child.hidden)
    .sort(compareByValueThenId)
    .map((child) => buildSubAttribute(child, color, categoryId))
  const contentRadius = packSiblings(children, 9 + SIBLING_GAP_INCREMENT)
  const radius = containerRadius(node.value, 'attribute')
  fitChildrenInsideParent(children, contentRadius, radius, 22)

  return withOptionalImage(
    {
      id: node.id,
      name: node.name,
      kind: 'attribute',
      categoryId,
      value: node.value,
      color,
      radius,
      x: 0,
      y: 0,
      children,
    },
    node.imageAssetId,
    node.imageTransform,
  )
}

function buildCategory(
  node: GraphCategory,
  globalSettings: GraphLabelSettings,
): PackedNode {
  const children = node.attributes
    .filter((attribute) => !attribute.hidden)
    .sort(compareByValueThenId)
    .map((attribute) => buildAttribute(attribute, node.color, node.id))
  const contentRadius = packSiblings(children, 14 + SIBLING_GAP_INCREMENT)
  const radius =
    containerRadius(node.value, 'category') *
    resolveCategoryAppearance(node, globalSettings).fillFactor
  fitChildrenInsideParent(children, contentRadius, radius, 34)

  return withOptionalImage(
    {
      id: node.id,
      name: node.name,
      kind: 'category',
      categoryId: node.id,
      value: node.value,
      color: node.color,
      radius,
      x: 0,
      y: 0,
      children,
    },
    node.imageAssetId,
    node.imageTransform,
  )
}

function buildFlatAttribute(
  node: GraphAttribute,
  category: GraphCategory,
  globalSettings: GraphLabelSettings,
): PackedNode {
  const amplifiedValue = Math.pow(
    Math.max(1, node.value),
    FLAT_MODE_ITEM_VALUE_EXPONENT,
  )
  const packed = buildAttribute(
    { ...node, value: amplifiedValue },
    category.color,
    category.id,
  )
  scalePackedNode(
    packed,
    resolveCategoryAppearance(category, globalSettings).fillFactor,
  )
  return packed
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
    categoryId: node.categoryId,
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
  if (node.imageTransform) {
    placed.imageTransform = { ...node.imageTransform }
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

  const visibleCategories = document.categories
    .filter((category) => !category.hidden)
    .sort(compareByValueThenId)
  const packedRoots = document.canvas.labelSettings.showCategoryNodes
    ? visibleCategories.map((category) =>
        buildCategory(category, document.canvas.labelSettings),
      )
    : visibleCategories.flatMap((category) =>
        category.attributes
          .filter((attribute) => !attribute.hidden)
          .sort(compareByValueThenId)
          .map((attribute) =>
            buildFlatAttribute(
              attribute,
              category,
              document.canvas.labelSettings,
            ),
          ),
      )

  if (packedRoots.length === 0) {
    return { width, height, roots: [], flatNodes: [] }
  }

  packSiblings(packedRoots, 24 + SIBLING_GAP_INCREMENT)
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
