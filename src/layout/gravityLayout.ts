import { resolveCategoryAppearance, type GraphDocument } from '../domain/graph'
import {
  createBasicLayout,
  type BasicLayoutOptions,
  type BasicLayoutResult,
  type LayoutNode,
} from './basicLayout'

export interface GravityLayoutOptions extends BasicLayoutOptions {
  iterations?: number
  collisionPasses?: number
}

export interface CircleCollisionBody {
  id: string
  x: number
  y: number
  radius: number
}

interface PhysicsBody extends CircleCollisionBody {
  velocityX: number
  velocityY: number
  node: LayoutNode
}

interface RectBoundary {
  left: number
  top: number
  right: number
  bottom: number
}

interface CircleBoundary {
  x: number
  y: number
  radius: number
  inset: number
}

const TAU = Math.PI * 2
const GOLDEN_ANGLE = 137.508 * (Math.PI / 180)
const EPSILON = 0.0001
const CIRCLE_CONTACT_GAP = 1
const VALIDATION_EPSILON = 0.02
const TOP_LABEL_FONT_SIZE_RATIO = 0.18
const TOP_LABEL_COLLISION_HEIGHT_RATIO = 0.04
const TOP_LABEL_VERTICAL_OFFSET_RATIO = 0.02
const TOP_LABEL_HORIZONTAL_PADDING_RATIO = 0.02

interface TopLabelCollisionBox {
  centerX: number
  centerY: number
  halfWidth: number
  halfHeight: number
}

function getTopLabelCollisionBox(
  body: Pick<CircleCollisionBody, 'x' | 'y' | 'radius'> & { name: string },
): TopLabelCollisionBox {
  const fontSize = body.radius * TOP_LABEL_FONT_SIZE_RATIO
  const characterCount = Math.min(Array.from(body.name).length, 6)
  const estimatedWidth = characterCount * fontSize + fontSize * 0.35
  return {
    centerX: body.x,
    centerY:
      body.y - body.radius - body.radius * TOP_LABEL_VERTICAL_OFFSET_RATIO,
    halfWidth:
      estimatedWidth / 2 + body.radius * TOP_LABEL_HORIZONTAL_PADDING_RATIO,
    halfHeight: body.radius * TOP_LABEL_COLLISION_HEIGHT_RATIO,
  }
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function fallbackNormal(
  leftId: string,
  rightId: string,
  seed: string,
): { x: number; y: number } {
  const ordered =
    leftId <= rightId
      ? `${seed}\u0000${leftId}\u0000${rightId}`
      : `${seed}\u0000${rightId}\u0000${leftId}`
  const angle = (stableHash(ordered) / 0x1_0000_0000) * TAU
  const direction = {
    x: Math.cos(angle),
    y: Math.sin(angle),
  }
  return leftId <= rightId ? direction : { x: -direction.x, y: -direction.y }
}

function stableUnit(value: string): number {
  return stableHash(value) / 0x1_0000_0000
}

export function separateCircleCollisions(
  bodies: CircleCollisionBody[],
  gap = 0,
  seed = '',
): void {
  for (let leftIndex = 0; leftIndex < bodies.length; leftIndex += 1) {
    const left = bodies[leftIndex]
    if (!left) continue

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < bodies.length;
      rightIndex += 1
    ) {
      const right = bodies[rightIndex]
      if (!right) continue

      const minimumDistance =
        Math.max(0, left.radius) + Math.max(0, right.radius) + Math.max(0, gap)
      const deltaX = right.x - left.x
      const deltaY = right.y - left.y
      const distance = Math.hypot(deltaX, deltaY)
      if (distance + EPSILON >= minimumDistance) continue

      const normal =
        distance > EPSILON
          ? { x: deltaX / distance, y: deltaY / distance }
          : fallbackNormal(left.id, right.id, seed)
      const overlap = (minimumDistance - distance) / 2
      left.x -= normal.x * overlap
      left.y -= normal.y * overlap
      right.x += normal.x * overlap
      right.y += normal.y * overlap
    }
  }
}

function resolveTopLabelCollision(
  labelOwner: PhysicsBody,
  other: PhysicsBody,
  topLabelNodeIds: ReadonlySet<string>,
  collisionGap: number,
): void {
  if (!topLabelNodeIds.has(labelOwner.id)) return
  const box = getTopLabelCollisionBox({
    x: labelOwner.x,
    y: labelOwner.y,
    radius: labelOwner.radius,
    name: labelOwner.node.name,
  })
  const halfWidth = box.halfWidth + collisionGap * 0.5
  const halfHeight = box.halfHeight + collisionGap * 0.25
  const closestX = clamp(
    other.x,
    box.centerX - halfWidth,
    box.centerX + halfWidth,
  )
  const closestY = clamp(
    other.y,
    box.centerY - halfHeight,
    box.centerY + halfHeight,
  )
  const deltaX = other.x - closestX
  const deltaY = other.y - closestY
  const distanceSquared = deltaX * deltaX + deltaY * deltaY
  const minimumDistance = other.radius + collisionGap * 0.35
  if (distanceSquared >= minimumDistance * minimumDistance) return

  const distance = Math.sqrt(distanceSquared)
  const fallbackX = other.x - box.centerX
  const fallbackY = other.y - box.centerY
  let normalX: number
  let normalY: number
  if (distance > EPSILON) {
    normalX = deltaX / distance
    normalY = deltaY / distance
  } else if (Math.abs(fallbackX) > EPSILON || Math.abs(fallbackY) > EPSILON) {
    const fallbackDistance = Math.hypot(fallbackX, fallbackY)
    normalX = fallbackX / fallbackDistance
    normalY = fallbackY / fallbackDistance
  } else {
    normalX = 0
    normalY = -1
  }
  const overlap = ((minimumDistance - distance) / 2) * 1.1
  labelOwner.x -= normalX * overlap
  labelOwner.y -= normalY * overlap
  other.x += normalX * overlap
  other.y += normalY * overlap
}

function resolveTopLabelCollisions(
  bodies: PhysicsBody[],
  topLabelNodeIds: ReadonlySet<string>,
  collisionGap: number,
): void {
  for (let leftIndex = 0; leftIndex < bodies.length; leftIndex += 1) {
    const left = bodies[leftIndex]
    if (!left) continue
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < bodies.length;
      rightIndex += 1
    ) {
      const right = bodies[rightIndex]
      if (!right) continue
      resolveTopLabelCollision(left, right, topLabelNodeIds, collisionGap)
      resolveTopLabelCollision(right, left, topLabelNodeIds, collisionGap)
    }
  }
}

function topLabelsDoNotOverlap(
  bodies: PhysicsBody[],
  topLabelNodeIds: ReadonlySet<string>,
): boolean {
  for (const labelOwner of bodies) {
    if (!topLabelNodeIds.has(labelOwner.id)) continue
    const box = getTopLabelCollisionBox({
      x: labelOwner.x,
      y: labelOwner.y,
      radius: labelOwner.radius,
      name: labelOwner.node.name,
    })
    for (const other of bodies) {
      if (other === labelOwner) continue
      const closestX = clamp(
        other.x,
        box.centerX - box.halfWidth,
        box.centerX + box.halfWidth,
      )
      const closestY = clamp(
        other.y,
        box.centerY - box.halfHeight,
        box.centerY + box.halfHeight,
      )
      if (
        Math.hypot(other.x - closestX, other.y - closestY) +
          VALIDATION_EPSILON <
        other.radius
      ) {
        return false
      }
    }
  }
  return true
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function constrainToRectangle(
  bodies: CircleCollisionBody[],
  boundary: RectBoundary,
): void {
  for (const body of bodies) {
    const minimumX = boundary.left + body.radius
    const maximumX = boundary.right - body.radius
    const minimumY = boundary.top + body.radius
    const maximumY = boundary.bottom - body.radius

    body.x =
      minimumX <= maximumX
        ? clamp(body.x, minimumX, maximumX)
        : (boundary.left + boundary.right) / 2
    body.y =
      minimumY <= maximumY
        ? clamp(body.y, minimumY, maximumY)
        : (boundary.top + boundary.bottom) / 2
  }
}

function constrainPhysicsToRectangle(
  bodies: PhysicsBody[],
  boundary: RectBoundary,
): void {
  for (const body of bodies) {
    const previousX = body.x
    const previousY = body.y
    constrainToRectangle([body], boundary)
    if (body.x !== previousX) body.velocityX *= 0.18
    if (body.y !== previousY) body.velocityY *= 0.18
  }
}

function constrainTopLevelToRectangle(
  bodies: PhysicsBody[],
  boundary: RectBoundary,
  topLabelNodeIds: ReadonlySet<string>,
): void {
  for (const body of bodies) {
    const previousX = body.x
    const previousY = body.y
    const topLabelMargin = topLabelNodeIds.has(body.id)
      ? body.radius *
        (TOP_LABEL_VERTICAL_OFFSET_RATIO + TOP_LABEL_COLLISION_HEIGHT_RATIO)
      : 0
    const minimumX = boundary.left + body.radius
    const maximumX = boundary.right - body.radius
    const minimumY = boundary.top + body.radius + topLabelMargin
    const maximumY = boundary.bottom - body.radius
    body.x =
      minimumX <= maximumX
        ? clamp(body.x, minimumX, maximumX)
        : (boundary.left + boundary.right) / 2
    body.y =
      minimumY <= maximumY
        ? clamp(body.y, minimumY, maximumY)
        : (boundary.top + boundary.bottom) / 2
    if (body.x !== previousX) body.velocityX *= 0.18
    if (body.y !== previousY) body.velocityY *= 0.18
  }
}

function constrainPhysicsToCircle(
  bodies: PhysicsBody[],
  boundary: CircleBoundary,
): void {
  for (const body of bodies) {
    const previousX = body.x
    const previousY = body.y
    const deltaX = body.x - boundary.x
    const deltaY = body.y - boundary.y
    const distance = Math.hypot(deltaX, deltaY)
    const maximumDistance = Math.max(
      0,
      boundary.radius - body.radius - boundary.inset,
    )

    if (distance > maximumDistance) {
      if (distance > EPSILON) {
        body.x = boundary.x + (deltaX / distance) * maximumDistance
        body.y = boundary.y + (deltaY / distance) * maximumDistance
      } else {
        body.x = boundary.x
        body.y = boundary.y
      }
    }
    if (body.x !== previousX) body.velocityX *= 0.18
    if (body.y !== previousY) body.velocityY *= 0.18
  }
}

function bodiesDoNotOverlap(bodies: CircleCollisionBody[]): boolean {
  for (let leftIndex = 0; leftIndex < bodies.length; leftIndex += 1) {
    const left = bodies[leftIndex]
    if (!left) continue
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < bodies.length;
      rightIndex += 1
    ) {
      const right = bodies[rightIndex]
      if (!right) continue
      if (
        Math.hypot(right.x - left.x, right.y - left.y) + EPSILON <
        left.radius + right.radius
      ) {
        return false
      }
    }
  }
  return true
}

function bodiesAreInsideCircle(
  bodies: CircleCollisionBody[],
  boundary: CircleBoundary,
): boolean {
  return bodies.every(
    (body) =>
      Number.isFinite(body.x) &&
      Number.isFinite(body.y) &&
      Number.isFinite(body.radius) &&
      body.radius > 0 &&
      Math.hypot(body.x - boundary.x, body.y - boundary.y) +
        body.radius +
        boundary.inset <=
        boundary.radius + VALIDATION_EPSILON,
  )
}

function snapshotBodies(bodies: CircleCollisionBody[]) {
  return bodies.map(({ x, y }) => ({ x, y }))
}

function restoreBodies(
  bodies: CircleCollisionBody[],
  positions: Array<{ x: number; y: number }>,
): void {
  bodies.forEach((body, index) => {
    const position = positions[index]
    if (!position) return
    body.x = position.x
    body.y = position.y
  })
}

function findContactComponents(
  bodies: CircleCollisionBody[],
  maximumSurfaceGap: number,
): number[][] {
  const remaining = new Set(bodies.map((_, index) => index))
  const components: number[][] = []

  while (remaining.size > 0) {
    const first = remaining.values().next().value as number
    const component: number[] = []
    const pending = [first]
    remaining.delete(first)

    while (pending.length > 0) {
      const index = pending.pop()
      if (index === undefined) continue
      const body = bodies[index]
      if (!body) continue
      component.push(index)

      for (const candidateIndex of remaining) {
        const candidate = bodies[candidateIndex]
        if (!candidate) continue
        const surfaceGap =
          Math.hypot(candidate.x - body.x, candidate.y - body.y) -
          (body.radius + candidate.radius)
        if (surfaceGap > maximumSurfaceGap) continue
        remaining.delete(candidateIndex)
        pending.push(candidateIndex)
      }
    }
    components.push(component)
  }

  return components
}

function maximumRigidTranslationFactor(
  bodies: CircleCollisionBody[],
  indices: number[],
  deltaX: number,
  deltaY: number,
  boundary: RectBoundary,
): number {
  let factor = 1
  for (const index of indices) {
    const body = bodies[index]
    if (!body) continue
    if (deltaX > EPSILON) {
      factor = Math.min(
        factor,
        (boundary.right - body.radius - body.x) / deltaX,
      )
    } else if (deltaX < -EPSILON) {
      factor = Math.min(factor, (boundary.left + body.radius - body.x) / deltaX)
    }
    if (deltaY > EPSILON) {
      factor = Math.min(
        factor,
        (boundary.bottom - body.radius - body.y) / deltaY,
      )
    } else if (deltaY < -EPSILON) {
      factor = Math.min(factor, (boundary.top + body.radius - body.y) / deltaY)
    }
  }
  return clamp(factor, 0, 1)
}

function maximumCollisionFreeTranslationFactor(
  bodies: CircleCollisionBody[],
  movingIndices: number[],
  deltaX: number,
  deltaY: number,
): number {
  const movementDistance = Math.hypot(deltaX, deltaY)
  if (movementDistance <= EPSILON) return 0
  const directionX = deltaX / movementDistance
  const directionY = deltaY / movementDistance
  const moving = new Set(movingIndices)
  let maximumDistance = movementDistance

  for (const movingIndex of movingIndices) {
    const body = bodies[movingIndex]
    if (!body) continue
    for (
      let stationaryIndex = 0;
      stationaryIndex < bodies.length;
      stationaryIndex += 1
    ) {
      if (moving.has(stationaryIndex)) continue
      const stationary = bodies[stationaryIndex]
      if (!stationary) continue
      const relativeX = body.x - stationary.x
      const relativeY = body.y - stationary.y
      const projection = relativeX * directionX + relativeY * directionY
      const radiusSum = body.radius + stationary.radius
      const squaredClearance =
        relativeX * relativeX + relativeY * relativeY - radiusSum * radiusSum
      const discriminant = projection * projection - squaredClearance
      if (discriminant < 0) continue
      const firstContactDistance = -projection - Math.sqrt(discriminant)
      if (
        firstContactDistance >= -EPSILON &&
        firstContactDistance < maximumDistance
      ) {
        maximumDistance = Math.max(0, firstContactDistance)
      }
    }
  }

  return clamp(maximumDistance / movementDistance, 0, 1)
}

function translateBodyIndices(
  bodies: CircleCollisionBody[],
  indices: number[],
  deltaX: number,
  deltaY: number,
): void {
  for (const index of indices) {
    const body = bodies[index]
    if (!body) continue
    body.x += deltaX
    body.y += deltaY
  }
}

function closeDisconnectedContactClusters(
  bodies: CircleCollisionBody[],
  boundary: RectBoundary,
  seed: string,
): void {
  if (bodies.length <= 1) return

  for (let connection = 0; connection < bodies.length - 1; connection += 1) {
    const components = findContactComponents(bodies, CIRCLE_CONTACT_GAP + 0.5)
    if (components.length <= 1) return

    let closest:
      | {
          leftComponent: number
          rightComponent: number
          leftIndex: number
          rightIndex: number
          surfaceGap: number
        }
      | undefined
    for (
      let leftComponent = 0;
      leftComponent < components.length;
      leftComponent += 1
    ) {
      const leftIndices = components[leftComponent]
      if (!leftIndices) continue
      for (
        let rightComponent = leftComponent + 1;
        rightComponent < components.length;
        rightComponent += 1
      ) {
        const rightIndices = components[rightComponent]
        if (!rightIndices) continue
        for (const leftIndex of leftIndices) {
          const left = bodies[leftIndex]
          if (!left) continue
          for (const rightIndex of rightIndices) {
            const right = bodies[rightIndex]
            if (!right) continue
            const surfaceGap =
              Math.hypot(right.x - left.x, right.y - left.y) -
              (left.radius + right.radius)
            if (!closest || surfaceGap < closest.surfaceGap) {
              closest = {
                leftComponent,
                rightComponent,
                leftIndex,
                rightIndex,
                surfaceGap,
              }
            }
          }
        }
      }
    }
    if (!closest || closest.surfaceGap <= EPSILON) return

    const left = bodies[closest.leftIndex]
    const right = bodies[closest.rightIndex]
    const leftIndices = components[closest.leftComponent]
    const rightIndices = components[closest.rightComponent]
    if (!left || !right || !leftIndices || !rightIndices) return
    const distance = Math.hypot(right.x - left.x, right.y - left.y)
    if (distance <= EPSILON) return
    const normalX = (right.x - left.x) / distance
    const normalY = (right.y - left.y) / distance
    const sourceIsLeft = leftIndices.length <= rightIndices.length
    const sourceIndices = sourceIsLeft ? leftIndices : rightIndices
    const targetIndices = sourceIsLeft ? rightIndices : leftIndices
    const direction = sourceIsLeft ? 1 : -1
    const desiredX = normalX * closest.surfaceGap * direction
    const desiredY = normalY * closest.surfaceGap * direction
    const sourceBoundaryFactor = maximumRigidTranslationFactor(
      bodies,
      sourceIndices,
      desiredX,
      desiredY,
      boundary,
    )
    const sourceCollisionFactor = maximumCollisionFreeTranslationFactor(
      bodies,
      sourceIndices,
      desiredX,
      desiredY,
    )
    const sourceFactor = Math.min(sourceBoundaryFactor, sourceCollisionFactor)
    translateBodyIndices(
      bodies,
      sourceIndices,
      desiredX * sourceFactor,
      desiredY * sourceFactor,
    )

    const stoppedAtFirstContact =
      sourceCollisionFactor <= sourceBoundaryFactor + EPSILON &&
      sourceCollisionFactor < 1 - EPSILON
    const remainingFactor = 1 - sourceFactor
    if (!stoppedAtFirstContact && remainingFactor > EPSILON) {
      const targetX = -desiredX * remainingFactor
      const targetY = -desiredY * remainingFactor
      const targetFactor = Math.min(
        maximumRigidTranslationFactor(
          bodies,
          targetIndices,
          targetX,
          targetY,
          boundary,
        ),
        maximumCollisionFreeTranslationFactor(
          bodies,
          targetIndices,
          targetX,
          targetY,
        ),
      )
      translateBodyIndices(
        bodies,
        targetIndices,
        targetX * targetFactor,
        targetY * targetFactor,
      )
    }

    for (let pass = 0; pass < 96; pass += 1) {
      separateCircleCollisions(bodies, CIRCLE_CONTACT_GAP, seed)
      constrainToRectangle(bodies, boundary)
    }
  }
}

function translateSubtree(
  node: LayoutNode,
  deltaX: number,
  deltaY: number,
): void {
  node.x += deltaX
  node.y += deltaY
  node.children.forEach((child) => translateSubtree(child, deltaX, deltaY))
}

function scaleSubtreeAround(
  node: LayoutNode,
  originX: number,
  originY: number,
  factor: number,
): void {
  node.x = originX + (node.x - originX) * factor
  node.y = originY + (node.y - originY) * factor
  node.radius *= factor
  node.children.forEach((child) =>
    scaleSubtreeAround(child, originX, originY, factor),
  )
}

function shrinkOverlappingBodiesToFit(bodies: PhysicsBody[]): boolean {
  let factor = 1
  for (let leftIndex = 0; leftIndex < bodies.length; leftIndex += 1) {
    const left = bodies[leftIndex]
    if (!left) continue
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < bodies.length;
      rightIndex += 1
    ) {
      const right = bodies[rightIndex]
      if (!right) continue
      const radiusSum = left.radius + right.radius
      if (radiusSum <= EPSILON) continue
      const distance = Math.hypot(right.x - left.x, right.y - left.y)
      factor = Math.min(factor, distance / radiusSum)
    }
  }
  if (factor >= 1 - EPSILON) return false

  const safeFactor = clamp(factor * 0.998, 0.1, 0.999)
  for (const body of bodies) {
    scaleSubtreeAround(body.node, body.node.x, body.node.y, safeFactor)
    body.radius *= safeFactor
  }
  return true
}

function childTargetAreaRatio(childCount: number): number {
  if (childCount === 1) return 0.64
  if (childCount <= 2) return 0.45 * 1.1
  if (childCount <= 3) return 0.6
  if (childCount <= 4) return 0.62
  if (childCount <= 9) return 0.66
  if (childCount <= 15) return 0.68
  if (childCount <= 23) return 0.7
  return 0.72
}

function minimumChildRadiusRatio(childCount: number): number {
  if (childCount >= 40) return 0.05
  if (childCount >= 24) return 0.07
  if (childCount >= 16) return 0.09
  if (childCount >= 10) return 0.11
  if (childCount >= 6) return 0.13
  return 0.15
}

function scaleChildrenForTargetArea(parent: LayoutNode): void {
  if (parent.children.length === 0) return
  if (parent.children.length === 1) {
    const child = parent.children[0]!
    scaleSubtreeAround(
      child,
      child.x,
      child.y,
      (parent.radius * 0.8) / child.radius,
    )
    return
  }

  // The APP uses a linear value-to-radius curve for descendants. Normalize
  // those relative sizes to the target occupied area, then apply its
  // count-based minimum radius so low values stay usable without flattening
  // the visible difference between low and high weights.
  const radiusWeights = parent.children.map((child) =>
    Math.max(1, Number.isFinite(child.value) ? child.value : 1),
  )
  const weightSquareSum = radiusWeights.reduce(
    (total, weight) => total + weight * weight,
    0,
  )
  if (weightSquareSum <= EPSILON) return
  const weightScale =
    (parent.radius * Math.sqrt(childTargetAreaRatio(parent.children.length))) /
    Math.sqrt(weightSquareSum)
  const minimumRadius =
    parent.radius * minimumChildRadiusRatio(parent.children.length)
  const targetRadii = parent.children.map((_, index) =>
    Math.max(minimumRadius, (radiusWeights[index] ?? 1) * weightScale),
  )
  const twoLargest = [...targetRadii].sort((left, right) => right - left)
  const largestPair = (twoLargest[0] ?? 0) + (twoLargest[1] ?? 0)
  const safeLargestPair = parent.radius * 0.96
  if (largestPair > safeLargestPair) {
    const scalableLargestPair = Math.max(
      EPSILON,
      largestPair - minimumRadius * 2,
    )
    const adaptiveFactor = Math.max(
      0,
      (safeLargestPair - minimumRadius * 2) / scalableLargestPair,
    )
    targetRadii.forEach((radius, index) => {
      targetRadii[index] =
        minimumRadius + (radius - minimumRadius) * adaptiveFactor
    })
  }

  parent.children.forEach((child, index) => {
    const targetRadius = targetRadii[index] ?? minimumRadius
    scaleSubtreeAround(
      child,
      child.x,
      child.y,
      targetRadius / Math.max(EPSILON, child.radius),
    )
  })
}

function flattenNodes(nodes: LayoutNode[]): LayoutNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)])
}

function cloneNode(node: LayoutNode): LayoutNode {
  return {
    ...node,
    children: node.children.map(cloneNode),
  }
}

function initializeFallingPositions(
  bodies: PhysicsBody[],
  boundary: RectBoundary,
  documentId: string,
): void {
  if (bodies.length === 0) return
  const width = boundary.right - boundary.left
  const height = boundary.bottom - boundary.top
  const centerX = (boundary.left + boundary.right) / 2
  const largestRadius = Math.max(...bodies.map((body) => body.radius))
  const averageRadius =
    bodies.reduce((total, body) => total + body.radius, 0) / bodies.length
  const spacing = Math.min(averageRadius * 1.9, Math.min(width, height) * 0.31)
  const startY = Math.min(
    boundary.bottom - largestRadius,
    boundary.top + largestRadius + height * 0.08,
  )
  const angleOffset = stableUnit(documentId + '\u0000gravity-start') * TAU

  bodies.forEach((body, index) => {
    const angle = angleOffset + index * GOLDEN_ANGLE
    const distance = index === 0 ? 0 : spacing * Math.sqrt(index)
    body.x = centerX + Math.cos(angle) * distance
    body.y = startY + Math.sin(angle) * distance * 0.62
    body.velocityX = 0
    body.velocityY = 0
  })
  constrainPhysicsToRectangle(bodies, boundary)
}

function radiusRange(bodies: CircleCollisionBody[]): {
  minimum: number
  range: number
} {
  const radii = bodies.map((body) => body.radius)
  const minimum = Math.min(...radii)
  const maximum = Math.max(...radii)
  return {
    minimum,
    range: Math.max(EPSILON, maximum - minimum),
  }
}

function initializeChildPositions(
  bodies: PhysicsBody[],
  boundary: CircleBoundary,
  documentId: string,
  parentId: string,
  depth: number,
): void {
  if (bodies.length === 0) return
  const averageRadius =
    bodies.reduce((total, body) => total + body.radius, 0) / bodies.length
  const startY = boundary.y - boundary.radius * 0.27
  const angleOffset =
    stableUnit(
      documentId + '\u0000' + parentId + '\u0000child-start-' + String(depth),
    ) * TAU

  if (bodies.length === 2) {
    const separation = Math.min(
      boundary.radius * 0.31,
      (bodies[0]!.radius + bodies[1]!.radius) * 0.72,
    )
    bodies.forEach((body, index) => {
      const direction = index === 0 ? -1 : 1
      body.x = boundary.x + direction * separation
      body.y =
        startY +
        Math.sin(angleOffset + index * Math.PI) * boundary.radius * 0.08
      body.velocityX = 0
      body.velocityY = 0
    })
  } else {
    const spacing = Math.min(
      averageRadius * 1.85,
      boundary.radius * (bodies.length >= 10 ? 0.28 : 0.38),
    )
    bodies.forEach((body, index) => {
      const angle = angleOffset + index * GOLDEN_ANGLE
      const distance = index === 0 ? 0 : spacing * Math.sqrt(index)
      body.x = boundary.x + Math.cos(angle) * distance
      body.y = startY + Math.sin(angle) * distance * 0.72
      body.velocityX = 0
      body.velocityY = 0
    })
  }
  constrainPhysicsToCircle(bodies, boundary)
}

function compactChildrenAgainstGravity(
  bodies: PhysicsBody[],
  boundary: CircleBoundary,
  seed: string,
): void {
  const passes = bodies.length >= 12 ? 160 : 120
  const collisionPasses = bodies.length >= 12 ? 24 : 18

  for (let pass = 0; pass < passes; pass += 1) {
    const progress = (pass + 1) / passes
    const horizontalStrength =
      bodies.length <= 4 ? 0.0015 + progress * 0.0015 : 0.022 + progress * 0.024
    const verticalStrength = 0.04 + progress * 0.04

    for (const body of bodies) {
      const floorY = boundary.y + boundary.radius - body.radius - boundary.inset
      body.x += (boundary.x - body.x) * horizontalStrength
      body.y += (floorY - body.y) * verticalStrength
      body.velocityX = 0
      body.velocityY = 0
    }

    for (
      let collisionPass = 0;
      collisionPass < collisionPasses;
      collisionPass += 1
    ) {
      separateCircleCollisions(bodies, CIRCLE_CONTACT_GAP, seed)
      constrainPhysicsToCircle(bodies, boundary)
    }
  }
}

function spreadChildrenAcrossCircle(
  bodies: PhysicsBody[],
  boundary: CircleBoundary,
  seed: string,
): void {
  const ordered = [...bodies].sort(
    (left, right) =>
      right.radius - left.radius || left.id.localeCompare(right.id),
  )
  const angleOffset = stableUnit(seed + '\u0000spread') * TAU

  ordered.forEach((body, index) => {
    const maximumDistance = Math.max(
      0,
      boundary.radius - body.radius - boundary.inset,
    )
    const distance = maximumDistance * Math.sqrt((index + 0.5) / ordered.length)
    const angle = angleOffset + index * GOLDEN_ANGLE
    body.x = boundary.x + Math.cos(angle) * distance
    body.y = boundary.y + Math.sin(angle) * distance
    body.velocityX = 0
    body.velocityY = 0
  })
}

function resolveChildrenInsideCircle(
  bodies: PhysicsBody[],
  boundary: CircleBoundary,
  seed: string,
): boolean {
  const passes = Math.max(240, bodies.length * 48)

  for (let pass = 0; pass < passes; pass += 1) {
    separateCircleCollisions(bodies, CIRCLE_CONTACT_GAP, seed)
    constrainPhysicsToCircle(bodies, boundary)
    if (bodiesAreInsideCircle(bodies, boundary) && bodiesDoNotOverlap(bodies)) {
      return true
    }
  }

  return false
}

function relaxChildrenInParent(
  parent: LayoutNode,
  documentId: string,
  iterations: number,
  collisionPasses: number,
  depth: number,
): void {
  if (parent.children.length === 0) return
  scaleChildrenForTargetArea(parent)
  const bodies: PhysicsBody[] = parent.children.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    radius: node.radius,
    velocityX: 0,
    velocityY: 0,
    node,
  }))
  // Gravity descendants are allowed to meet the parent's inner edge. Any
  // positive inset remains visible after the canvas is scaled down on PC.
  const inset = 0
  const boundary: CircleBoundary = {
    x: parent.x,
    y: parent.y,
    radius: parent.radius,
    inset,
  }
  let lastValid: ReturnType<typeof snapshotBodies> | undefined
  const radii = radiusRange(bodies)
  const gravity = Math.max(0.025, parent.radius * 0.00062)
  const horizontalAttraction = depth === 1 ? 0.0042 : 0.0048
  const verticalSettleStrength = depth === 1 ? 0.0032 : 0.0036
  const damping = 0.78
  const collisionGap = CIRCLE_CONTACT_GAP
  const collisionSeed = documentId + '\u0000' + parent.id

  initializeChildPositions(bodies, boundary, documentId, parent.id, depth)
  for (let pass = 0; pass < 80; pass += 1) {
    separateCircleCollisions(bodies, collisionGap, collisionSeed)
    constrainPhysicsToCircle(bodies, boundary)
  }
  if (bodiesAreInsideCircle(bodies, boundary) && bodiesDoNotOverlap(bodies)) {
    lastValid = snapshotBodies(bodies)
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const body of bodies) {
      const sizeRatio = (body.radius - radii.minimum) / radii.range
      const maximumDistance = Math.max(0, parent.radius - body.radius - inset)
      const lane =
        (stableUnit(
          documentId +
            '\u0000' +
            parent.id +
            '\u0000' +
            body.id +
            '\u0000child-lane',
        ) -
          0.5) *
        2
      const targetX = parent.x + lane * maximumDistance * 0.04
      const targetY = parent.y + maximumDistance * (0.36 + sizeRatio * 0.05)
      body.velocityX =
        (body.velocityX + (targetX - body.x) * horizontalAttraction) * damping
      body.velocityY =
        (body.velocityY +
          gravity * (0.86 + sizeRatio * 0.3) +
          (targetY - body.y) * verticalSettleStrength) *
        damping
      body.x += body.velocityX
      body.y += body.velocityY
    }

    for (let pass = 0; pass < collisionPasses; pass += 1) {
      separateCircleCollisions(bodies, collisionGap, collisionSeed)
      constrainPhysicsToCircle(bodies, boundary)
    }
    if (bodiesAreInsideCircle(bodies, boundary) && bodiesDoNotOverlap(bodies)) {
      lastValid = snapshotBodies(bodies)
    }
  }

  // Collision separation alone cannot close an existing gap. Finish with a
  // deterministic downward-and-inward compaction, then restore the 1px gap
  // so descendants end in a connected, tangent cluster without intersections.
  compactChildrenAgainstGravity(bodies, boundary, collisionSeed)
  if (bodiesAreInsideCircle(bodies, boundary) && bodiesDoNotOverlap(bodies)) {
    lastValid = snapshotBodies(bodies)
  }

  let resolved = resolveChildrenInsideCircle(
    bodies,
    boundary,
    collisionSeed + '\u0000final',
  )
  if (!resolved) {
    spreadChildrenAcrossCircle(bodies, boundary, collisionSeed)
    resolved = resolveChildrenInsideCircle(
      bodies,
      boundary,
      collisionSeed + '\u0000spread',
    )
  }
  for (let attempt = 0; attempt < 6 && !resolved; attempt += 1) {
    if (!shrinkOverlappingBodiesToFit(bodies)) break
    resolved = resolveChildrenInsideCircle(
      bodies,
      boundary,
      collisionSeed + '\u0000shrink-' + String(attempt),
    )
  }
  if (!resolved && lastValid) {
    restoreBodies(bodies, lastValid)
  }

  for (const body of bodies) {
    translateSubtree(body.node, body.x - body.node.x, body.y - body.node.y)
  }
}

function relaxDescendants(
  parent: LayoutNode,
  documentId: string,
  iterations: number,
  collisionPasses: number,
  depth: number,
): void {
  if (parent.children.length === 0) return
  relaxChildrenInParent(
    parent,
    documentId,
    Math.max(64, Math.round(iterations * (depth === 1 ? 0.68 : 0.52))),
    Math.max(6, Math.round(collisionPasses * 0.82)),
    depth,
  )
  parent.children.forEach((child) =>
    relaxDescendants(child, documentId, iterations, collisionPasses, depth + 1),
  )
}

function scaleTopLevelToTargetArea(
  nodes: LayoutNode[],
  boundary: RectBoundary,
): void {
  if (nodes.length === 0) return
  // Keep the APP's weight contrast visible at the top level. The basic
  // layout adds a large container constant to category radii, which makes a
  // low-weight category almost as large as a high-weight one. Apply a gentle
  // value bias before normalizing the total area so high values grow and low
  // values can become smaller without losing the existing appearance scale.
  const averageValue =
    nodes.reduce(
      (total, node) =>
        total + Math.max(1, Number.isFinite(node.value) ? node.value : 1),
      0,
    ) / nodes.length
  const weightedRadii = nodes.map((node) => {
    const value = Math.max(1, Number.isFinite(node.value) ? node.value : 1)
    const valueBias = clamp(Math.pow(value / averageValue, 0.38), 0.62, 1.52)
    return node.radius * valueBias
  })
  const baseAreaRatio =
    nodes.length <= 2
      ? 0.55
      : nodes.length <= 3
        ? 0.56
        : nodes.length <= 4
          ? 0.64
          : nodes.length <= 6
            ? 0.65
            : nodes.length <= 9
              ? 0.68
              : 0.64
  const areaRatio = baseAreaRatio
  const radiusSquareSum = weightedRadii.reduce(
    (total, radius) => total + radius * radius,
    0,
  )
  const containerArea =
    (boundary.right - boundary.left) * (boundary.bottom - boundary.top)
  if (radiusSquareSum <= EPSILON || containerArea <= EPSILON) return
  const factor = Math.sqrt(
    (containerArea * areaRatio) / (Math.PI * radiusSquareSum),
  )
  nodes.forEach((node) => {
    const value = Math.max(1, Number.isFinite(node.value) ? node.value : 1)
    const valueBias = clamp(Math.pow(value / averageValue, 0.38), 0.62, 1.52)
    scaleSubtreeAround(node, node.x, node.y, factor * valueBias)
  })
}

function relaxTopLevel(
  nodes: LayoutNode[],
  boundary: RectBoundary,
  documentId: string,
  iterations: number,
  collisionPasses: number,
  topLabelNodeIds: ReadonlySet<string>,
): void {
  scaleTopLevelToTargetArea(nodes, boundary)
  const bodies: PhysicsBody[] = nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    radius: node.radius,
    velocityX: 0,
    velocityY: 0,
    node,
  }))
  if (bodies.length === 0) return

  const centerX = (boundary.left + boundary.right) / 2
  const width = boundary.right - boundary.left
  const height = boundary.bottom - boundary.top
  const gravity = Math.max(0.08, height * 0.00017)
  const horizontalAttraction = 0.00105
  const verticalSettleStrength = 0.0018
  const damping = 0.82
  const collisionGap = Math.max(1, Math.min(width, height) * 0.0014)
  const radii = radiusRange(bodies)

  initializeFallingPositions(bodies, boundary, documentId)
  for (let pass = 0; pass < 96; pass += 1) {
    separateCircleCollisions(bodies, collisionGap, documentId)
    constrainPhysicsToRectangle(bodies, boundary)
  }
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const body of bodies) {
      const sizeRatio = (body.radius - radii.minimum) / radii.range
      const availableHalfWidth = Math.max(0, width / 2 - body.radius)
      const lane =
        (stableUnit(documentId + '\u0000' + body.id + '\u0000gravity-lane') -
          0.5) *
        2
      const targetX = centerX + lane * availableHalfWidth * 0.62
      const usableTop = boundary.top + body.radius
      const usableBottom = boundary.bottom - body.radius
      const targetY =
        usableTop +
        Math.max(0, usableBottom - usableTop) * (0.58 + sizeRatio * 0.18)
      body.velocityX =
        (body.velocityX + (targetX - body.x) * horizontalAttraction) * damping
      body.velocityY =
        (body.velocityY +
          gravity * (0.84 + sizeRatio * 0.34) +
          (targetY - body.y) * verticalSettleStrength) *
        damping
      body.x += body.velocityX
      body.y += body.velocityY
    }

    for (let pass = 0; pass < collisionPasses; pass += 1) {
      separateCircleCollisions(bodies, collisionGap, documentId)
      constrainPhysicsToRectangle(bodies, boundary)
    }
  }

  // Keep the APP-style natural gravity deposit. The previous Web-only
  // candidate compactor pulled every category toward the same center line,
  // which intermittently collapsed the result into a horizontal or vertical
  // string. A final collision/boundary pass is enough after the simulation.
  const postGravitySnapshot = snapshotBodies(bodies)
  const candidateRatios =
    bodies.length <= 2
      ? [0.8, 0.9, 1]
      : [0.54, 0.58, 0.62, 0.68, 0.74, 0.82, 0.92, 1]
  const targetAspect = clamp(height / Math.max(1, width), 0.78, 1.5)
  let bestSnapshot = postGravitySnapshot
  let bestScore = -Infinity

  for (const candidateRatio of candidateRatios) {
    restoreBodies(bodies, postGravitySnapshot)
    const pileWidth = Math.min(
      width,
      Math.max(
        width * candidateRatio,
        Math.max(...bodies.map((body) => body.radius)) * 2,
      ),
    )
    const pileLeft = centerX - pileWidth / 2
    const pileRight = centerX + pileWidth / 2
    for (let pass = 0; pass < 240; pass += 1) {
      const progress = (pass + 1) / 240
      const horizontalStrength = 0.012 + progress * 0.018
      const verticalStrength = 0.026 + progress * 0.026
      for (let index = 0; index < bodies.length; index += 1) {
        const body = bodies[index]
        if (!body) continue
        const slot =
          bodies.length <= 1 ? 0 : (index / (bodies.length - 1)) * 2 - 1
        const availableLane = Math.max(0, pileWidth / 2 - body.radius)
        const targetX = centerX + slot * availableLane
        const targetY = boundary.bottom - body.radius
        body.x += (targetX - body.x) * horizontalStrength
        body.y += (targetY - body.y) * verticalStrength
        body.velocityX = 0
        body.velocityY = 0
      }
      for (let collisionPass = 0; collisionPass < 24; collisionPass += 1) {
        separateCircleCollisions(
          bodies,
          CIRCLE_CONTACT_GAP,
          documentId + '\u0000lane-pile',
        )
        constrainPhysicsToRectangle(bodies, {
          left: pileLeft,
          top: boundary.top,
          right: pileRight,
          bottom: boundary.bottom,
        })
      }
    }

    for (let pass = 0; pass < 160; pass += 1) {
      separateCircleCollisions(
        bodies,
        CIRCLE_CONTACT_GAP,
        documentId + '\u0000lane-final',
      )
      constrainPhysicsToRectangle(bodies, {
        left: pileLeft,
        top: boundary.top,
        right: pileRight,
        bottom: boundary.bottom,
      })
    }

    const inside = bodies.every(
      (body) =>
        body.x - body.radius >= boundary.left - VALIDATION_EPSILON &&
        body.x + body.radius <= boundary.right + VALIDATION_EPSILON &&
        body.y - body.radius >= boundary.top - VALIDATION_EPSILON &&
        body.y + body.radius <= boundary.bottom + VALIDATION_EPSILON,
    )
    if (!inside || !bodiesDoNotOverlap(bodies)) continue

    const occupiedLeft = Math.min(...bodies.map((body) => body.x - body.radius))
    const occupiedRight = Math.max(
      ...bodies.map((body) => body.x + body.radius),
    )
    const occupiedTop = Math.min(...bodies.map((body) => body.y - body.radius))
    const occupiedBottom = Math.max(
      ...bodies.map((body) => body.y + body.radius),
    )
    const occupiedWidth = occupiedRight - occupiedLeft
    const occupiedHeight = occupiedBottom - occupiedTop
    const score = Math.min(occupiedWidth / width, occupiedHeight / height)
    const groupAspect = occupiedHeight / Math.max(1, occupiedWidth)
    const aspectPenalty = Math.abs(
      Math.log(Math.max(0.25, groupAspect) / targetAspect),
    )
    const aspectPenaltyWeight = bodies.length <= 3 ? 0.42 : 0.8
    const balancedScore = score - aspectPenalty * aspectPenaltyWeight
    if (balancedScore > bestScore) {
      bestScore = balancedScore
      bestSnapshot = snapshotBodies(bodies)
    }
  }

  restoreBodies(bodies, bestSnapshot)
  let lastNonOverlappingSnapshot = bodiesDoNotOverlap(bodies)
    ? snapshotBodies(bodies)
    : undefined
  // Re-apply gravity after restoring the best candidate. Collision separation
  // can lift a circle onto a higher row; without this pass it remains there
  // with a visible gap instead of settling against the circle below it.
  for (let pass = 0; pass < 220; pass += 1) {
    const progress = (pass + 1) / 220
    const horizontalStrength = 0.008 + progress * 0.012
    const verticalStrength = 0.018 + progress * 0.028
    for (const body of bodies) {
      const floorY = boundary.bottom - body.radius
      body.x += (centerX - body.x) * horizontalStrength
      body.y += (floorY - body.y) * verticalStrength
      body.velocityX = 0
      body.velocityY = 0
    }
    for (let collisionPass = 0; collisionPass < 24; collisionPass += 1) {
      separateCircleCollisions(
        bodies,
        CIRCLE_CONTACT_GAP,
        documentId + '\u0000settle',
      )
      constrainPhysicsToRectangle(bodies, boundary)
    }
  }
  for (let pass = 0; pass < 320; pass += 1) {
    separateCircleCollisions(
      bodies,
      CIRCLE_CONTACT_GAP,
      documentId + '\u0000final',
    )
    constrainPhysicsToRectangle(bodies, boundary)
  }
  if (bodiesDoNotOverlap(bodies)) {
    lastNonOverlappingSnapshot = snapshotBodies(bodies)
  } else if (lastNonOverlappingSnapshot) {
    restoreBodies(bodies, lastNonOverlappingSnapshot)
  }

  // Close small vertical gaps by placing each circle on the nearest valid
  // support below it. Unlike a global center pull, this only changes y when
  // two circles already overlap in their horizontal projections.
  for (let pass = 0; pass < 80; pass += 1) {
    const ordered = [...bodies].sort(
      (left, right) => right.y - left.y || left.id.localeCompare(right.id),
    )
    for (const body of ordered) {
      let maximumY = boundary.bottom - body.radius
      for (const support of bodies) {
        if (support === body || support.y <= body.y) continue
        const horizontalDistance = Math.abs(support.x - body.x)
        if (horizontalDistance >= support.radius + body.radius) continue
        maximumY = Math.min(maximumY, support.y - support.radius - body.radius)
      }
      if (body.y < maximumY) body.y = maximumY
    }
    for (let collisionPass = 0; collisionPass < 12; collisionPass += 1) {
      separateCircleCollisions(
        bodies,
        CIRCLE_CONTACT_GAP,
        documentId + '\u0000contact',
      )
      constrainPhysicsToRectangle(bodies, boundary)
    }
  }
  if (bodiesDoNotOverlap(bodies)) {
    lastNonOverlappingSnapshot = snapshotBodies(bodies)
  } else if (lastNonOverlappingSnapshot) {
    restoreBodies(bodies, lastNonOverlappingSnapshot)
  }

  // Collision solving only separates overlaps. Close the small residual gaps
  // between nearby circles so tangent rows remain visually connected, while
  // leaving genuinely separate rows untouched.
  const maximumContactGap = Math.min(width, height) * 0.02
  for (let pass = 0; pass < 80; pass += 1) {
    for (let leftIndex = 0; leftIndex < bodies.length; leftIndex += 1) {
      const left = bodies[leftIndex]
      if (!left) continue
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < bodies.length;
        rightIndex += 1
      ) {
        const right = bodies[rightIndex]
        if (!right) continue
        const deltaX = right.x - left.x
        const deltaY = right.y - left.y
        const distance = Math.hypot(deltaX, deltaY)
        const radiusSum = left.radius + right.radius
        const gap = distance - radiusSum
        if (gap <= EPSILON || gap > maximumContactGap) continue
        const normal =
          distance > EPSILON
            ? { x: deltaX / distance, y: deltaY / distance }
            : fallbackNormal(left.id, right.id, documentId)
        const shift = gap / 2
        left.x += normal.x * shift
        left.y += normal.y * shift
        right.x -= normal.x * shift
        right.y -= normal.y * shift
      }
    }
    for (let collisionPass = 0; collisionPass < 12; collisionPass += 1) {
      separateCircleCollisions(
        bodies,
        CIRCLE_CONTACT_GAP,
        documentId + '\u0000contact-gap',
      )
      constrainPhysicsToRectangle(bodies, boundary)
    }
  }
  if (bodiesDoNotOverlap(bodies)) {
    lastNonOverlappingSnapshot = snapshotBodies(bodies)
  } else if (lastNonOverlappingSnapshot) {
    restoreBodies(bodies, lastNonOverlappingSnapshot)
  }

  // A small category can reach the floor beside the main pile without ever
  // intersecting it. Merge any remaining disconnected contact components as
  // rigid groups, stopping at the requested 1px circle gap. This closes
  // real holes without increasing the radii or pulling an already compact
  // group apart.
  closeDisconnectedContactClusters(
    bodies,
    boundary,
    documentId + '\u0000cluster-close',
  )

  // Merging a whole contact component can create a chain of secondary
  // collisions near a boundary. Do not expose the layout until every pair is
  // separated again; most layouts exit after the first pass, while crowded
  // edge cases are allowed to converge fully.
  for (let pass = 0; pass < 640; pass += 1) {
    separateCircleCollisions(
      bodies,
      CIRCLE_CONTACT_GAP,
      documentId + '\u0000final-safety',
    )
    constrainPhysicsToRectangle(bodies, boundary)
    if (bodiesDoNotOverlap(bodies)) break
  }
  if (!bodiesDoNotOverlap(bodies) && lastNonOverlappingSnapshot) {
    restoreBodies(bodies, lastNonOverlappingSnapshot)
  }
  for (
    let attempt = 0;
    attempt < 4 && !bodiesDoNotOverlap(bodies);
    attempt += 1
  ) {
    if (!shrinkOverlappingBodiesToFit(bodies)) break
    closeDisconnectedContactClusters(
      bodies,
      boundary,
      documentId + '\u0000fallback-close-' + String(attempt),
    )
    for (let pass = 0; pass < 160; pass += 1) {
      separateCircleCollisions(
        bodies,
        CIRCLE_CONTACT_GAP,
        documentId + '\u0000fallback-separate-' + String(attempt),
      )
      constrainPhysicsToRectangle(bodies, boundary)
      if (bodiesDoNotOverlap(bodies)) break
    }
  }

  let topLabelsResolved = topLabelsDoNotOverlap(bodies, topLabelNodeIds)
  for (
    let attempt = 0;
    attempt < 8 && (!bodiesDoNotOverlap(bodies) || !topLabelsResolved);
    attempt += 1
  ) {
    for (let pass = 0; pass < 320; pass += 1) {
      separateCircleCollisions(
        bodies,
        CIRCLE_CONTACT_GAP,
        documentId + '\u0000top-label-circle-' + String(attempt),
      )
      resolveTopLabelCollisions(bodies, topLabelNodeIds, CIRCLE_CONTACT_GAP)
      constrainTopLevelToRectangle(bodies, boundary, topLabelNodeIds)
      topLabelsResolved = topLabelsDoNotOverlap(bodies, topLabelNodeIds)
      if (bodiesDoNotOverlap(bodies) && topLabelsResolved) break
    }
    if (bodiesDoNotOverlap(bodies) && topLabelsResolved) break
    if (!shrinkOverlappingBodiesToFit(bodies)) {
      for (const body of bodies) {
        scaleSubtreeAround(body.node, body.node.x, body.node.y, 0.98)
        body.radius *= 0.98
      }
    }
  }

  const finalBottom = Math.max(...bodies.map((body) => body.y + body.radius))
  const floorOffset = boundary.bottom - finalBottom
  if (Math.abs(floorOffset) > EPSILON) {
    bodies.forEach((body) => {
      body.y += floorOffset
    })
    constrainPhysicsToRectangle(bodies, boundary)
  }
  for (const body of bodies) {
    translateSubtree(body.node, body.x - body.node.x, body.y - body.node.y)
  }
}

export function createGravityLayout(
  document: GraphDocument,
  options: GravityLayoutOptions = {
    width: document.canvas.width,
    height: document.canvas.height,
  },
): BasicLayoutResult {
  const width = Math.max(1, options.width)
  const height = Math.max(1, options.height)
  const horizontalPadding = options.horizontalPadding ?? width * 0.065
  const topInset = options.topInset ?? height * 0.14
  const bottomInset = options.bottomInset ?? height * 0.065
  const basicLayout = createBasicLayout(document, {
    width,
    height,
    horizontalPadding,
    topInset,
    bottomInset,
  })
  const roots = basicLayout.roots.map(cloneNode)
  const categoryById = new Map(
    document.categories.map((category) => [category.id, category]),
  )
  const topLabelNodeIds = new Set(
    roots
      .filter((node) => {
        if (node.children.length === 0 || node.name.trim().length === 0) {
          return false
        }
        const category = categoryById.get(node.categoryId)
        if (!category) return false
        const appearance = resolveCategoryAppearance(
          category,
          document.canvas.labelSettings,
        )
        return node.kind === 'category'
          ? appearance.showCategoryText
          : appearance.showLabelText
      })
      .map((node) => node.id),
  )

  relaxTopLevel(
    roots,
    {
      left: horizontalPadding,
      top: topInset,
      right: width - horizontalPadding,
      bottom: height - bottomInset,
    },
    document.id,
    Math.max(1, Math.round(options.iterations ?? 180)),
    Math.max(1, Math.round(options.collisionPasses ?? 12)),
    topLabelNodeIds,
  )
  roots.forEach((root) =>
    relaxDescendants(
      root,
      document.id,
      Math.max(1, Math.round(options.iterations ?? 180)),
      Math.max(1, Math.round(options.collisionPasses ?? 12)),
      1,
    ),
  )

  return {
    width,
    height,
    roots,
    flatNodes: flattenNodes(roots),
  }
}
