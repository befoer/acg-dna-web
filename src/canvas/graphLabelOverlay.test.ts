import { describe, expect, it } from 'vitest'

import { createStarterGraph } from '../domain/graph'
import { createGraphLayout } from './renderGraph'
import {
  createAlimamaLabelSvg,
  createGraphLabelSpecs,
} from './graphLabelOverlay'

describe('Alimama SVG label overlay', () => {
  it('creates visible node labels without duplicating hidden content', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    const layout = createGraphLayout(document)
    const visible = createGraphLabelSpecs(
      layout,
      document.canvas.labelSettings,
      {},
    )

    expect(visible.some((label) => label.text === '动画偏好')).toBe(true)
    document.canvas.labelSettings.showCategoryText = false
    document.canvas.labelSettings.showLabelText = false
    expect(
      createGraphLabelSpecs(layout, document.canvas.labelSettings, {}),
    ).toEqual([])
  })

  it('writes different BEVL values into the exportable SVG', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.canvas.labelSettings.fontFamily = 'alimama-fangyuan'
    const layout = createGraphLayout(document)

    document.canvas.labelSettings.fontRoundness = 0
    const square = createAlimamaLabelSvg(
      document,
      layout,
      {},
      'data:font/ttf;base64,AA==',
    )
    document.canvas.labelSettings.fontRoundness = 100
    const round = createAlimamaLabelSvg(
      document,
      layout,
      {},
      'data:font/ttf;base64,AA==',
    )

    expect(square).toContain('&quot;BEVL&quot; 1')
    expect(round).toContain('&quot;BEVL&quot; 100')
    expect(round).toContain('font-variation-settings')
    expect(round).toContain('@font-face')
    expect(round).not.toBe(square)
  })

  it('escapes user text before embedding it in SVG', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    document.categories[0]!.name = '<script>alert("x")</script>'
    const svg = createAlimamaLabelSvg(
      document,
      createGraphLayout(document),
      {},
      'data:font/ttf;base64,AA==',
    )

    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;')
  })
})
