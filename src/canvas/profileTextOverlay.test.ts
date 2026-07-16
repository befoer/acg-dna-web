import { describe, expect, it } from 'vitest'

import { createStarterGraph } from '../domain/graph'
import {
  createAlimamaProfileTextSpecs,
  createAlimamaProfileTextSvg,
} from './profileTextOverlay'

function documentWithRoundness(roundness: number) {
  const document = createStarterGraph('2026-07-16T00:00:00.000Z')
  document.profile.customTexts = [
    {
      id: 'profile-text',
      text: '方圆<&',
      x: 0.2,
      y: 0.1,
      fontSize: 40,
      color: '#333333',
      rotation: 12,
      fontWeight: 500,
      fontFamily: 'alimama-fangyuan',
      maxWidth: 0.5,
      maxHeight: 0.3,
      visible: true,
      strokeWidth: 2,
      strokeColor: '#FFFFFF',
      roundness,
    },
  ]
  return document
}

describe('Alimama profile text overlay', () => {
  it('preserves APP position, rotation, stroke, and variable roundness', () => {
    const document = documentWithRoundness(0.75)
    const spec = createAlimamaProfileTextSpecs(document)[0]
    const svg = createAlimamaProfileTextSvg(
      document,
      'data:font/ttf;base64,AA==',
    )

    expect(spec).toMatchObject({
      rotation: 12,
      roundness: 75,
      strokeColor: '#FFFFFF',
    })
    expect(svg).toContain('&quot;BEVL&quot; 75.25')
    expect(svg).toContain('paint-order="stroke fill"')
    expect(svg).toContain('方圆&lt;&amp;')
  })

  it('writes different BEVL axes for different roundness values', () => {
    const square = createAlimamaProfileTextSvg(
      documentWithRoundness(0),
      'data:font/ttf;base64,AA==',
    )
    const round = createAlimamaProfileTextSvg(
      documentWithRoundness(1),
      'data:font/ttf;base64,AA==',
    )

    expect(square).toContain('&quot;BEVL&quot; 1')
    expect(round).toContain('&quot;BEVL&quot; 100')
    expect(square).not.toBe(round)
  })
})
