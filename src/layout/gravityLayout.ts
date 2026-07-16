import type { GraphDocument } from '../domain/graph'
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
const VALIDATION_EPSILON = 0.02

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
        Math.hypot(right.x - left.x, right.y - left.y) + VALIDATION_EPSILON <
        left.radius + right.radius
      ) {
        return false
      }
    }
  }
  return true
}

function bodiesAreInsideRectangle(
  bodies: CircleCollisionBody[],
  boundary: RectBoundary,
): boolean {
  return bodies.every(
    (body) =>
      Number.isFinite(body.x) &&
      Number.isFinite(body.y) &&
      Number.isFinite(body.radius) &&
      body.radius > 0 &&
      body.x - body.radius >= boundary.left - VALIDATION_EPSILON &&
      body.x + body.radius <= boundary.right + VALIDATION_EPSILON &&
      body.y - body.radius >= boundary.top - VALIDATION_EPSILON &&
      body.y + body.radius <= boundary.bottom + VALIDATION_EPSILON,
  )
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

function translateSubtree(
  node: LayoutNode,
  deltaX: number,
  deltaY: number,
): void {
  node.x += deltaX
  node.y += deltaY
  node.children.forEach((child) => translateSubtree(child, deltaX, deltaY))
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
    const horizontalStrength = 0.022 + progress * 0.024
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
      separateCircleCollisions(bodies, 0, seed)
      constrainPhysicsToCircle(bodies, boundary)
    }
  }
}

function relaxChildrenInParent(
  parent: LayoutNode,
  documentId: string,
  iterations: number,
  collisionPasses: number,
  depth: number,
): void {
  if (parent.children.length === 0) return
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
  const fallback = snapshotBodies(bodies)
  let lastValid = fallback
  const radii = radiusRange(bodies)
  const gravity = Math.max(0.025, parent.radius * 0.00062)
  const horizontalAttraction = depth === 1 ? 0.0042 : 0.0048
  const verticalSettleStrength = depth === 1 ? 0.0032 : 0.0036
  const damping = 0.78
  const collisionGap = 0
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
  // deterministic downward-and-inward compaction, then separate at zero gap
  // so descendants end in a connected, tangent cluster without intersections.
  compactChildrenAgainstGravity(bodies, boundary, collisionSeed)
  if (bodiesAreInsideCircle(bodies, boundary) && bodiesDoNotOverlap(bodies)) {
    lastValid = snapshotBodies(bodies)
  }

  for (let pass = 0; pass < 120; pass += 1) {
    separateCircleCollisions(bodies, collisionGap, collisionSeed)
    constrainPhysicsToCircle(bodies, boundary)
  }
  if (!bodiesAreInsideCircle(bodies, boundary) || !bodiesDoNotOverlap(bodies)) {
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

function relaxTopLevel(
  nodes: LayoutNode[],
  boundary: RectBoundary,
  documentId: string,
  iterations: number,
  collisionPasses: number,
): void {
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

  let lastValid = snapshotBodies(bodies)
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
  if (
    bodiesAreInsideRectangle(bodies, boundary) &&
    bodiesDoNotOverlap(bodies)
  ) {
    lastValid = snapshotBodies(bodies)
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

    if (
      bodiesAreInsideRectangle(bodies, boundary) &&
      bodiesDoNotOverlap(bodies)
    ) {
      lastValid = snapshotBodies(bodies)
    }
  }

  for (let pass = 0; pass < 160; pass += 1) {
    separateCircleCollisions(bodies, collisionGap, documentId)
    constrainPhysicsToRectangle(bodies, boundary)
  }

  if (
    !bodiesAreInsideRectangle(bodies, boundary) ||
    !bodiesDoNotOverlap(bodies)
  ) {
    restoreBodies(bodies, lastValid)
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
