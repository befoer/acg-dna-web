import type { GraphDocument } from '../domain/graph'
import {
  ALIMAMA_FANGYUAN_FAMILY,
  getAlimamaFontDataUrl,
  resolveAlimamaVariation,
} from '../fonts/fontManager'

export interface ProfileTextLineSpec {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  fontWeight: number
  roundness: number
  color: string
  strokeColor: string
  strokeWidth: number
  rotation: number
  centerX: number
  centerY: number
}

function characterWidth(character: string, fontSize: number): number {
  return (character.codePointAt(0) ?? 0) > 0xff ? fontSize : fontSize * 0.62
}

function lineWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce(
    (width, character) => width + characterWidth(character, fontSize),
    0,
  )
}

function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  let width = 0
  for (const character of text) {
    const nextWidth = characterWidth(character, fontSize)
    if ((line && width + nextWidth > maxWidth) || character === '\n') {
      lines.push(line)
      line = ''
      width = 0
    }
    if (character !== '\n') {
      line += character
      width += nextWidth
    }
  }
  lines.push(line)
  return lines
}

export function createAlimamaProfileTextSpecs(
  document: GraphDocument,
  customTextIds?: readonly string[],
): ProfileTextLineSpec[] {
  const scale = document.canvas.height / 800
  return [...document.profile.customTexts].reverse().flatMap((customText) => {
    if (customTextIds && !customTextIds.includes(customText.id)) return []
    if (!customText.visible || customText.fontFamily !== 'alimama-fangyuan') {
      return []
    }
    const fontSize = customText.fontSize * scale
    const lineHeight = fontSize * 1.3
    const lines = wrapText(
      customText.text,
      fontSize,
      document.canvas.width * customText.maxWidth,
    )
    const width = Math.max(1, ...lines.map((line) => lineWidth(line, fontSize)))
    const height = Math.max(
      fontSize,
      fontSize + (lines.length - 1) * lineHeight,
    )
    const x = customText.x * document.canvas.width
    const top = customText.y * document.canvas.height
    const centerX = x + width / 2
    const centerY = top + height / 2
    return lines.map((line, index) => ({
      id: customText.id + '-line-' + index,
      text: line,
      x,
      y: top + fontSize + index * lineHeight,
      fontSize,
      fontWeight: customText.fontWeight,
      roundness: customText.roundness * 100,
      color: customText.color,
      strokeColor: customText.strokeColor,
      strokeWidth: customText.strokeWidth * scale * 2,
      rotation: customText.rotation,
      centerX,
      centerY,
    }))
  })
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function createAlimamaProfileTextSvg(
  document: GraphDocument,
  fontDataUrl: string,
  customTextIds?: readonly string[],
): string {
  const lines = createAlimamaProfileTextSpecs(document, customTextIds)
    .map((spec) => {
      const variation = resolveAlimamaVariation(spec.fontWeight, spec.roundness)
      const stroke =
        spec.strokeWidth > 0
          ? ' stroke="' +
            escapeXml(spec.strokeColor) +
            '" stroke-width="' +
            spec.strokeWidth +
            '" stroke-linejoin="round" paint-order="stroke fill"'
          : ''
      const transform =
        spec.rotation === 0
          ? ''
          : ' transform="rotate(' +
            spec.rotation +
            ' ' +
            spec.centerX +
            ' ' +
            spec.centerY +
            ')"'
      return (
        '<text x="' +
        spec.x +
        '" y="' +
        spec.y +
        '" fill="' +
        escapeXml(spec.color) +
        '" font-size="' +
        spec.fontSize +
        '" font-weight="' +
        variation.weight +
        '"' +
        stroke +
        transform +
        ' style="font-family:&quot;' +
        ALIMAMA_FANGYUAN_FAMILY +
        '&quot;;font-variation-settings:' +
        escapeXml(variation.settings) +
        '">' +
        escapeXml(spec.text) +
        '</text>'
      )
    })
    .join('')
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    document.canvas.width +
    '" height="' +
    document.canvas.height +
    '" viewBox="0 0 ' +
    document.canvas.width +
    ' ' +
    document.canvas.height +
    '">' +
    '<style>@font-face{font-family:&quot;' +
    ALIMAMA_FANGYUAN_FAMILY +
    '&quot;;src:url(&quot;' +
    fontDataUrl +
    '&quot;) format(&quot;truetype&quot;);font-weight:200 700;font-style:normal}</style>' +
    lines +
    '</svg>'
  )
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('资料方圆体文字层生成失败'))
    }
    image.src = objectUrl
  })
}

export async function createAlimamaProfileTextImage(
  document: GraphDocument,
  customTextId: string,
): Promise<HTMLImageElement> {
  const fontDataUrl = await getAlimamaFontDataUrl()
  return loadSvgImage(
    createAlimamaProfileTextSvg(document, fontDataUrl, [customTextId]),
  )
}

export async function drawAlimamaProfileTextsToCanvas(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
): Promise<void> {
  if (
    !document.profile.customTexts.some(
      (text) => text.visible && text.fontFamily === 'alimama-fangyuan',
    )
  ) {
    return
  }
  const fontDataUrl = await getAlimamaFontDataUrl()
  const svg = createAlimamaProfileTextSvg(document, fontDataUrl)
  const image = await loadSvgImage(svg)
  context.drawImage(image, 0, 0, document.canvas.width, document.canvas.height)
}
