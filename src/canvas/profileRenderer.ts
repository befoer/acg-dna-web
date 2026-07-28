import type {
  GraphDocument,
  GraphProfileCustomText,
  GraphProfileLabel,
  GraphProfileLabelType,
} from '../domain/graph'
import { decorationCustomTextLayerId } from '../domain/graph'
import {
  getProfileSubTemplate,
  isNicknameProfileSlot,
  resolveProfileLabelSlot,
  type ProfileLabelSlot,
  type ProfileSubTemplate,
} from '../domain/profileTemplates'
import type { LocalImageAsset } from '../editor/assets'
import {
  getProfileTextFontCssFamily,
  RESOURCE_ROUNDED_FAMILY,
} from '../fonts/fontManager'
import type { ProfileTemplateAssetMap } from './profileTemplateAssets'
import { drawTransformedImageCover } from './imageTransform'

type LocalImageAssetMap = Readonly<Record<string, LocalImageAsset>>

interface Rectangle {
  left: number
  top: number
  width: number
  height: number
}

export interface ProfileCustomTextRegion extends Rectangle {
  id: string
  rotation: number
}

export function isProfileCustomTextResizeHandleHit(
  region: ProfileCustomTextRegion,
  x: number,
  y: number,
  tolerance: number,
  padding = 6,
): boolean {
  const centerX = region.left + region.width / 2
  const centerY = region.top + region.height / 2
  const angle = (-region.rotation * Math.PI) / 180
  const deltaX = x - centerX
  const deltaY = y - centerY
  const localX = centerX + deltaX * Math.cos(angle) - deltaY * Math.sin(angle)
  const localY = centerY + deltaX * Math.sin(angle) + deltaY * Math.cos(angle)
  const corners: readonly (readonly [number, number])[] = [
    [region.left - padding, region.top - padding],
    [region.left + region.width + padding, region.top - padding],
    [region.left - padding, region.top + region.height + padding],
    [
      region.left + region.width + padding,
      region.top + region.height + padding,
    ],
  ]
  return corners.some(
    ([cornerX, cornerY]) =>
      Math.hypot(localX - cornerX, localY - cornerY) <= tolerance,
  )
}

function profileSlotFontFamily(fontName: string | undefined): string {
  if (fontName?.includes('资源圆体')) {
    return (
      '"' + RESOURCE_ROUNDED_FAMILY + '", ui-rounded, system-ui, sans-serif'
    )
  }
  return 'Inter, "Noto Sans SC", system-ui, sans-serif'
}

function labelTypeForSlot(type: string): GraphProfileLabelType | null {
  const normalized = type.toLowerCase()
  const number = normalized.startsWith('label')
    ? Number.parseInt(normalized.slice(5), 10)
    : type.startsWith('标签')
      ? Number.parseInt(type.slice(2), 10)
      : Number.NaN
  if (number === 1) return 'location'
  if (number === 2) return 'job'
  if (number === 3) return 'mbti'
  if (number === 4) return 'expansion'
  if (
    normalized === 'location' ||
    normalized === 'job' ||
    normalized === 'mbti' ||
    normalized === 'expansion'
  ) {
    return normalized
  }
  return null
}

function orderedVisibleLabels(
  document: GraphDocument,
  template: ProfileSubTemplate,
): GraphProfileLabel[] {
  const ordered = template.labelSlots
    .map((slot) => labelTypeForSlot(slot.type))
    .filter((type): type is GraphProfileLabelType => type !== null)
    .map((type) => document.profile.labels.find((label) => label.type === type))
    .filter((label): label is GraphProfileLabel => Boolean(label))
  return ordered
    .filter((label) => {
      const content = label.content.trim()
      return content.length > 0 && !/^标签\d+$/.test(content)
    })
    .slice(0, document.profile.visibleLabelCount)
}

function imageNaturalWidth(image: HTMLImageElement): number {
  return image.naturalWidth || image.width
}

function imageNaturalHeight(image: HTMLImageElement): number {
  return image.naturalHeight || image.height
}

function drawTemplateAvatar(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  assets: LocalImageAssetMap,
  templateAssets: ProfileTemplateAssetMap,
  template: ProfileSubTemplate,
  avatarX: number,
  avatarY: number,
  avatarSize: number,
): void {
  if (!document.profile.avatarVisible || avatarSize <= 0) return
  const frameScale = template.avatarFrameScale ?? 1.25
  const frameSize = avatarSize * frameScale
  const frameX =
    avatarX -
    (frameSize - avatarSize) / 2 +
    (template.avatarFrameOffsetX ?? 0) * document.canvas.width
  const frameY =
    avatarY -
    (frameSize - avatarSize) / 2 +
    (template.avatarFrameOffsetY ?? 0) * document.canvas.height
  const avatar = document.profile.avatarAssetId
    ? assets[document.profile.avatarAssetId]
    : undefined
  const frame = templateAssets.avatarFrame

  const drawAvatar = () => {
    if (!avatar) return
    context.save()
    if (template.avatarShape !== 'square') {
      context.beginPath()
      context.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2,
        0,
        Math.PI * 2,
      )
      context.clip()
    }
    drawTransformedImageCover(
      context,
      avatar.image,
      avatarX,
      avatarY,
      avatarSize,
      avatarSize,
      document.profile.avatarTransform,
    )
    context.restore()
  }
  const drawFrame = () => {
    if (frame) context.drawImage(frame, frameX, frameY, frameSize, frameSize)
  }

  if (template.avatarFrameDrawOrder === 'below') {
    drawFrame()
    drawAvatar()
  } else {
    drawAvatar()
    drawFrame()
  }
}

function drawProfileLabel(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  templateAssets: ProfileTemplateAssetMap,
  template: ProfileSubTemplate,
  rawSlot: ProfileLabelSlot,
  content: string,
  zeroLabelLayout: boolean,
  offsetX: number,
): Rectangle {
  const slot = resolveProfileLabelSlot(template, rawSlot)
  const scale = document.canvas.height / 800
  const baseFontSize = slot.fontSize ?? 12
  const charCount = Array.from(content).length
  const fontSize =
    slot.shrinkAfterChars && charCount > slot.shrinkAfterChars
      ? baseFontSize * scale * (slot.shrinkAfterChars / charCount)
      : baseFontSize * scale
  const referenceFontSize = baseFontSize * scale
  const weight =
    slot.fontWeight ?? (isNicknameProfileSlot(slot.type) ? 700 : 400)
  const family = profileSlotFontFamily(slot.fontFamily)
  const x =
    (zeroLabelLayout ? (slot.zeroLabelX ?? slot.x) : slot.x) *
      document.canvas.width +
    offsetX
  const y =
    (zeroLabelLayout ? (slot.zeroLabelY ?? slot.y) : slot.y) *
    document.canvas.height

  context.save()
  context.font = weight + ' ' + fontSize + 'px ' + family
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  const metrics = context.measureText(content)
  const textWidth = metrics.width
  const textHeight =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent ||
    fontSize
  const referenceHeight = referenceFontSize
  const background = templateAssets['labelBg_' + rawSlot.type]
  let backgroundBounds: Rectangle | null = null

  if (background) {
    const backgroundScale = (slot.bgScale ?? 1) * scale * 0.5
    const backgroundWidth = imageNaturalWidth(background) * backgroundScale
    const backgroundHeight = imageNaturalHeight(background) * backgroundScale
    const anchor =
      slot.bgAnchor?.toLowerCase() ??
      (isNicknameProfileSlot(slot.type) ? 'center' : 'left')
    const backgroundX =
      anchor === 'left' || anchor === 'start'
        ? x + (slot.bgOffsetX ?? 0) * document.canvas.height
        : anchor === 'right' || anchor === 'end'
          ? x +
            textWidth -
            backgroundWidth +
            (slot.bgOffsetX ?? 0) * document.canvas.height
          : x +
            (textWidth - backgroundWidth) / 2 +
            (slot.bgOffsetX ?? 0) * document.canvas.height
    const backgroundY =
      y +
      (referenceHeight - backgroundHeight) / 2 +
      (slot.bgOffsetY ?? 0) * document.canvas.height
    context.drawImage(
      background,
      backgroundX,
      backgroundY,
      backgroundWidth,
      backgroundHeight,
    )
    backgroundBounds = {
      left: backgroundX,
      top: backgroundY,
      width: backgroundWidth,
      height: backgroundHeight,
    }
  }

  const normalizedAlign = slot.textAlign?.toLowerCase()
  const centersInBackground =
    backgroundBounds !== null &&
    normalizedAlign !== 'left' &&
    normalizedAlign !== 'start' &&
    normalizedAlign !== 'right' &&
    normalizedAlign !== 'end' &&
    (normalizedAlign === 'center' || !isNicknameProfileSlot(slot.type))
  const textOffsetX = (slot.textOffsetX ?? 0) * document.canvas.height
  const drawX =
    backgroundBounds &&
    (normalizedAlign === 'right' || normalizedAlign === 'end')
      ? backgroundBounds.left + backgroundBounds.width - textWidth + textOffsetX
      : backgroundBounds && centersInBackground
        ? backgroundBounds.left +
          (backgroundBounds.width - textWidth) / 2 +
          textOffsetX
        : x + textOffsetX
  const drawTop =
    backgroundBounds && centersInBackground
      ? backgroundBounds.top +
        (backgroundBounds.height - textHeight) / 2 +
        (slot.textOffsetY ?? 0) * document.canvas.height
      : y + (slot.textOffsetY ?? 0) * document.canvas.height
  const baseline = drawTop + (metrics.actualBoundingBoxAscent || fontSize * 0.8)
  const centerX = drawX + textWidth / 2
  const centerY = drawTop + textHeight / 2

  context.translate(centerX, centerY)
  context.rotate(((slot.rotation ?? 0) * Math.PI) / 180)
  context.translate(-centerX, -centerY)
  context.lineJoin = 'round'
  context.lineCap = 'round'
  const stroke2Width = (slot.stroke2Width ?? 0) * scale
  if (slot.stroke2Color && stroke2Width > 0) {
    context.strokeStyle = slot.stroke2Color
    context.lineWidth = stroke2Width * 2
    context.strokeText(content, drawX, baseline)
  }
  const shadowDistance = (slot.shadowDistance ?? 0) * scale
  if (slot.shadowColor && shadowDistance > 0) {
    context.save()
    context.globalAlpha = slot.shadowAlpha ?? 0.5
    context.fillStyle = slot.shadowColor
    const shadowExpand = (slot.shadowExpand ?? 0) * scale
    if (shadowExpand > 0) {
      context.strokeStyle = slot.shadowColor
      context.lineWidth = shadowExpand * 2
      context.strokeText(content, drawX, baseline + shadowDistance)
    }
    context.fillText(content, drawX, baseline + shadowDistance)
    context.restore()
  }
  const strokeWidth = (slot.strokeWidth ?? 0) * scale
  if (slot.strokeColor && strokeWidth > 0) {
    context.strokeStyle = slot.strokeColor
    context.lineWidth = strokeWidth * 2
    context.strokeText(content, drawX, baseline)
  }
  context.fillStyle = slot.textColor ?? '#5D4037'
  context.fillText(content, drawX, baseline)
  context.restore()

  return slot.followBoundsSource?.toLowerCase() === 'background' &&
    backgroundBounds
    ? backgroundBounds
    : { left: drawX, top: drawTop, width: textWidth, height: textHeight }
}

function drawTextBlock(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  template: ProfileSubTemplate,
  templateAssets: ProfileTemplateAssetMap,
): void {
  const profile = document.profile
  const slot = template.textSlots[0]
  if (
    !slot ||
    !profile.textBlockVisible ||
    profile.textBlockContent.length === 0
  ) {
    return
  }
  const x = slot.x * document.canvas.width
  const y = slot.y * document.canvas.height
  const width = slot.width * document.canvas.width
  const height = slot.height * document.canvas.height
  const background = templateAssets.textBlockBg
  if (background) {
    const backgroundWidth = width * (slot.bgScale ?? 1)
    const backgroundHeight =
      backgroundWidth /
      (imageNaturalWidth(background) / imageNaturalHeight(background))
    context.drawImage(
      background,
      x + (slot.bgOffsetX ?? 0) * document.canvas.width,
      y + (slot.bgOffsetY ?? 0) * document.canvas.height,
      backgroundWidth,
      backgroundHeight,
    )
  }

  const fontSize = (slot.fontSize ?? 11) * (document.canvas.height / 800)
  const lineHeight = fontSize * (slot.lineHeight ?? 1.3)
  const paddingX = (slot.textPaddingX ?? 0.01) * document.canvas.width
  const maxWidth =
    (slot.textMaxWidth ?? slot.width - (slot.textPaddingX ?? 0.01) * 2) *
    document.canvas.width
  context.save()
  context.translate(x + width / 2, y + height / 2)
  context.rotate(((slot.rotation ?? 0) * Math.PI) / 180)
  context.translate(-(x + width / 2), -(y + height / 2))
  context.font =
    (slot.fontWeight ?? 400) +
    ' ' +
    fontSize +
    'px ' +
    profileSlotFontFamily(slot.fontFamily)
  context.fillStyle = slot.textColor ?? '#5D4037'
  context.textBaseline = 'alphabetic'
  let currentX = x + paddingX
  let currentY = y + fontSize
  let lineCount = 0
  for (const character of profile.textBlockContent) {
    const characterWidth = context.measureText(character).width
    if (
      currentX + characterWidth > x + paddingX + maxWidth ||
      character === '\n'
    ) {
      currentX = x + paddingX
      currentY += lineHeight
      lineCount += 1
    }
    if (character !== '\n' && lineCount < (slot.maxLines ?? 5)) {
      context.fillText(character, currentX, currentY)
      currentX += characterWidth
    }
  }
  context.restore()
}

function customTextRegion(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  customText: GraphProfileCustomText,
): ProfileCustomTextRegion {
  const scale = document.canvas.height / 800
  const fontSize = customText.fontSize * scale
  const maxWidth = document.canvas.width * customText.maxWidth
  const lineHeight = fontSize * 1.3
  context.font =
    customText.fontWeight +
    ' ' +
    fontSize +
    'px ' +
    getProfileTextFontCssFamily(customText.fontFamily)
  let measuredWidth = 0
  let measuredHeight = fontSize
  let lineWidth = 0
  for (const character of customText.text) {
    const characterWidth = context.measureText(character).width
    if (lineWidth + characterWidth > maxWidth || character === '\n') {
      measuredWidth = Math.max(measuredWidth, lineWidth)
      lineWidth = 0
      measuredHeight += lineHeight
    }
    if (character !== '\n') lineWidth += characterWidth
  }
  measuredWidth = Math.max(measuredWidth, lineWidth)
  return {
    id: customText.id,
    left: customText.x * document.canvas.width,
    top: customText.y * document.canvas.height,
    width: Math.max(1, measuredWidth),
    height: Math.max(fontSize, measuredHeight),
    rotation: customText.rotation,
  }
}

export function createProfileCustomTextRegions(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
): ProfileCustomTextRegion[] {
  return document.profile.customTexts
    .filter(
      (customText) =>
        customText.visible &&
        !document.decoration.hiddenLayerIds.includes(
          decorationCustomTextLayerId(customText.id),
        ),
    )
    .map((customText) => customTextRegion(context, document, customText))
}

function drawCustomTexts(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  selectedCustomTextId: string | null | undefined,
): void {
  const scale = document.canvas.height / 800
  const regions = createProfileCustomTextRegions(context, document)
  ;[...document.profile.customTexts].reverse().forEach((customText) => {
    if (
      !customText.visible ||
      document.decoration.hiddenLayerIds.includes(
        decorationCustomTextLayerId(customText.id),
      )
    ) {
      return
    }
    const region = regions.find((candidate) => candidate.id === customText.id)
    if (!region) return
    const fontSize = customText.fontSize * scale
    const lineHeight = fontSize * 1.3
    const maxWidth = document.canvas.width * customText.maxWidth
    context.save()
    context.font =
      customText.fontWeight +
      ' ' +
      fontSize +
      'px ' +
      getProfileTextFontCssFamily(customText.fontFamily)
    context.textBaseline = 'alphabetic'
    const centerX = region.left + region.width / 2
    const centerY = region.top + region.height / 2
    context.translate(centerX, centerY)
    context.rotate((customText.rotation * Math.PI) / 180)
    context.translate(-centerX, -centerY)

    const characters: Array<{ character: string; x: number; y: number }> = []
    let x = region.left
    let y = region.top + fontSize
    for (const character of customText.text) {
      const characterWidth = context.measureText(character).width
      if (x + characterWidth > region.left + maxWidth || character === '\n') {
        x = region.left
        y += lineHeight
      }
      if (character !== '\n') {
        characters.push({ character, x, y })
        x += characterWidth
      }
    }

    context.lineJoin = 'round'
    context.lineCap = 'round'
    if (customText.strokeWidth > 0) {
      context.strokeStyle = customText.strokeColor
      context.lineWidth = customText.strokeWidth * scale * 2
      characters.forEach((item) =>
        context.strokeText(item.character, item.x, item.y),
      )
    }
    context.fillStyle = customText.color
    characters.forEach((item) =>
      context.fillText(item.character, item.x, item.y),
    )

    if (selectedCustomTextId === customText.id) {
      const padding = 6 * scale
      context.strokeStyle = '#00D9C5'
      context.lineWidth = Math.max(1, scale)
      context.setLineDash([8 * scale, 4 * scale])
      context.strokeRect(
        region.left - padding,
        region.top - padding,
        region.width + padding * 2,
        region.height + padding * 2,
      )
      context.setLineDash([])
      const handleSize = 5 * scale
      const corners = [
        [region.left - padding, region.top - padding],
        [region.left + region.width + padding, region.top - padding],
        [region.left - padding, region.top + region.height + padding],
        [
          region.left + region.width + padding,
          region.top + region.height + padding,
        ],
      ]
      context.fillStyle = '#00D9C5'
      corners.forEach(([cornerX, cornerY]) => {
        if (cornerX === undefined || cornerY === undefined) return
        context.fillRect(
          cornerX - handleSize / 2,
          cornerY - handleSize / 2,
          handleSize,
          handleSize,
        )
      })
    }
    context.restore()
  })
}

export function hitTestProfileCustomText(
  regions: readonly ProfileCustomTextRegion[],
  x: number,
  y: number,
  orderedIds: readonly string[] = regions.map((region) => region.id),
): string | null {
  for (const id of orderedIds) {
    const region = regions.find((candidate) => candidate.id === id)
    if (!region) continue
    const centerX = region.left + region.width / 2
    const centerY = region.top + region.height / 2
    const angle = (-region.rotation * Math.PI) / 180
    const deltaX = x - centerX
    const deltaY = y - centerY
    const localX = centerX + deltaX * Math.cos(angle) - deltaY * Math.sin(angle)
    const localY = centerY + deltaX * Math.sin(angle) + deltaY * Math.cos(angle)
    if (
      localX >= region.left &&
      localX <= region.left + region.width &&
      localY >= region.top &&
      localY <= region.top + region.height
    ) {
      return region.id
    }
  }
  return null
}

export function drawProfileCustomTexts(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  selectedCustomTextId?: string | null,
): void {
  drawCustomTexts(context, document, selectedCustomTextId)
}

export function drawProfileCustomText(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  customTextId: string,
  selectedCustomTextId?: string | null,
): void {
  const customText = document.profile.customTexts.find(
    (candidate) => candidate.id === customTextId,
  )
  if (!customText) return
  drawCustomTexts(
    context,
    {
      ...document,
      profile: { ...document.profile, customTexts: [customText] },
    },
    selectedCustomTextId,
  )
}

export function drawProfileTemplate(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  assets: LocalImageAssetMap,
  templateAssets: ProfileTemplateAssetMap,
): void {
  const template = document.profile.subTemplateId
    ? getProfileSubTemplate(document.profile.subTemplateId)
    : undefined
  if (!template) return

  const visibleLabels = orderedVisibleLabels(document, template)
  const zeroLabelLayout = visibleLabels.length === 0
  const offsetX =
    template.id === 'endfield_2' && visibleLabels.length <= 2
      ? document.canvas.width * 0.12
      : 0

  const header = templateAssets.headerImage
  if (header) {
    const width = document.canvas.width * 0.8 * (template.headerImageScale ?? 1)
    const height =
      (imageNaturalHeight(header) / imageNaturalWidth(header)) * width
    const x =
      (document.canvas.width - width) / 2 +
      (template.headerImageOffsetX ?? 0) * document.canvas.width
    const y =
      document.canvas.height * 0.02 +
      (template.headerImageOffsetY ?? 0) * document.canvas.height
    context.drawImage(header, x, y, width, height)
  }

  const avatarSize = document.canvas.width * (template.avatarSize ?? 0.1)
  const avatarX =
    document.canvas.width *
      (zeroLabelLayout
        ? (template.zeroLabelAvatarX ?? template.avatarX ?? 0.03)
        : (template.avatarX ?? 0.03)) +
    offsetX
  const avatarY =
    document.canvas.height *
    (zeroLabelLayout
      ? (template.zeroLabelAvatarY ?? template.avatarY ?? 0.025)
      : (template.avatarY ?? 0.025))
  drawTemplateAvatar(
    context,
    document,
    assets,
    templateAssets,
    template,
    avatarX,
    avatarY,
    avatarSize,
  )

  const labelBounds = new Map<string, Rectangle>()
  let customLabelIndex = 0
  template.labelSlots.forEach((slot) => {
    const nickname = isNicknameProfileSlot(slot.type)
    const visible = nickname
      ? document.profile.nicknameVisible
      : customLabelIndex < visibleLabels.length
    const labelIndex = nickname ? -1 : customLabelIndex++
    if (!visible) return
    const content = nickname
      ? document.profile.nickname || '我的昵称'
      : (visibleLabels[labelIndex]?.content ?? '')
    const bounds = drawProfileLabel(
      context,
      document,
      templateAssets,
      template,
      slot,
      content,
      zeroLabelLayout,
      offsetX,
    )
    labelBounds.set(nickname ? 'nickname' : slot.type, bounds)
  })

  const hideGender =
    template.parentTemplateId === 'Endfield' &&
    !document.profile.nicknameVisible &&
    ['nickname', 'name', '昵称'].includes(
      template.genderIconFollows?.toLowerCase() ?? '',
    )
  const genderIcon = hideGender ? undefined : templateAssets.genderIcon
  if (genderIcon) {
    const iconSize = document.canvas.width * (template.genderIconSize ?? 0.03)
    let iconX = document.canvas.width * (template.genderIconX ?? 0)
    let iconY = document.canvas.height * (template.genderIconY ?? 0)
    if (template.genderIconFollows) {
      const target =
        labelBounds.get(template.genderIconFollows) ??
        labelBounds.get('nickname') ??
        labelBounds.get('name') ??
        labelBounds.get('昵称')
      if (target) {
        iconX =
          target.left +
          target.width +
          (template.genderIconX ?? 0) * document.canvas.width
        iconY =
          target.top +
          target.height / 2 -
          iconSize / 2 +
          (template.genderIconY ?? 0) * document.canvas.height
      }
    }
    context.drawImage(genderIcon, iconX, iconY, iconSize, iconSize)
  }
  drawTextBlock(context, document, template, templateAssets)
}

export function drawProfileElements(
  context: CanvasRenderingContext2D,
  document: GraphDocument,
  assets: LocalImageAssetMap,
  templateAssets: ProfileTemplateAssetMap,
  selectedCustomTextId?: string | null,
): void {
  drawProfileCustomTexts(context, document, selectedCustomTextId)
  drawProfileTemplate(context, document, assets, templateAssets)
}
