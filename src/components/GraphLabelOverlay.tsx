import type { CSSProperties } from 'react'

import type { GraphDocument } from '../domain/graph'
import type { LocalImageAsset } from '../editor/assets'
import {
  ALIMAMA_FANGYUAN_FAMILY,
  resolveAlimamaVariation,
} from '../fonts/fontManager'
import type { BasicLayoutResult } from '../layout/basicLayout'
import { createGraphLabelSpecs } from '../canvas/graphLabelOverlay'

interface GraphLabelOverlayProps {
  document: GraphDocument
  layout: BasicLayoutResult
  assets: Readonly<Record<string, LocalImageAsset>>
  style: CSSProperties
}

export function GraphLabelOverlay({
  document,
  layout,
  assets,
  style,
}: GraphLabelOverlayProps) {
  const settings = document.canvas.labelSettings
  const specs = createGraphLabelSpecs(layout, settings, assets)
  const bounds = document.canvas.contentBounds
  const centerX = ((bounds.left + bounds.right) / 2) * document.canvas.width
  const centerY = ((bounds.top + bounds.bottom) / 2) * document.canvas.height
  const transform =
    bounds.rotation === 0
      ? undefined
      : 'rotate(' + bounds.rotation + ' ' + centerX + ' ' + centerY + ')'

  return (
    <svg
      className={'graph-label-overlay'}
      style={style}
      viewBox={'0 0 ' + document.canvas.width + ' ' + document.canvas.height}
      aria-hidden={true}
    >
      <defs>
        <filter
          id={'preview-label-shadow'}
          x={'-30%'}
          y={'-30%'}
          width={'160%'}
          height={'160%'}
        >
          <feDropShadow
            dx={0}
            dy={2}
            stdDeviation={3}
            floodColor={'#000000'}
            floodOpacity={0.65}
          />
        </filter>
      </defs>
      <g transform={transform}>
        {specs.map((spec) => {
          const variation = resolveAlimamaVariation(
            spec.fontWeight,
            settings.fontRoundness,
          )
          return (
            <text
              key={spec.id}
              x={spec.x}
              y={spec.y}
              fill={spec.color}
              fillOpacity={spec.opacity}
              fontSize={spec.fontSize}
              fontWeight={variation.weight}
              textAnchor={'middle'}
              dominantBaseline={'middle'}
              textLength={spec.textLength}
              lengthAdjust={
                spec.textLength === undefined ? undefined : 'spacingAndGlyphs'
              }
              filter={spec.shadow ? 'url(#preview-label-shadow)' : undefined}
              style={{
                fontFamily: '"' + ALIMAMA_FANGYUAN_FAMILY + '"',
                fontVariationSettings: variation.settings,
              }}
            >
              {spec.text}
            </text>
          )
        })}
      </g>
    </svg>
  )
}
