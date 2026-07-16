import type { CSSProperties } from 'react'

import { createAlimamaProfileTextSpecs } from '../canvas/profileTextOverlay'
import type { GraphDocument } from '../domain/graph'
import {
  ALIMAMA_FANGYUAN_FAMILY,
  resolveAlimamaVariation,
} from '../fonts/fontManager'

interface ProfileTextOverlayProps {
  document: GraphDocument
  style: CSSProperties
}

export function ProfileTextOverlay({
  document,
  style,
}: ProfileTextOverlayProps) {
  const specs = createAlimamaProfileTextSpecs(document)
  return (
    <svg
      className={'graph-label-overlay'}
      style={style}
      viewBox={'0 0 ' + document.canvas.width + ' ' + document.canvas.height}
      aria-hidden={true}
    >
      {specs.map((spec) => {
        const variation = resolveAlimamaVariation(
          spec.fontWeight,
          spec.roundness,
        )
        return (
          <text
            key={spec.id}
            x={spec.x}
            y={spec.y}
            fill={spec.color}
            fontSize={spec.fontSize}
            fontWeight={variation.weight}
            stroke={spec.strokeWidth > 0 ? spec.strokeColor : undefined}
            strokeWidth={spec.strokeWidth || undefined}
            strokeLinejoin={'round'}
            paintOrder={'stroke fill'}
            transform={
              spec.rotation === 0
                ? undefined
                : 'rotate(' +
                  spec.rotation +
                  ' ' +
                  spec.centerX +
                  ' ' +
                  spec.centerY +
                  ')'
            }
            style={{
              fontFamily: '"' + ALIMAMA_FANGYUAN_FAMILY + '"',
              fontVariationSettings: variation.settings,
            }}
          >
            {spec.text}
          </text>
        )
      })}
    </svg>
  )
}
