import { describe, expect, it } from 'vitest'

import { createStarterGraph } from '../domain/graph'
import {
  exportGraphLabelText,
  exportGraphStructureText,
  GraphTextError,
  parseGraphStructureText,
  summarizeGraphCategories,
} from './graphText'

describe('graph text import and export', () => {
  it('round-trips the APP tree format with values and three levels', () => {
    const document = createStarterGraph('2026-07-17T00:00:00.000Z')
    const text = exportGraphStructureText(document)
    const categories = parseGraphStructureText(text)

    expect(text).toContain('├─动画偏好  82')
    expect(categories[0]?.name).toBe('动画偏好')
    expect(categories[0]?.attributes[0]?.name).toBe('叙事氛围')
    expect(
      categories[0]?.attributes[0]?.children.some(
        (child) => child.name === '世界观',
      ),
    ).toBe(true)
    expect(summarizeGraphCategories(categories).categories).toBe(
      document.categories.length,
    )
  })

  it('parses the simple Chinese outline format', () => {
    const categories = parseGraphStructureText(
      ['分类：动画', '  属性：叙事', '    子属性：世界观'].join('\n'),
    )

    expect(categories[0]?.attributes[0]?.children[0]).toMatchObject({
      name: '世界观',
      value: 50,
    })
  })

  it('exports the APP-style label-only view', () => {
    const text = exportGraphLabelText(createStarterGraph())

    expect(text).toContain('叙事氛围')
    expect(text).toContain('  世界观')
    expect(text).not.toContain('动画偏好')
  })

  it('rejects malformed hierarchy and empty text', () => {
    expect(() => parseGraphStructureText('属性：无分类')).toThrow(
      GraphTextError,
    )
    expect(() => parseGraphStructureText('')).toThrow(/没有识别到分类/)
  })
})
