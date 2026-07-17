import { describe, expect, it } from 'vitest'

import { createStarterGraph } from '../domain/graph'
import { createBasicLayout, type LayoutNode } from './basicLayout'

const EPSILON = 0.01

function assertFiniteTree(nodes: LayoutNode[]) {
  for (const node of nodes) {
    expect(Number.isFinite(node.x)).toBe(true)
    expect(Number.isFinite(node.y)).toBe(true)
    expect(Number.isFinite(node.radius)).toBe(true)
    expect(node.radius).toBeGreaterThan(0)
    assertFiniteTree(node.children)
  }
}

function assertPackedTree(nodes: LayoutNode[]) {
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex]!
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < nodes.length;
      rightIndex += 1
    ) {
      const right = nodes[rightIndex]!
      const distance = Math.hypot(left.x - right.x, left.y - right.y)
      expect(distance + EPSILON).toBeGreaterThanOrEqual(
        left.radius + right.radius,
      )
    }
  }

  for (const parent of nodes) {
    for (const child of parent.children) {
      const distance = Math.hypot(parent.x - child.x, parent.y - child.y)
      expect(distance + child.radius).toBeLessThanOrEqual(
        parent.radius + EPSILON,
      )
    }
    assertPackedTree(parent.children)
  }
}

describe('basic deterministic layout', () => {
  it('returns the same geometry without mutating the document', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const before = JSON.stringify(document)

    const first = createBasicLayout(document)
    const second = createBasicLayout(document)

    expect(second).toEqual(first)
    expect(JSON.stringify(document)).toBe(before)
  })

  it('keeps every visible circle finite, contained, and non-overlapping', () => {
    const layout = createBasicLayout(
      createStarterGraph('2026-07-15T00:00:00.000Z'),
    )

    assertFiniteTree(layout.roots)
    assertPackedTree(layout.roots)
    expect(new Set(layout.flatNodes.map((node) => node.id)).size).toBe(
      layout.flatNodes.length,
    )
  })

  it('removes hidden parents together with their descendants', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    document.categories[0]!.attributes[0]!.hidden = true

    const ids = createBasicLayout(document).flatNodes.map((node) => node.id)

    expect(ids).not.toContain('attribute-story')
    expect(ids).not.toContain('sub-world')
    expect(ids).toContain('category-animation')
  })

  it('handles an empty graph without invalid geometry', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    document.categories = []

    expect(createBasicLayout(document)).toMatchObject({
      roots: [],
      flatNodes: [],
    })
  })

  it('makes every hierarchy level respond monotonically to its weight', () => {
    const low = createStarterGraph('2026-07-15T00:00:00.000Z')
    low.categories[0]!.value = 1
    low.categories[0]!.attributes[0]!.value = 1
    low.categories[0]!.attributes[0]!.children[0]!.value = 1

    const high = createStarterGraph('2026-07-15T00:00:00.000Z')
    high.categories[0]!.value = 100
    high.categories[0]!.attributes[0]!.value = 100
    high.categories[0]!.attributes[0]!.children[0]!.value = 100

    const lowNodes = new Map(
      createBasicLayout(low).flatNodes.map((node) => [node.id, node]),
    )
    const highNodes = new Map(
      createBasicLayout(high).flatNodes.map((node) => [node.id, node]),
    )
    const ratio = (
      nodes: Map<string, LayoutNode>,
      targetId: string,
      siblingId: string,
    ) => nodes.get(targetId)!.radius / nodes.get(siblingId)!.radius

    expect(
      ratio(highNodes, 'category-animation', 'category-character'),
    ).toBeGreaterThan(
      ratio(lowNodes, 'category-animation', 'category-character'),
    )
    expect(
      ratio(highNodes, 'attribute-story', 'attribute-visual'),
    ).toBeGreaterThan(ratio(lowNodes, 'attribute-story', 'attribute-visual'))
    expect(ratio(highNodes, 'sub-world', 'sub-aftertaste')).toBeGreaterThan(
      ratio(lowNodes, 'sub-world', 'sub-aftertaste'),
    )
  })

  it('applies a category fill factor without changing sibling settings', () => {
    const normal = createStarterGraph('2026-07-15T00:00:00.000Z')
    const enlarged = createStarterGraph('2026-07-15T00:00:00.000Z')
    enlarged.categories[0]!.appearance = { fillFactor: 1.5 }
    const normalRoots = new Map(
      createBasicLayout(normal).roots.map((node) => [node.id, node]),
    )
    const enlargedRoots = new Map(
      createBasicLayout(enlarged).roots.map((node) => [node.id, node]),
    )
    const normalRatio =
      normalRoots.get('category-animation')!.radius /
      normalRoots.get('category-character')!.radius
    const enlargedRatio =
      enlargedRoots.get('category-animation')!.radius /
      enlargedRoots.get('category-character')!.radius

    expect(enlargedRatio).toBeGreaterThan(normalRatio)
    expect(enlargedRoots.get('category-animation')?.categoryId).toBe(
      'category-animation',
    )
    expect(
      enlargedRoots.get('category-animation')?.children[0]?.categoryId,
    ).toBe('category-animation')
  })

  it('removes category circles in flat mode while keeping attributes and children', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    document.canvas.labelSettings.showCategoryNodes = false
    const layout = createBasicLayout(document)

    expect(layout.roots.every((node) => node.kind === 'attribute')).toBe(true)
    expect(layout.flatNodes.some((node) => node.kind === 'category')).toBe(
      false,
    )
    expect(layout.roots.map((node) => node.id)).toContain('attribute-story')
    expect(
      layout.flatNodes.find((node) => node.id === 'sub-world')?.categoryId,
    ).toBe('category-animation')
  })

  it('uses a locale-independent tie break for equal weights', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const ids = ['é', '中', 'Z']
    document.categories = document.categories.map((category, index) => ({
      ...category,
      id: ids[index]!,
      value: 50,
      attributes: [],
    }))

    expect(createBasicLayout(document).roots.map((node) => node.id)).toEqual([
      'Z',
      'é',
      '中',
    ])
  })
})
