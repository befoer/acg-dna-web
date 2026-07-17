import {
  resolveCategoryAppearance,
  type GraphDocument,
  type GraphLabelFontFamily,
  type GraphLabelSettings,
} from '../domain/graph'
import type { LocalImageAsset } from '../editor/assets'
import {
  ALIMAMA_FANGYUAN_FAMILY,
  getAlimamaFontDataUrl,
  resolveAlimamaVariation,
} from '../fonts/fontManager'
import type { BasicLayoutResult, LayoutNode } from '../layout/basicLayout'

type LocalImageAssetMap = Readonly<Record<string, LocalImageAsset>>

export interface GraphLabelSpec {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  fontWeight: number
  fontFamily: GraphLabelFontFamily
  fontRoundness: number
  color: string
  opacity: number
  textLength?: number
  shadow: boolean
}

export function graphNodeFontSize(node: LayoutNode): number {
  if (node.kind === 'category') {
    return Math.max(22, Math.min(42, node.radius * 0.13))
  }
  if (node.kind === 'attribute') {
    return Math.max(18, Math.min(32, node.radius * 0.16))
  }
  return Math.max(15, Math.min(28, node.radius * 0.3))
}

function characterWidth(character: string, fontSize: number): number {
  return (character.codePointAt(0) ?? 0) > 0xff ? fontSize : fontSize * 0.62
}

function estimatedTextWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce(
    (width, character) => width + characterWidth(character, fontSize),
    0,
  )
}

function splitLabelText(text: string, maxWidth: number, fontSize: number) {
  const characters = Array.from(text.trim() || '未命名')
  const lines: string[] = []
  let current = ''
  let currentWidth = 0

  for (const character of characters) {
    const width = characterWidth(character, fontSize)
    if (current && currentWidth + width > maxWidth && lines.length === 0) {
      lines.push(current)
      current = character
      currentWidth = width
    } else {
      current += character
      currentWidth += width
    }
  }
  if (current) lines.push(current)
  if (lines.length <= 2) return lines

  const second = Array.from(lines.slice(1).join(''))
  while (
    second.length > 1 &&
    estimatedTextWidth(second.join('') + '…', fontSize) > maxWidth
  ) {
    second.pop()
  }
  return [lines[0] ?? '', second.join('') + '…']
}

function appendNodeSpecs(
  specs: GraphLabelSpec[],
  node: LayoutNode,
  document: GraphDocument,
  assets: LocalImageAssetMap,
): void {
  node.children.forEach((child) =>
    appendNodeSpecs(specs, child, document, assets),
  )
  const category = document.categories.find(
    (item) => item.id === node.categoryId,
  )
  const settings: GraphLabelSettings = category
    ? resolveCategoryAppearance(category, document.canvas.labelSettings)
    : document.canvas.labelSettings
  const showText =
    node.kind === 'category'
      ? settings.showCategoryText
      : settings.showLabelText
  if (!showText) return

  const hasImage =
    (node.kind === 'category'
      ? category
        ? resolveCategoryAppearance(category, document.canvas.labelSettings)
            .showCategoryImage
        : settings.showImages
      : category
        ? resolveCategoryAppearance(category, document.canvas.labelSettings)
            .showLabelImages
        : settings.showImages) &&
    Boolean(node.imageAssetId && assets[node.imageAssetId])
  const fontSize = graphNodeFontSize(node)
  const color = settings.textColorOverride ?? (hasImage ? '#FFFFFF' : '#242429')
  const maxWidth = Math.max(30, node.radius * 1.48)
  const lines = splitLabelText(node.name, maxWidth, fontSize)
  const isContainer = node.children.length > 0
  const startY = isContainer
    ? node.y - node.radius + fontSize * 1.45
    : node.y - ((lines.length - 1) * fontSize * 0.58 + fontSize * 0.14)

  lines.forEach((line, index) => {
    const estimatedWidth = estimatedTextWidth(line, fontSize)
    specs.push({
      id: node.id + '-name-' + index,
      text: line,
      x: node.x,
      y: startY + index * fontSize * 1.1,
      fontSize,
      fontWeight: settings.fontWeight,
      fontFamily: settings.fontFamily,
      fontRoundness: settings.fontRoundness,
      color,
      opacity: 1,
      ...(estimatedWidth > maxWidth ? { textLength: maxWidth } : {}),
      shadow: hasImage,
    })
  })

  if (!isContainer && node.radius >= 48) {
    const valueFontSize = Math.max(12, fontSize * 0.58)
    specs.push({
      id: node.id + '-value',
      text: String(Math.round(node.value)),
      x: node.x,
      y: startY + lines.length * fontSize * 1.04,
      fontSize: valueFontSize,
      fontWeight: Math.max(300, settings.fontWeight - 100),
      fontFamily: settings.fontFamily,
      fontRoundness: settings.fontRoundness,
      color,
      opacity: 0.82,
      shadow: hasImage,
    })
  }
}

export function createGraphLabelSpecs(
  document: GraphDocument,
  layout: BasicLayoutResult,
  assets: LocalImageAssetMap,
): GraphLabelSpec[] {
  const specs: GraphLabelSpec[] = []
  layout.roots.forEach((node) => appendNodeSpecs(specs, node, document, assets))
  return specs
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function createAlimamaLabelSvg(
  document: GraphDocument,
  layout: BasicLayoutResult,
  assets: LocalImageAssetMap,
  fontDataUrl: string,
): string {
  const specs = createGraphLabelSpecs(document, layout, assets).filter(
    (spec) => spec.fontFamily === 'alimama-fangyuan',
  )
  const bounds = document.canvas.contentBounds
  const centerX = ((bounds.left + bounds.right) / 2) * document.canvas.width
  const centerY = ((bounds.top + bounds.bottom) / 2) * document.canvas.height
  const transform =
    bounds.rotation === 0
      ? ''
      : ' transform="rotate(' +
        bounds.rotation +
        ' ' +
        centerX +
        ' ' +
        centerY +
        ')"'
  const labels = specs
    .map((spec) => {
      const variation = resolveAlimamaVariation(
        spec.fontWeight,
        spec.fontRoundness,
      )
      const textLength =
        spec.textLength === undefined
          ? ''
          : ' textLength="' +
            spec.textLength +
            '" lengthAdjust="spacingAndGlyphs"'
      const filter = spec.shadow ? ' filter="url(#label-shadow)"' : ''
      return (
        '<text x="' +
        spec.x +
        '" y="' +
        spec.y +
        '" fill="' +
        escapeXml(spec.color) +
        '" fill-opacity="' +
        spec.opacity +
        '" font-size="' +
        spec.fontSize +
        '" font-weight="' +
        variation.weight +
        '" text-anchor="middle" dominant-baseline="middle"' +
        textLength +
        filter +
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
    '<defs><filter id="label-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.65"/></filter></defs>' +
    '<g' +
    transform +
    '>' +
    labels +
    '</g></svg>'
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
      reject(new Error('阿里妈妈方圆体文字层生成失败'))
    }
    image.src = objectUrl
  })
}

export async function drawAlimamaLabelsToCanvas(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  layout: BasicLayoutResult,
  assets: LocalImageAssetMap,
): Promise<void> {
  const fontDataUrl = await getAlimamaFontDataUrl()
  const svg = createAlimamaLabelSvg(document, layout, assets, fontDataUrl)
  const image = await loadSvgImage(svg)
  context.drawImage(image, 0, 0, document.canvas.width, document.canvas.height)
}
