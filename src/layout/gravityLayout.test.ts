import { describe, expect, it, vi } from 'vitest'

import { createStarterGraph } from '../domain/graph'
import { createBasicLayout, type LayoutNode } from './basicLayout'
import {
  createGravityLayout,
  separateCircleCollisions,
  type CircleCollisionBody,
} from './gravityLayout'

const EPSILON = 0.03

function assertFiniteTree(nodes: LayoutNode[]): void {
  for (const node of nodes) {
    expect(Number.isFinite(node.x)).toBe(true)
    expect(Number.isFinite(node.y)).toBe(true)
    expect(Number.isFinite(node.radius)).toBe(true)
    expect(node.radius).toBeGreaterThan(0)
    assertFiniteTree(node.children)
  }
}

function assertSiblingsDoNotOverlap(nodes: LayoutNode[]): void {
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex]
    if (!left) continue
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < nodes.length;
      rightIndex += 1
    ) {
      const right = nodes[rightIndex]
      if (!right) continue
      expect(
        Math.hypot(right.x - left.x, right.y - left.y) + EPSILON,
      ).toBeGreaterThanOrEqual(left.radius + right.radius)
    }
    assertSiblingsDoNotOverlap(left.children)
  }
}

function assertChildrenFormContactCluster(nodes: LayoutNode[]): void {
  for (const parent of nodes) {
    const children = parent.children
    if (children.length > 1) {
      const connected = new Set<number>([0])
      let addedNode = true

      while (addedNode) {
        addedNode = false
        for (let leftIndex = 0; leftIndex < children.length; leftIndex += 1) {
          if (!connected.has(leftIndex)) continue
          const left = children[leftIndex]
          if (!left) continue
          for (
            let rightIndex = 0;
            rightIndex < children.length;
            rightIndex += 1
          ) {
            if (connected.has(rightIndex)) continue
            const right = children[rightIndex]
            if (!right) continue
            const surfaceGap =
              Math.hypot(right.x - left.x, right.y - left.y) -
              (left.radius + right.radius)
            if (surfaceGap <= 0.5) {
              connected.add(rightIndex)
              addedNode = true
            }
          }
        }
      }

      expect(connected.size).toBe(children.length)
    }
    assertChildrenFormContactCluster(children)
  }
}

function assertChildrenContained(nodes: LayoutNode[]): void {
  for (const parent of nodes) {
    for (const child of parent.children) {
      expect(
        Math.hypot(child.x - parent.x, child.y - parent.y) + child.radius,
      ).toBeLessThanOrEqual(parent.radius + EPSILON)
    }
    assertChildrenContained(parent.children)
  }
}

function assertChildrenUseParentSpace(nodes: LayoutNode[]): void {
  for (const parent of nodes) {
    if (parent.children.length > 0) {
      const occupiedRadius = Math.max(
        ...parent.children.map(
          (child) =>
            Math.hypot(child.x - parent.x, child.y - parent.y) + child.radius,
        ),
      )
      expect(occupiedRadius / parent.radius).toBeGreaterThanOrEqual(0.97)
    }
    assertChildrenUseParentSpace(parent.children)
  }
}

function mapNodes(nodes: LayoutNode[]): Map<string, LayoutNode> {
  const entries = nodes.flatMap((node): Array<[string, LayoutNode]> => [
    [node.id, node],
    ...mapNodes(node.children),
  ])
  return new Map(entries)
}

describe('deterministic gravity layout', () => {
  it('returns stable geometry without random input or document mutation', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const before = JSON.stringify(document)
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('gravity layout must not use Math.random')
    })

    const first = createGravityLayout(document)
    const second = createGravityLayout(document)

    expect(second).toEqual(first)
    expect(JSON.stringify(document)).toBe(before)
    random.mockRestore()
  })

  it('keeps top-level circles inside the canvas and separates collisions', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const layout = createGravityLayout(document)
    const horizontalPadding = layout.width * 0.065
    const topInset = layout.height * 0.14
    const bottom = layout.height - layout.height * 0.065

    assertFiniteTree(layout.roots)
    assertSiblingsDoNotOverlap(layout.roots)
    assertChildrenContained(layout.roots)
    assertChildrenFormContactCluster(layout.roots)
    assertChildrenUseParentSpace(layout.roots)
    for (const node of layout.roots) {
      expect(node.x - node.radius).toBeGreaterThanOrEqual(
        horizontalPadding - EPSILON,
      )
      expect(node.x + node.radius).toBeLessThanOrEqual(
        layout.width - horizontalPadding + EPSILON,
      )
      expect(node.y - node.radius).toBeGreaterThanOrEqual(topInset - EPSILON)
      expect(node.y + node.radius).toBeLessThanOrEqual(bottom + EPSILON)
    }
  })

  it('rearranges child labels at both nested levels', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const packed = mapNodes(createBasicLayout(document).roots)
    const gravity = mapNodes(createGravityLayout(document).roots)
    const expectPairChanged = (
      parentId: string,
      leftId: string,
      rightId: string,
    ) => {
      const packedParent = packed.get(parentId)
      const packedLeft = packed.get(leftId)
      const packedRight = packed.get(rightId)
      const gravityParent = gravity.get(parentId)
      const gravityLeft = gravity.get(leftId)
      const gravityRight = gravity.get(rightId)
      expect(packedParent).toBeDefined()
      expect(packedLeft).toBeDefined()
      expect(packedRight).toBeDefined()
      expect(gravityParent).toBeDefined()
      expect(gravityLeft).toBeDefined()
      expect(gravityRight).toBeDefined()
      if (
        !packedParent ||
        !packedLeft ||
        !packedRight ||
        !gravityParent ||
        !gravityLeft ||
        !gravityRight
      ) {
        return
      }
      const relativeChange = Math.hypot(
        gravityRight.x - gravityLeft.x - (packedRight.x - packedLeft.x),
        gravityRight.y - gravityLeft.y - (packedRight.y - packedLeft.y),
      )
      expect(relativeChange).toBeGreaterThan(gravityParent.radius * 0.04)
    }

    expectPairChanged(
      'category-animation',
      'attribute-story',
      'attribute-visual',
    )
    expectPairChanged('attribute-story', 'sub-world', 'sub-aftertaste')
  })

  it('packs two-node child groups into direct tangency', () => {
    const layout = mapNodes(
      createGravityLayout(createStarterGraph('2026-07-15T00:00:00.000Z')).roots,
    )
    const expectTouching = (leftId: string, rightId: string) => {
      const left = layout.get(leftId)
      const right = layout.get(rightId)
      expect(left).toBeDefined()
      expect(right).toBeDefined()
      if (!left || !right) return
      expect(
        Math.abs(
          Math.hypot(right.x - left.x, right.y - left.y) -
            (left.radius + right.radius),
        ),
      ).toBeLessThanOrEqual(0.5)
    }

    expectTouching('attribute-story', 'attribute-visual')
    expectTouching('sub-world', 'sub-aftertaste')
  })

  it('forms a zero-gap contact cluster for crowded descendants', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const category = document.categories[0]!
    category.attributes[0]!.children.push(
      {
        id: 'sub-structure',
        name: '结构',
        value: 60,
        hidden: false,
      },
      {
        id: 'sub-rhythm',
        name: '节奏',
        value: 52,
        hidden: false,
      },
    )
    category.attributes.push({
      id: 'attribute-sound',
      name: '声音设计',
      value: 66,
      hidden: false,
      children: [
        {
          id: 'sub-voice',
          name: '演出',
          value: 57,
          hidden: false,
        },
        {
          id: 'sub-effects',
          name: '音效',
          value: 49,
          hidden: false,
        },
        {
          id: 'sub-silence',
          name: '留白',
          value: 44,
          hidden: false,
        },
      ],
    })
    document.categories = [category]

    const layout = createGravityLayout(document)
    assertSiblingsDoNotOverlap(layout.roots)
    assertChildrenContained(layout.roots)
    assertChildrenFormContactCluster(layout.roots)
  })

  it('moves a layout with vertical room downward', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const packed = createBasicLayout(document)
    const gravity = createGravityLayout(document)
    const averageY = (nodes: LayoutNode[]) =>
      nodes.reduce((total, node) => total + node.y, 0) / nodes.length

    expect(averageY(gravity.roots)).toBeGreaterThan(averageY(packed.roots))
  })

  it('changes top-level relative positions instead of rigidly translating', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const packed = createBasicLayout(document)
    const gravity = createGravityLayout(document)
    let largestRelativeChange = 0

    for (let leftIndex = 0; leftIndex < packed.roots.length; leftIndex += 1) {
      const packedLeft = packed.roots[leftIndex]
      const gravityLeft = gravity.roots[leftIndex]
      if (!packedLeft || !gravityLeft) continue
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < packed.roots.length;
        rightIndex += 1
      ) {
        const packedRight = packed.roots[rightIndex]
        const gravityRight = gravity.roots[rightIndex]
        if (!packedRight || !gravityRight) continue
        largestRelativeChange = Math.max(
          largestRelativeChange,
          Math.hypot(
            gravityRight.x - gravityLeft.x - (packedRight.x - packedLeft.x),
            gravityRight.y - gravityLeft.y - (packedRight.y - packedLeft.y),
          ),
        )
      }
    }

    expect(largestRelativeChange).toBeGreaterThan(packed.width * 0.08)
  })

  it('uses vertical room instead of leaving three categories in one row', () => {
    const layout = createGravityLayout(
      createStarterGraph('2026-07-15T00:00:00.000Z'),
    )
    const left = Math.min(...layout.roots.map((node) => node.x - node.radius))
    const right = Math.max(...layout.roots.map((node) => node.x + node.radius))
    const top = Math.min(...layout.roots.map((node) => node.y - node.radius))
    const bottom = Math.max(...layout.roots.map((node) => node.y + node.radius))

    expect((bottom - top) / (right - left)).toBeGreaterThanOrEqual(0.72)
  })

  it('separates exactly overlapping circles in a repeatable direction', () => {
    const initial: CircleCollisionBody[] = [
      { id: 'left', x: 20, y: 20, radius: 10 },
      { id: 'right', x: 20, y: 20, radius: 15 },
    ]
    const first = structuredClone(initial)
    const second = structuredClone(initial)

    separateCircleCollisions(first, 0, 'graph')
    separateCircleCollisions(second, 0, 'graph')

    expect(second).toEqual(first)
    expect(
      Math.hypot(first[1]!.x - first[0]!.x, first[1]!.y - first[0]!.y),
    ).toBeCloseTo(25, 8)
  })

  it('handles an empty graph and a compact square canvas', () => {
    const empty = createStarterGraph('2026-07-15T00:00:00.000Z')
    empty.categories = []
    expect(createGravityLayout(empty).roots).toEqual([])

    const compact = createStarterGraph('2026-07-15T00:00:00.000Z')
    compact.canvas.width = 320
    compact.canvas.height = 320
    compact.categories = compact.categories.slice(0, 1)
    const layout = createGravityLayout(compact)
    assertFiniteTree(layout.roots)
    assertSiblingsDoNotOverlap(layout.roots)
    assertChildrenContained(layout.roots)
  })
})
