import { describe, expect, it } from 'vitest'

import type { LayoutNode } from '../layout/basicLayout'
import { findLayoutNodeAtPoint } from './canvasHitTest'

function node(
  id: string,
  x: number,
  y: number,
  radius: number,
  children: LayoutNode[] = [],
): LayoutNode {
  return {
    id,
    name: id,
    kind: children.length > 0 ? 'attribute' : 'subAttribute',
    categoryId: 'category-test',
    value: 50,
    color: '#15B8A6',
    x,
    y,
    radius,
    children,
  }
}

describe('canvas hit testing', () => {
  it('chooses the nearest small circle when expanded hit areas overlap', () => {
    const left = node('left', 40, 50, 5)
    const right = node('right', 70, 50, 5)

    expect(findLayoutNodeAtPoint([left, right], 52, 50, 22)?.id).toBe('left')
    expect(findLayoutNodeAtPoint([left, right], 61, 50, 22)?.id).toBe('right')
  })

  it('prefers a real child-circle hit over its containing parent', () => {
    const child = node('child', 50, 50, 10)
    const parent = node('parent', 50, 50, 40, [child])

    expect(findLayoutNodeAtPoint([parent, child], 50, 50, 22)?.id).toBe('child')
  })
})
