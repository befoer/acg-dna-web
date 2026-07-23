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

function childAreaRatio(parent: LayoutNode): number {
  return (
    parent.children.reduce(
      (total, child) => total + child.radius * child.radius,
      0,
    ) /
    (parent.radius * parent.radius)
  )
}

function childExtentRatio(parent: LayoutNode): number {
  return Math.max(
    ...parent.children.map(
      (child) =>
        (Math.hypot(child.x - parent.x, child.y - parent.y) + child.radius) /
        parent.radius,
    ),
  )
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

function assertNodesFormContactCluster(nodes: LayoutNode[]): void {
  if (nodes.length <= 1) return
  const connected = new Set<number>([0])
  let addedNode = true

  while (addedNode) {
    addedNode = false
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      if (!connected.has(leftIndex)) continue
      const left = nodes[leftIndex]
      if (!left) continue
      for (let rightIndex = 0; rightIndex < nodes.length; rightIndex += 1) {
        if (connected.has(rightIndex)) continue
        const right = nodes[rightIndex]
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

  const surfaceGaps = nodes.flatMap((left, leftIndex) =>
    nodes
      .slice(leftIndex + 1)
      .map(
        (right) =>
          Math.hypot(right.x - left.x, right.y - left.y) -
          (left.radius + right.radius),
      ),
  )
  expect(
    connected.size,
    `surface gaps: ${surfaceGaps.map((gap) => gap.toFixed(2)).join(', ')}`,
  ).toBe(nodes.length)
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

  it('keeps twenty percent breathing room around a single child', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const category = document.categories[0]!
    category.attributes = [
      {
        ...category.attributes[0]!,
        children: [],
      },
    ]
    document.categories = [category]

    const parent = createGravityLayout(document).roots[0]!

    expect(parent.children).toHaveLength(1)
    expect(parent.children[0]!.radius / parent.radius).toBeCloseTo(0.8, 3)
    expect(parent.children[0]!.y).toBeGreaterThan(parent.y)
  })

  it('expands a three-child contact cluster to the parent boundary', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const category = document.categories[0]!
    category.attributes = [
      {
        ...category.attributes[0]!,
        children: [],
      },
      {
        ...category.attributes[1]!,
        children: [],
      },
      {
        id: 'attribute-third',
        name: '第三项',
        value: 66,
        hidden: false,
        children: [],
      },
    ]
    document.categories = [category]

    const parent = createGravityLayout(document).roots[0]!

    expect(parent.children).toHaveLength(3)
    expect(childAreaRatio(parent)).toBeCloseTo(0.6, 3)
    expect(childExtentRatio(parent)).toBeGreaterThan(0.94)
    expect(
      parent.children.reduce((total, child) => total + child.y, 0) /
        parent.children.length,
    ).toBeGreaterThan(parent.y)
    assertSiblingsDoNotOverlap([parent])
  })

  it('uses more of the parent area for a nine-child group', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const category = document.categories[0]!
    category.attributes = Array.from({ length: 9 }, (_, index) => ({
      id: `attribute-fill-${index}`,
      name: `标签 ${index + 1}`,
      value: 40 + index * 6,
      hidden: false,
      children: [],
    }))
    document.categories = [category]

    const parent = createGravityLayout(document).roots[0]!

    expect(parent.children).toHaveLength(9)
    expect(childAreaRatio(parent)).toBeGreaterThanOrEqual(0.659)
    expect(childExtentRatio(parent)).toBeGreaterThan(0.97)
    assertSiblingsDoNotOverlap([parent])
  })

  it('preserves a stronger APP-style size contrast between child weights', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const category = document.categories[0]!
    category.attributes = [
      {
        id: 'attribute-low',
        name: '低权重',
        value: 10,
        hidden: false,
        children: [],
      },
      {
        id: 'attribute-middle',
        name: '中权重',
        value: 50,
        hidden: false,
        children: [],
      },
      {
        id: 'attribute-high',
        name: '高权重',
        value: 100,
        hidden: false,
        children: [],
      },
    ]
    document.categories = [category]

    const parent = createGravityLayout(document).roots[0]!
    const low = parent.children.find((child) => child.id === 'attribute-low')!
    const middle = parent.children.find(
      (child) => child.id === 'attribute-middle',
    )!
    const high = parent.children.find((child) => child.id === 'attribute-high')!

    expect(low.radius / parent.radius).toBeCloseTo(0.15, 3)
    expect(middle.radius).toBeGreaterThan(low.radius * 2)
    expect(high.radius).toBeGreaterThan(low.radius * 4)
    expect(high.radius).toBeGreaterThan(middle.radius * 1.9)
    assertSiblingsDoNotOverlap([parent])
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

    const pileAspectRatio = (bottom - top) / (right - left)
    expect(pileAspectRatio).toBeGreaterThanOrEqual(0.72)
    expect(pileAspectRatio).toBeLessThanOrEqual(1.55)
    expect(bottom).toBeCloseTo(layout.height * (1 - 0.065), 1)
  })

  it.each([
    [100, 70, 40],
    [100, 55, 20],
    [80, 75, 35],
  ])(
    'keeps uneven top-level values %s/%s/%s in a bottom pile',
    (firstValue, secondValue, thirdValue) => {
      const document = createStarterGraph('2026-07-15T00:00:00.000Z')
      document.categories.slice(0, 3).forEach((category, index) => {
        category.value = [firstValue, secondValue, thirdValue][index]!
        category.attributes = []
      })
      document.categories = document.categories.slice(0, 3)

      const layout = createGravityLayout(document)
      const left = Math.min(...layout.roots.map((node) => node.x - node.radius))
      const right = Math.max(
        ...layout.roots.map((node) => node.x + node.radius),
      )
      const top = Math.min(...layout.roots.map((node) => node.y - node.radius))
      const bottom = Math.max(
        ...layout.roots.map((node) => node.y + node.radius),
      )

      expect(bottom).toBeCloseTo(layout.height * (1 - 0.065), 1)
      const pileAspectRatio = (bottom - top) / (right - left)
      expect(pileAspectRatio).toBeGreaterThanOrEqual(0.72)
      expect(pileAspectRatio).toBeLessThanOrEqual(1.55)
      assertSiblingsDoNotOverlap(layout.roots)
    },
  )

  it('keeps varied three-category projects in a balanced bottom pile', () => {
    const weights = [
      [100, 100, 100],
      [100, 90, 20],
      [100, 60, 10],
      [95, 45, 15],
    ]
    const documentIds = Array.from(
      { length: 24 },
      (_, index) => `graph-${index}`,
    )

    for (const values of weights) {
      for (const documentId of documentIds) {
        const document = createStarterGraph('2026-07-15T00:00:00.000Z')
        document.id = documentId
        document.categories = document.categories.slice(0, 3)
        document.categories.forEach((category, index) => {
          category.value = values[index]!
          category.attributes = []
        })

        const layout = createGravityLayout(document)
        const left = Math.min(
          ...layout.roots.map((node) => node.x - node.radius),
        )
        const right = Math.max(
          ...layout.roots.map((node) => node.x + node.radius),
        )
        const top = Math.min(
          ...layout.roots.map((node) => node.y - node.radius),
        )
        const bottom = Math.max(
          ...layout.roots.map((node) => node.y + node.radius),
        )
        const pileAspectRatio = (bottom - top) / (right - left)

        expect(pileAspectRatio).toBeGreaterThanOrEqual(0.72)
        expect(pileAspectRatio).toBeLessThanOrEqual(1.55)
        expect(bottom).toBeCloseTo(layout.height * (1 - 0.065), 1)
        assertSiblingsDoNotOverlap(layout.roots)
      }
    }
  })
  it('forms a balanced pile for four top-level categories', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    document.categories = [
      ...document.categories.slice(0, 3).map((category, index) => ({
        ...category,
        value: [100, 70, 20][index]!,
        appearance: { fillFactor: [1.5, 1, 0.8][index]! },
        attributes: [],
      })),
      {
        id: 'category-fourth',
        name: '第四分类',
        value: 10,
        color: '#6C8FF0',
        hidden: false,
        appearance: { fillFactor: 0.5 },
        attributes: [],
      },
    ]

    const layout = createGravityLayout(document)
    const left = Math.min(...layout.roots.map((node) => node.x - node.radius))
    const right = Math.max(...layout.roots.map((node) => node.x + node.radius))
    const top = Math.min(...layout.roots.map((node) => node.y - node.radius))
    const bottom = Math.max(...layout.roots.map((node) => node.y + node.radius))
    const pileAspectRatio = (bottom - top) / (right - left)

    expect(pileAspectRatio).toBeGreaterThanOrEqual(1.05)
    expect(pileAspectRatio).toBeLessThanOrEqual(1.45)
    expect(bottom).toBeCloseTo(layout.height * (1 - 0.065), 1)
    assertNodesFormContactCluster(layout.roots)
    assertSiblingsDoNotOverlap(layout.roots)
  })

  it.each([5, 6, 8])(
    'fills a compact range with %s top-level categories and preserves weight contrast',
    (categoryCount) => {
      const document = createStarterGraph('2026-07-15T00:00:00.000Z')
      const values = [100, 84, 68, 52, 38, 26, 16, 8]
      document.categories = Array.from(
        { length: categoryCount },
        (_, index) => ({
          id: `category-fill-${index}`,
          name: `分类 ${index + 1}`,
          value: values[index] ?? 8,
          color: ['#15B8A6', '#EF6F9B', '#F09A52', '#6C8FF0'][index % 4]!,
          hidden: false,
          attributes: [],
        }),
      )

      const layout = createGravityLayout(document)
      const left = Math.min(...layout.roots.map((node) => node.x - node.radius))
      const right = Math.max(
        ...layout.roots.map((node) => node.x + node.radius),
      )
      const top = Math.min(...layout.roots.map((node) => node.y - node.radius))
      const bottom = Math.max(
        ...layout.roots.map((node) => node.y + node.radius),
      )
      const pileAspectRatio = (bottom - top) / (right - left)
      const radii = layout.roots.map((node) => node.radius)

      expect(pileAspectRatio).toBeGreaterThanOrEqual(0.72)
      expect(pileAspectRatio).toBeLessThanOrEqual(1.55)
      expect(bottom).toBeCloseTo(layout.height * (1 - 0.065), 1)
      expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.6)
      assertNodesFormContactCluster(layout.roots)
      assertSiblingsDoNotOverlap(layout.roots)
    },
  )

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
