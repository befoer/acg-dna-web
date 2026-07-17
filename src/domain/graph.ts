export const GRAPH_SCHEMA_VERSION = 1 as const

export type GraphSchemaVersion = typeof GRAPH_SCHEMA_VERSION
export type GraphNodeKind = 'category' | 'attribute' | 'subAttribute'
export type GraphLayoutMode = 'packing' | 'gravity'
export type GraphTemplateId = 'custom' | 'cute-pink' | 'endfield'
export type GraphLabelFontFamily =
  'sans' | 'resource-rounded' | 'alimama-fangyuan' | 'local'
export type GraphCategoryFontFamily = Exclude<GraphLabelFontFamily, 'local'>
export type GraphImageMask = 'none' | 'black' | 'white' | 'category'
export type GraphProfileGender = 'none' | 'male' | 'female'
export type GraphProfileLabelType = 'location' | 'job' | 'mbti' | 'expansion'
export type GraphProfileTextFontFamily =
  'sans' | 'resource-rounded' | 'alimama-fangyuan'

export interface GraphContentBounds {
  left: number
  top: number
  right: number
  bottom: number
  rotation: number
}

export interface GraphImageTransform {
  zoom: number
  offsetX: number
  offsetY: number
  rotation: number
}

export const DEFAULT_IMAGE_TRANSFORM: GraphImageTransform = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
}

export type GraphDecorationPresetId =
  'diary' | 'fox' | 'hosi' | 'nya-shop' | 'pp'
export type GraphDecorationPatternType = 'checker' | 'dots' | 'grid'

export interface GraphDecorationPattern {
  visible: boolean
  type: GraphDecorationPatternType
  foregroundColor: string
  backgroundColor: string
  size: number
  rotation: number
  weight: number
}

export interface GraphDecorationFrame {
  visible: boolean
  width: number
  height: number
  x: number
  y: number
  cornerRadius: number
  fillColor: string
  strokeWidth: number
  strokeColor: string
  rotation: number
}

export interface GraphDecorationFrameElement extends GraphDecorationFrame {
  id: string
  name: string
}

export interface GraphDecorationImage {
  id: string
  name: string
  assetId: string
  visible: boolean
  x: number
  y: number
  size: number
  rotation: number
  opacity: number
}

export interface GraphDecorationSettings {
  templateBackgroundVisible: boolean
  presetIds: GraphDecorationPresetId[]
  pattern: GraphDecorationPattern | null
  frames: GraphDecorationFrameElement[]
  images: GraphDecorationImage[]
  layerOrder: string[]
  hiddenLayerIds: string[]
}

export const DEFAULT_DECORATION_SETTINGS: GraphDecorationSettings = {
  templateBackgroundVisible: true,
  presetIds: [],
  pattern: null,
  frames: [],
  images: [],
  layerOrder: ['data'],
  hiddenLayerIds: [],
}

function createDefaultDecorationSettings(): GraphDecorationSettings {
  return {
    ...DEFAULT_DECORATION_SETTINGS,
    presetIds: [],
    frames: [],
    images: [],
    layerOrder: [DECORATION_DATA_LAYER_ID],
    hiddenLayerIds: [],
  }
}

export const DECORATION_DATA_LAYER_ID = 'data'
export const DECORATION_PATTERN_LAYER_ID = 'pattern'
export const DECORATION_CUSTOM_TEXT_LAYER_PREFIX = 'text:'

export function decorationPresetLayerId(id: GraphDecorationPresetId): string {
  return 'preset:' + id
}

export function decorationFrameLayerId(id: string): string {
  return 'frame:' + id
}

export function decorationImageLayerId(id: string): string {
  return 'image:' + id
}

export function decorationCustomTextLayerId(id: string): string {
  return DECORATION_CUSTOM_TEXT_LAYER_PREFIX + id
}

export function customTextIdFromDecorationLayer(
  layerId: string,
): string | null {
  return layerId.startsWith(DECORATION_CUSTOM_TEXT_LAYER_PREFIX)
    ? layerId.slice(DECORATION_CUSTOM_TEXT_LAYER_PREFIX.length)
    : null
}

export function resolveDecorationLayerOrder(
  decoration: Pick<
    GraphDecorationSettings,
    'presetIds' | 'pattern' | 'frames' | 'images' | 'layerOrder'
  >,
  customTextIds: readonly string[] = [],
): string[] {
  const activeIds = new Set<string>([DECORATION_DATA_LAYER_ID])
  customTextIds.forEach((id) => activeIds.add(decorationCustomTextLayerId(id)))
  decoration.presetIds.forEach((id) =>
    activeIds.add(decorationPresetLayerId(id)),
  )
  if (decoration.pattern) activeIds.add(DECORATION_PATTERN_LAYER_ID)
  decoration.frames.forEach((frame) =>
    activeIds.add(decorationFrameLayerId(frame.id)),
  )
  decoration.images.forEach((image) =>
    activeIds.add(decorationImageLayerId(image.id)),
  )
  const resolved: string[] = []
  decoration.layerOrder.forEach((id) => {
    if (activeIds.has(id) && !resolved.includes(id)) resolved.push(id)
  })
  const missingCustomTextLayers = customTextIds
    .map(decorationCustomTextLayerId)
    .filter((id) => !resolved.includes(id))
  const dataLayerIndex = resolved.indexOf(DECORATION_DATA_LAYER_ID)
  resolved.splice(
    dataLayerIndex < 0 ? 0 : dataLayerIndex,
    0,
    ...missingCustomTextLayers,
  )
  const defaults = [
    ...[...decoration.images]
      .reverse()
      .map((image) => decorationImageLayerId(image.id)),
    ...decoration.presetIds
      .filter((id) => id === 'diary' || id === 'fox' || id === 'hosi')
      .map(decorationPresetLayerId),
    DECORATION_DATA_LAYER_ID,
    ...[...decoration.frames]
      .reverse()
      .map((frame) => decorationFrameLayerId(frame.id)),
    ...decoration.presetIds
      .filter((id) => id === 'nya-shop' || id === 'pp')
      .map(decorationPresetLayerId),
    ...(decoration.pattern ? [DECORATION_PATTERN_LAYER_ID] : []),
  ]
  defaults.forEach((id) => {
    if (activeIds.has(id) && !resolved.includes(id)) resolved.push(id)
  })
  return resolved
}

export const DEFAULT_DECORATION_PATTERN: GraphDecorationPattern = {
  visible: true,
  type: 'dots',
  foregroundColor: '#FFFFFF',
  backgroundColor: '#9ADFFF',
  size: 20,
  rotation: 45,
  weight: 0.2,
}

export const DEFAULT_DECORATION_FRAME: GraphDecorationFrame = {
  visible: true,
  width: 0.8,
  height: 0.8,
  x: 0.5,
  y: 0.5,
  cornerRadius: 30,
  fillColor: '#FFFFFF',
  strokeWidth: 5,
  strokeColor: '#74BFE4',
  rotation: 0,
}

export const DEFAULT_CONTENT_BOUNDS: GraphContentBounds = {
  left: 0,
  top: 0,
  right: 1,
  bottom: 1,
  rotation: 0,
}

export interface GraphLabelSettings {
  showCategoryNodes: boolean
  showCategoryText: boolean
  showLabelText: boolean
  showImages: boolean
  categoryStrokeWidth: number
  labelStrokeWidth: number
  fillOpacity: number
  fontFamily: GraphLabelFontFamily
  fontWeight: number
  fontRoundness: number
  localFontId: string | null
  localFontName: string | null
  colorOverride: string | null
  textColorOverride: string | null
}

export const DEFAULT_LABEL_SETTINGS: GraphLabelSettings = {
  showCategoryNodes: true,
  showCategoryText: true,
  showLabelText: true,
  showImages: true,
  categoryStrokeWidth: 2,
  labelStrokeWidth: 1,
  fillOpacity: 1,
  fontFamily: 'sans',
  fontWeight: 600,
  fontRoundness: 0,
  localFontId: null,
  localFontName: null,
  colorOverride: null,
  textColorOverride: null,
}

export interface GraphCategoryAppearance {
  showCategoryImage?: boolean
  showLabelImages?: boolean
  showCategoryText?: boolean
  showLabelText?: boolean
  fillFactor?: number
  fontFamily?: GraphCategoryFontFamily
  fontWeight?: number
  fontRoundness?: number
  categoryStrokeWidth?: number
  labelStrokeWidth?: number
  textColorOverride?: string | null
  imageMask?: GraphImageMask
  imageMaskOpacity?: number
}

export interface ResolvedGraphCategoryAppearance extends GraphLabelSettings {
  showCategoryImage: boolean
  showLabelImages: boolean
  fillFactor: number
  imageMask: GraphImageMask
  imageMaskOpacity: number
}

export interface GraphProfileSettings {
  subTemplateId: string | null
  nickname: string
  gender: GraphProfileGender
  labels: GraphProfileLabel[]
  avatarVisible: boolean
  nicknameVisible: boolean
  visibleLabelCount: number
  textBlockContent: string
  textBlockVisible: boolean
  customTexts: GraphProfileCustomText[]
  avatarAssetId?: string
  avatarTransform?: GraphImageTransform
}

export interface GraphProfileLabel {
  id: string
  type: GraphProfileLabelType
  content: string
  maxLength: number
}

export interface GraphProfileCustomText {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  color: string
  rotation: number
  fontWeight: number
  fontFamily: GraphProfileTextFontFamily
  maxWidth: number
  maxHeight: number
  visible: boolean
  strokeWidth: number
  strokeColor: string
  roundness: number
}

export const DEFAULT_PROFILE_SETTINGS: GraphProfileSettings = {
  subTemplateId: null,
  nickname: '我的昵称',
  gender: 'none',
  labels: [
    {
      id: 'profile-label-location',
      type: 'location',
      content: '',
      maxLength: 8,
    },
    { id: 'profile-label-job', type: 'job', content: '', maxLength: 8 },
    { id: 'profile-label-mbti', type: 'mbti', content: '', maxLength: 8 },
    {
      id: 'profile-label-expansion',
      type: 'expansion',
      content: '',
      maxLength: 8,
    },
  ],
  avatarVisible: true,
  nicknameVisible: true,
  visibleLabelCount: 0,
  textBlockContent: '',
  textBlockVisible: true,
  customTexts: [],
}

export function createDefaultProfileSettings(): GraphProfileSettings {
  return {
    ...DEFAULT_PROFILE_SETTINGS,
    labels: DEFAULT_PROFILE_SETTINGS.labels.map((label) => ({ ...label })),
    customTexts: [],
  }
}

export interface GraphCanvasSettings {
  width: number
  height: number
  backgroundColor: string
  layoutMode: GraphLayoutMode
  templateId: GraphTemplateId
  contentBounds: GraphContentBounds
  labelSettings: GraphLabelSettings
}

interface GraphNodeBase {
  id: string
  name: string
  value: number
  hidden: boolean
  imageAssetId?: string
  imageTransform?: GraphImageTransform
}

export type GraphSubAttribute = GraphNodeBase

export interface GraphAttribute extends GraphNodeBase {
  children: GraphSubAttribute[]
}

export interface GraphCategory extends GraphNodeBase {
  color: string
  appearance?: GraphCategoryAppearance
  attributes: GraphAttribute[]
}

export function resolveCategoryAppearance(
  category: GraphCategory,
  globalSettings: GraphLabelSettings,
): ResolvedGraphCategoryAppearance {
  const appearance = category.appearance
  const fontFamily = appearance?.fontFamily ?? globalSettings.fontFamily
  return {
    ...globalSettings,
    showCategoryText:
      appearance?.showCategoryText ?? globalSettings.showCategoryText,
    showLabelText: appearance?.showLabelText ?? globalSettings.showLabelText,
    showCategoryImage:
      globalSettings.showImages && (appearance?.showCategoryImage ?? true),
    showLabelImages:
      globalSettings.showImages && (appearance?.showLabelImages ?? true),
    categoryStrokeWidth:
      appearance?.categoryStrokeWidth ?? globalSettings.categoryStrokeWidth,
    labelStrokeWidth:
      appearance?.labelStrokeWidth ?? globalSettings.labelStrokeWidth,
    fontFamily,
    fontWeight: appearance?.fontWeight ?? globalSettings.fontWeight,
    fontRoundness: appearance?.fontRoundness ?? globalSettings.fontRoundness,
    localFontId: fontFamily === 'local' ? globalSettings.localFontId : null,
    localFontName: fontFamily === 'local' ? globalSettings.localFontName : null,
    textColorOverride:
      appearance?.textColorOverride === undefined
        ? globalSettings.textColorOverride
        : appearance.textColorOverride,
    fillFactor: appearance?.fillFactor ?? 1,
    imageMask: appearance?.imageMask ?? 'none',
    imageMaskOpacity: appearance?.imageMaskOpacity ?? 0.35,
  }
}

export interface GraphDocument {
  schemaVersion: GraphSchemaVersion
  id: string
  name: string
  createdAt: string
  updatedAt: string
  canvas: GraphCanvasSettings
  profile: GraphProfileSettings
  decoration: GraphDecorationSettings
  categories: GraphCategory[]
}

export type GraphNode = GraphCategory | GraphAttribute | GraphSubAttribute

export interface GraphNodeMatch {
  kind: GraphNodeKind
  node: GraphNode
  parentId?: string
  categoryId: string
}

const STARTER_COLORS = ['#15B8A6', '#EF6F9B', '#F09A52', '#6C8FF0'] as const

export function createEntityId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.()
  if (id) {
    return `${prefix}-${id}`
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function createStarterGraph(
  now = new Date().toISOString(),
): GraphDocument {
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    id: 'graph-starter',
    name: '我的 ACG DNA',
    createdAt: now,
    updatedAt: now,
    canvas: {
      width: 1380,
      height: 2000,
      backgroundColor: '#F6F2EC',
      layoutMode: 'gravity',
      templateId: 'custom',
      contentBounds: { ...DEFAULT_CONTENT_BOUNDS },
      labelSettings: { ...DEFAULT_LABEL_SETTINGS },
    },
    profile: createDefaultProfileSettings(),
    decoration: createDefaultDecorationSettings(),
    categories: [
      {
        id: 'category-animation',
        name: '动画偏好',
        value: 82,
        color: STARTER_COLORS[0],
        hidden: false,
        attributes: [
          {
            id: 'attribute-story',
            name: '叙事氛围',
            value: 86,
            hidden: false,
            children: [
              {
                id: 'sub-world',
                name: '世界观',
                value: 78,
                hidden: false,
              },
              {
                id: 'sub-aftertaste',
                name: '情绪余韵',
                value: 64,
                hidden: false,
              },
            ],
          },
          {
            id: 'attribute-visual',
            name: '作画表现',
            value: 72,
            hidden: false,
            children: [
              {
                id: 'sub-color',
                name: '色彩',
                value: 69,
                hidden: false,
              },
              {
                id: 'sub-motion',
                name: '动态',
                value: 58,
                hidden: false,
              },
            ],
          },
        ],
      },
      {
        id: 'category-character',
        name: '角色取向',
        value: 76,
        color: STARTER_COLORS[1],
        hidden: false,
        attributes: [
          {
            id: 'attribute-growth',
            name: '成长弧光',
            value: 80,
            hidden: false,
            children: [
              {
                id: 'sub-choice',
                name: '关键选择',
                value: 73,
                hidden: false,
              },
              {
                id: 'sub-relation',
                name: '人物关系',
                value: 62,
                hidden: false,
              },
            ],
          },
          {
            id: 'attribute-design',
            name: '视觉设计',
            value: 67,
            hidden: false,
            children: [
              {
                id: 'sub-silhouette',
                name: '轮廓',
                value: 61,
                hidden: false,
              },
              {
                id: 'sub-detail',
                name: '细节',
                value: 55,
                hidden: false,
              },
            ],
          },
        ],
      },
      {
        id: 'category-creation',
        name: '创作灵感',
        value: 68,
        color: STARTER_COLORS[2],
        hidden: false,
        attributes: [
          {
            id: 'attribute-music',
            name: '音乐',
            value: 74,
            hidden: false,
            children: [
              {
                id: 'sub-score',
                name: '配乐',
                value: 70,
                hidden: false,
              },
              {
                id: 'sub-theme-song',
                name: '主题曲',
                value: 57,
                hidden: false,
              },
            ],
          },
          {
            id: 'attribute-expression',
            name: '表达欲',
            value: 65,
            hidden: false,
            children: [
              {
                id: 'sub-drawing',
                name: '绘画',
                value: 63,
                hidden: false,
              },
              {
                id: 'sub-writing',
                name: '文字',
                value: 52,
                hidden: false,
              },
            ],
          },
        ],
      },
    ],
  }
}

export function createCategory(index: number): GraphCategory {
  return {
    id: createEntityId('category'),
    name: '新分类',
    value: 60,
    color: STARTER_COLORS[index % STARTER_COLORS.length] ?? '#15B8A6',
    hidden: false,
    attributes: [],
  }
}

export function createAttribute(): GraphAttribute {
  return {
    id: createEntityId('attribute'),
    name: '新属性',
    value: 60,
    hidden: false,
    children: [],
  }
}

export function createSubAttribute(): GraphSubAttribute {
  return {
    id: createEntityId('sub-attribute'),
    name: '新子属性',
    value: 50,
    hidden: false,
  }
}

export function findGraphNode(
  document: GraphDocument,
  nodeId: string,
): GraphNodeMatch | undefined {
  for (const category of document.categories) {
    if (category.id === nodeId) {
      return {
        kind: 'category',
        node: category,
        categoryId: category.id,
      }
    }

    for (const attribute of category.attributes) {
      if (attribute.id === nodeId) {
        return {
          kind: 'attribute',
          node: attribute,
          parentId: category.id,
          categoryId: category.id,
        }
      }

      for (const child of attribute.children) {
        if (child.id === nodeId) {
          return {
            kind: 'subAttribute',
            node: child,
            parentId: attribute.id,
            categoryId: category.id,
          }
        }
      }
    }
  }

  return undefined
}

export function collectNodeImageAssetIds(
  document: GraphDocument,
  nodeId: string,
): string[] {
  const match = findGraphNode(document, nodeId)
  if (!match) {
    return []
  }

  const assetIds: string[] = []
  const pushAsset = (node: GraphNodeBase) => {
    if (node.imageAssetId) {
      assetIds.push(node.imageAssetId)
    }
  }

  pushAsset(match.node)
  if (match.kind === 'category') {
    const category = match.node as GraphCategory
    for (const attribute of category.attributes) {
      pushAsset(attribute)
      attribute.children.forEach(pushAsset)
    }
  } else if (match.kind === 'attribute') {
    const attribute = match.node as GraphAttribute
    attribute.children.forEach(pushAsset)
  }

  return assetIds
}

export class GraphValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GraphValidationError'
  }
}

type UnknownRecord = Record<string, unknown>

function readRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GraphValidationError(`${path} 必须是对象`)
  }
  return value as UnknownRecord
}

function readString(record: UnknownRecord, key: string, path: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GraphValidationError(`${path}.${key} 必须是非空字符串`)
  }
  return value
}

function readNumber(
  record: UnknownRecord,
  key: string,
  path: string,
  min: number,
  max: number,
): number {
  const value = record[key]
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new GraphValidationError(
      `${path}.${key} 必须是 ${min} 到 ${max} 之间的有限数字`,
    )
  }
  return value
}

function readHidden(record: UnknownRecord): boolean {
  const value = record.hidden
  if (value === undefined) {
    return false
  }
  if (typeof value !== 'boolean') {
    throw new GraphValidationError('hidden 必须是布尔值')
  }
  return value
}

function readImageAssetId(
  record: UnknownRecord,
  path: string,
): string | undefined {
  const value = record.imageAssetId
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GraphValidationError(`${path}.imageAssetId 必须是非空字符串`)
  }
  return value
}

function readImageTransform(
  record: UnknownRecord,
  key: string,
  path: string,
): GraphImageTransform | undefined {
  const value = record[key]
  if (value === undefined) return undefined
  const transformPath = path + '.' + key
  const transform = readRecord(value, transformPath)
  return {
    zoom: readNumber(transform, 'zoom', transformPath, 1, 4),
    offsetX: readNumber(transform, 'offsetX', transformPath, -1, 1),
    offsetY: readNumber(transform, 'offsetY', transformPath, -1, 1),
    rotation: readNumber(transform, 'rotation', transformPath, -180, 180),
  }
}

const PROFILE_SUB_TEMPLATE_IDS = new Set([
  'cute_pink_1',
  'cute_pink_2',
  'cute_pink_3',
  'endfield_1',
  'endfield_2',
])

const PROFILE_LABEL_TYPES = new Set<GraphProfileLabelType>([
  'location',
  'job',
  'mbti',
  'expansion',
])

function defaultProfileSubTemplateId(
  templateId: GraphTemplateId,
): string | null {
  if (templateId === 'cute-pink') return 'cute_pink_2'
  if (templateId === 'endfield') return 'endfield_2'
  return null
}

function readProfileBoolean(
  profile: UnknownRecord,
  key: string,
  fallback: boolean,
  path: string,
): boolean {
  const value = profile[key]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    throw new GraphValidationError(path + '.' + key + ' 必须是布尔值')
  }
  return value
}

function readProfileColor(
  record: UnknownRecord,
  key: string,
  path: string,
  fallback: string,
): string {
  const value = record[key] ?? fallback
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new GraphValidationError(path + '.' + key + ' 必须是 #RRGGBB 颜色')
  }
  return value
}

function readProfileTextFontFamily(
  record: UnknownRecord,
  path: string,
): GraphProfileTextFontFamily {
  const value = record.fontFamily ?? 'sans'
  if (value === 'default' || value === 'source_han_sans_vf') return 'sans'
  if (value === 'source_han_rounded') return 'resource-rounded'
  if (value === 'alimama_fangyuanti') return 'alimama-fangyuan'
  if (
    value !== 'sans' &&
    value !== 'resource-rounded' &&
    value !== 'alimama-fangyuan'
  ) {
    throw new GraphValidationError(path + '.fontFamily 不是支持的资料文字字体')
  }
  return value
}

function readProfileSettings(
  record: UnknownRecord,
  templateId: GraphTemplateId,
): GraphProfileSettings {
  const defaults = createDefaultProfileSettings()
  if (record.profile === undefined) return defaults

  const path = 'document.profile'
  const profile = readRecord(record.profile, path)
  const legacyVisible = readProfileBoolean(profile, 'visible', false, path)
  const subTemplateValue = profile.subTemplateId
  let subTemplateId: string | null
  if (subTemplateValue === undefined) {
    subTemplateId = legacyVisible
      ? defaultProfileSubTemplateId(templateId)
      : defaults.subTemplateId
  } else if (subTemplateValue === null || subTemplateValue === '') {
    subTemplateId = null
  } else if (
    typeof subTemplateValue === 'string' &&
    PROFILE_SUB_TEMPLATE_IDS.has(subTemplateValue)
  ) {
    subTemplateId = subTemplateValue
  } else {
    throw new GraphValidationError(path + '.subTemplateId 不是支持的资料模板')
  }

  const nicknameValue = profile.nickname ?? defaults.nickname
  if (typeof nicknameValue !== 'string' || nicknameValue.length > 32) {
    throw new GraphValidationError(
      path + '.nickname 必须是不超过 32 字符的字符串',
    )
  }
  const nickname =
    nicknameValue.trim().slice(0, 12) || DEFAULT_PROFILE_SETTINGS.nickname

  const genderValue = profile.gender ?? defaults.gender
  const normalizedGender =
    genderValue === 'MALE'
      ? 'male'
      : genderValue === 'FEMALE'
        ? 'female'
        : genderValue === 'NONE'
          ? 'none'
          : genderValue
  if (
    normalizedGender !== 'none' &&
    normalizedGender !== 'male' &&
    normalizedGender !== 'female'
  ) {
    throw new GraphValidationError(path + '.gender 不是支持的性别选项')
  }

  let labels = defaults.labels
  if (profile.labels !== undefined) {
    if (!Array.isArray(profile.labels) || profile.labels.length > 4) {
      throw new GraphValidationError(path + '.labels 必须是不超过 4 项的数组')
    }
    const parsedLabels = profile.labels.map(
      (value, index): GraphProfileLabel => {
        const labelPath = path + '.labels[' + index + ']'
        const label = readRecord(value, labelPath)
        const typeValue = label.type
        const type =
          typeof typeValue === 'string'
            ? (typeValue.toLowerCase() as GraphProfileLabelType)
            : typeValue
        if (!PROFILE_LABEL_TYPES.has(type as GraphProfileLabelType)) {
          throw new GraphValidationError(labelPath + '.type 不是支持的标签类型')
        }
        const content = label.content ?? ''
        if (typeof content !== 'string' || content.length > 8) {
          throw new GraphValidationError(labelPath + '.content 不能超过 8 字符')
        }
        return {
          id: readString(label, 'id', labelPath),
          type: type as GraphProfileLabelType,
          content,
          maxLength:
            label.maxLength === undefined
              ? 8
              : readNumber(label, 'maxLength', labelPath, 1, 8),
        }
      },
    )
    labels = defaults.labels.map(
      (fallback) =>
        parsedLabels.find((label) => label.type === fallback.type) ?? fallback,
    )
  }

  const visibleLabelCount =
    profile.visibleLabelCount === undefined
      ? Math.min(4, labels.filter((label) => label.content.trim()).length)
      : readNumber(profile, 'visibleLabelCount', path, 0, 4)
  const textBlockContent = profile.textBlockContent ?? ''
  if (typeof textBlockContent !== 'string' || textBlockContent.length > 80) {
    throw new GraphValidationError(path + '.textBlockContent 不能超过 80 字符')
  }

  let customTexts: GraphProfileCustomText[] = []
  if (profile.customTexts !== undefined) {
    if (
      !Array.isArray(profile.customTexts) ||
      profile.customTexts.length > 32
    ) {
      throw new GraphValidationError(
        path + '.customTexts 必须是不超过 32 项的数组',
      )
    }
    customTexts = profile.customTexts.map(
      (value, index): GraphProfileCustomText => {
        const textPath = path + '.customTexts[' + index + ']'
        const customText = readRecord(value, textPath)
        const text = customText.text ?? ''
        if (typeof text !== 'string' || text.length > 100) {
          throw new GraphValidationError(textPath + '.text 不能超过 100 字符')
        }
        return {
          id: readString(customText, 'id', textPath),
          text,
          x: readNumber(customText, 'x', textPath, 0, 1),
          y: readNumber(customText, 'y', textPath, 0, 1),
          fontSize: readNumber(customText, 'fontSize', textPath, 10, 100),
          color: readProfileColor(customText, 'color', textPath, '#333333'),
          rotation: readNumber(customText, 'rotation', textPath, -180, 180),
          fontWeight: readNumber(customText, 'fontWeight', textPath, 100, 900),
          fontFamily: readProfileTextFontFamily(customText, textPath),
          maxWidth: readNumber(customText, 'maxWidth', textPath, 0.1, 1),
          maxHeight: readNumber(customText, 'maxHeight', textPath, 0.1, 1),
          visible: readProfileBoolean(customText, 'visible', true, textPath),
          strokeWidth: readNumber(customText, 'strokeWidth', textPath, 0, 10),
          strokeColor: readProfileColor(
            customText,
            'strokeColor',
            textPath,
            '#FFFFFF',
          ),
          roundness: readNumber(customText, 'roundness', textPath, 0, 1),
        }
      },
    )
  }

  const avatarValue = profile.avatarAssetId
  if (
    avatarValue !== undefined &&
    (typeof avatarValue !== 'string' || !avatarValue.trim())
  ) {
    throw new GraphValidationError(path + '.avatarAssetId 必须是非空字符串')
  }
  const avatarTransform = readImageTransform(profile, 'avatarTransform', path)

  return {
    subTemplateId,
    nickname,
    gender: normalizedGender,
    labels,
    avatarVisible: readProfileBoolean(
      profile,
      'avatarVisible',
      defaults.avatarVisible,
      path,
    ),
    nicknameVisible: readProfileBoolean(
      profile,
      'nicknameVisible',
      defaults.nicknameVisible,
      path,
    ),
    visibleLabelCount,
    textBlockContent,
    textBlockVisible: readProfileBoolean(
      profile,
      'textBlockVisible',
      defaults.textBlockVisible,
      path,
    ),
    customTexts,
    ...(typeof avatarValue === 'string' ? { avatarAssetId: avatarValue } : {}),
    ...(avatarTransform ? { avatarTransform } : {}),
  }
}

function readLayoutMode(record: UnknownRecord): GraphLayoutMode {
  const value = record.layoutMode
  if (value === undefined) {
    return 'packing'
  }
  if (value !== 'packing' && value !== 'gravity') {
    throw new GraphValidationError(
      'document.canvas.layoutMode 必须是 packing 或 gravity',
    )
  }
  return value
}

function readTemplateId(record: UnknownRecord): GraphTemplateId {
  const value = record.templateId
  if (value === undefined) return 'custom'
  if (value !== 'custom' && value !== 'cute-pink' && value !== 'endfield') {
    throw new GraphValidationError(
      'document.canvas.templateId 不是支持的本地模板',
    )
  }
  return value
}

function readContentBounds(record: UnknownRecord): GraphContentBounds {
  if (record.contentBounds === undefined) {
    return { ...DEFAULT_CONTENT_BOUNDS }
  }
  const bounds = readRecord(
    record.contentBounds,
    'document.canvas.contentBounds',
  )
  const left = readNumber(bounds, 'left', 'document.canvas.contentBounds', 0, 1)
  const top = readNumber(bounds, 'top', 'document.canvas.contentBounds', 0, 1)
  const right = readNumber(
    bounds,
    'right',
    'document.canvas.contentBounds',
    0,
    1,
  )
  const bottom = readNumber(
    bounds,
    'bottom',
    'document.canvas.contentBounds',
    0,
    1,
  )
  const rotation =
    bounds.rotation === undefined
      ? 0
      : readNumber(
          bounds,
          'rotation',
          'document.canvas.contentBounds',
          -180,
          180,
        )
  if (right - left < 0.2 || bottom - top < 0.2) {
    throw new GraphValidationError(
      'document.canvas.contentBounds 的宽度和高度不能小于 0.2',
    )
  }
  return { left, top, right, bottom, rotation }
}

function readLabelSettings(record: UnknownRecord): GraphLabelSettings {
  if (record.labelSettings === undefined) {
    return { ...DEFAULT_LABEL_SETTINGS }
  }
  const path = 'document.canvas.labelSettings'
  const settings = readRecord(record.labelSettings, path)
  const readBooleanSetting = (
    key: keyof GraphLabelSettings,
    fallback: boolean,
  ): boolean => {
    const value = settings[key]
    if (value === undefined) return fallback
    if (typeof value !== 'boolean') {
      throw new GraphValidationError(path + '.' + key + ' 必须是布尔值')
    }
    return value
  }
  const readNumberSetting = (
    key: keyof GraphLabelSettings,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number =>
    settings[key] === undefined
      ? fallback
      : readNumber(settings, key, path, minimum, maximum)
  const readColorSetting = (
    key: 'colorOverride' | 'textColorOverride',
  ): string | null => {
    const value = settings[key]
    if (value === undefined || value === null) return null
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
      throw new GraphValidationError(
        path + '.' + key + ' 必须是 null 或 #RRGGBB 颜色',
      )
    }
    return value
  }
  const fontFamilyValue = settings.fontFamily
  const fontFamily =
    fontFamilyValue === undefined
      ? DEFAULT_LABEL_SETTINGS.fontFamily
      : fontFamilyValue === 'rounded'
        ? 'resource-rounded'
        : fontFamilyValue === 'serif'
          ? 'sans'
          : fontFamilyValue
  if (
    fontFamily !== 'sans' &&
    fontFamily !== 'resource-rounded' &&
    fontFamily !== 'alimama-fangyuan' &&
    fontFamily !== 'local'
  ) {
    throw new GraphValidationError(
      path +
        '.fontFamily 必须是 sans、resource-rounded、alimama-fangyuan 或 local',
    )
  }
  const readNullableStringSetting = (
    key: 'localFontId' | 'localFontName',
  ): string | null => {
    const value = settings[key]
    if (value === undefined || value === null) return null
    if (typeof value !== 'string' || !value.trim() || value.length > 160) {
      throw new GraphValidationError(
        path + '.' + key + ' 必须是 null 或不超过 160 字符的非空字符串',
      )
    }
    return value
  }
  const localFontId = readNullableStringSetting('localFontId')
  const localFontName = readNullableStringSetting('localFontName')
  if (fontFamily === 'local' && (!localFontId || !localFontName)) {
    throw new GraphValidationError(
      path + ' 使用本地字体时必须包含字体 ID 和名称',
    )
  }

  return {
    showCategoryNodes: readBooleanSetting(
      'showCategoryNodes',
      DEFAULT_LABEL_SETTINGS.showCategoryNodes,
    ),
    showCategoryText: readBooleanSetting(
      'showCategoryText',
      DEFAULT_LABEL_SETTINGS.showCategoryText,
    ),
    showLabelText: readBooleanSetting(
      'showLabelText',
      DEFAULT_LABEL_SETTINGS.showLabelText,
    ),
    showImages: readBooleanSetting(
      'showImages',
      DEFAULT_LABEL_SETTINGS.showImages,
    ),
    categoryStrokeWidth: readNumberSetting(
      'categoryStrokeWidth',
      DEFAULT_LABEL_SETTINGS.categoryStrokeWidth,
      0,
      10,
    ),
    labelStrokeWidth: readNumberSetting(
      'labelStrokeWidth',
      DEFAULT_LABEL_SETTINGS.labelStrokeWidth,
      0,
      10,
    ),
    fillOpacity: readNumberSetting(
      'fillOpacity',
      DEFAULT_LABEL_SETTINGS.fillOpacity,
      0,
      1,
    ),
    fontFamily,
    fontWeight: readNumberSetting(
      'fontWeight',
      DEFAULT_LABEL_SETTINGS.fontWeight,
      300,
      900,
    ),
    fontRoundness: readNumberSetting(
      'fontRoundness',
      DEFAULT_LABEL_SETTINGS.fontRoundness,
      0,
      100,
    ),
    localFontId,
    localFontName,
    colorOverride: readColorSetting('colorOverride'),
    textColorOverride: readColorSetting('textColorOverride'),
  }
}

function readCategoryAppearance(
  record: UnknownRecord,
  path: string,
): GraphCategoryAppearance | undefined {
  if (record.appearance === undefined) return undefined
  const appearancePath = path + '.appearance'
  const source = readRecord(record.appearance, appearancePath)
  const appearance: GraphCategoryAppearance = {}
  const readOptionalBoolean = (
    key:
      | 'showCategoryImage'
      | 'showLabelImages'
      | 'showCategoryText'
      | 'showLabelText',
  ) => {
    const value = source[key]
    if (value === undefined) return
    if (typeof value !== 'boolean') {
      throw new GraphValidationError(
        appearancePath + '.' + key + ' 必须是布尔值',
      )
    }
    appearance[key] = value
  }
  readOptionalBoolean('showCategoryImage')
  readOptionalBoolean('showLabelImages')
  readOptionalBoolean('showCategoryText')
  readOptionalBoolean('showLabelText')

  const readOptionalNumber = (
    key:
      | 'fillFactor'
      | 'fontWeight'
      | 'fontRoundness'
      | 'categoryStrokeWidth'
      | 'labelStrokeWidth'
      | 'imageMaskOpacity',
    minimum: number,
    maximum: number,
  ) => {
    if (source[key] !== undefined) {
      appearance[key] = readNumber(
        source,
        key,
        appearancePath,
        minimum,
        maximum,
      )
    }
  }
  readOptionalNumber('fillFactor', 0.5, 1.5)
  readOptionalNumber('fontWeight', 300, 900)
  readOptionalNumber('fontRoundness', 0, 100)
  readOptionalNumber('categoryStrokeWidth', 0, 10)
  readOptionalNumber('labelStrokeWidth', 0, 10)
  readOptionalNumber('imageMaskOpacity', 0, 1)

  if (source.fontFamily !== undefined) {
    const value =
      source.fontFamily === 'source_han_rounded'
        ? 'resource-rounded'
        : source.fontFamily === 'alimama_fangyuanti'
          ? 'alimama-fangyuan'
          : source.fontFamily
    if (
      value !== 'sans' &&
      value !== 'resource-rounded' &&
      value !== 'alimama-fangyuan'
    ) {
      throw new GraphValidationError(
        appearancePath +
          '.fontFamily 必须是 sans、resource-rounded 或 alimama-fangyuan',
      )
    }
    appearance.fontFamily = value
  }

  if (source.textColorOverride !== undefined) {
    const value = source.textColorOverride
    if (
      value !== null &&
      (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
    ) {
      throw new GraphValidationError(
        appearancePath + '.textColorOverride 必须是 null 或 #RRGGBB 颜色',
      )
    }
    appearance.textColorOverride = value
  }

  if (source.imageMask !== undefined) {
    const value = source.imageMask
    if (
      value !== 'none' &&
      value !== 'black' &&
      value !== 'white' &&
      value !== 'category'
    ) {
      throw new GraphValidationError(
        appearancePath + '.imageMask 必须是 none、black、white 或 category',
      )
    }
    appearance.imageMask = value
  }
  return Object.keys(appearance).length > 0 ? appearance : undefined
}

function readNodeBase(record: UnknownRecord, path: string): GraphNodeBase {
  const imageAssetId = readImageAssetId(record, path)
  const imageTransform = readImageTransform(record, 'imageTransform', path)
  return {
    id: readString(record, 'id', path),
    name: readString(record, 'name', path),
    value: readNumber(record, 'value', path, 0, 1000),
    hidden: readHidden(record),
    ...(imageAssetId ? { imageAssetId } : {}),
    ...(imageTransform ? { imageTransform } : {}),
  }
}

function readDecorationSettings(
  record: UnknownRecord,
  customTextIds: readonly string[] = [],
): GraphDecorationSettings {
  if (record.decoration === undefined) {
    return createDefaultDecorationSettings()
  }
  const path = 'document.decoration'
  const decoration = readRecord(record.decoration, path)
  const templateVisible = decoration.templateBackgroundVisible
  if (templateVisible !== undefined && typeof templateVisible !== 'boolean') {
    throw new GraphValidationError(
      path + '.templateBackgroundVisible 必须是布尔值',
    )
  }
  const presetValues =
    decoration.presetIds === undefined
      ? []
      : readArray(decoration, 'presetIds', path)
  const allowedPresetIds = new Set<GraphDecorationPresetId>([
    'diary',
    'fox',
    'hosi',
    'nya-shop',
    'pp',
  ])
  const presetIds = presetValues.map((value, index) => {
    if (
      typeof value !== 'string' ||
      !allowedPresetIds.has(value as GraphDecorationPresetId)
    ) {
      throw new GraphValidationError(
        path + '.presetIds[' + index + '] 不是支持的装饰素材',
      )
    }
    return value as GraphDecorationPresetId
  })
  if (new Set(presetIds).size !== presetIds.length) {
    throw new GraphValidationError(path + '.presetIds 不能包含重复素材')
  }

  const readColor = (
    source: UnknownRecord,
    key: string,
    sourcePath: string,
  ) => {
    const color = readString(source, key, sourcePath)
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      throw new GraphValidationError(
        sourcePath + '.' + key + ' 必须是 #RRGGBB 颜色',
      )
    }
    return color
  }
  let pattern: GraphDecorationPattern | null = null
  if (decoration.pattern !== undefined && decoration.pattern !== null) {
    const patternPath = path + '.pattern'
    const source = readRecord(decoration.pattern, patternPath)
    if (typeof source.visible !== 'boolean') {
      throw new GraphValidationError(patternPath + '.visible 必须是布尔值')
    }
    if (
      source.type !== 'checker' &&
      source.type !== 'dots' &&
      source.type !== 'grid'
    ) {
      throw new GraphValidationError(patternPath + '.type 无效')
    }
    pattern = {
      visible: source.visible,
      type: source.type,
      foregroundColor: readColor(source, 'foregroundColor', patternPath),
      backgroundColor: readColor(source, 'backgroundColor', patternPath),
      size: readNumber(source, 'size', patternPath, 10, 100),
      rotation: readNumber(source, 'rotation', patternPath, 0, 180),
      weight: readNumber(source, 'weight', patternPath, 0.1, 1),
    }
  }
  const readFrame = (
    source: UnknownRecord,
    framePath: string,
  ): GraphDecorationFrame => {
    if (typeof source.visible !== 'boolean') {
      throw new GraphValidationError(framePath + '.visible 必须是布尔值')
    }
    return {
      visible: source.visible,
      width: readNumber(source, 'width', framePath, 0.1, 1),
      height: readNumber(source, 'height', framePath, 0.1, 1),
      x: readNumber(source, 'x', framePath, 0, 1),
      y: readNumber(source, 'y', framePath, 0, 1),
      cornerRadius: readNumber(source, 'cornerRadius', framePath, 0, 100),
      fillColor: readColor(source, 'fillColor', framePath),
      strokeWidth: readNumber(source, 'strokeWidth', framePath, 0, 20),
      strokeColor: readColor(source, 'strokeColor', framePath),
      rotation: readNumber(source, 'rotation', framePath, -90, 90),
    }
  }
  const frameValues =
    decoration.frames === undefined ? [] : readArray(decoration, 'frames', path)
  if (frameValues.length > 20) {
    throw new GraphValidationError(path + '.frames 最多包含 20 个矩形')
  }
  const seenFrameIds = new Set<string>()
  const frames = frameValues.map(
    (value, index): GraphDecorationFrameElement => {
      const framePath = path + '.frames[' + index + ']'
      const source = readRecord(value, framePath)
      const id = readString(source, 'id', framePath)
      if (seenFrameIds.has(id)) {
        throw new GraphValidationError(framePath + '.id 与其他矩形重复')
      }
      seenFrameIds.add(id)
      return {
        id,
        name: readString(source, 'name', framePath),
        ...readFrame(source, framePath),
      }
    },
  )
  const imageValues =
    decoration.images === undefined ? [] : readArray(decoration, 'images', path)
  if (imageValues.length > 20) {
    throw new GraphValidationError(path + '.images 最多包含 20 张图片')
  }
  const seenImageIds = new Set<string>()
  const images = imageValues.map((value, index): GraphDecorationImage => {
    const imagePath = path + '.images[' + index + ']'
    const source = readRecord(value, imagePath)
    const id = readString(source, 'id', imagePath)
    if (seenImageIds.has(id)) {
      throw new GraphValidationError(imagePath + '.id 与其他装饰图片重复')
    }
    seenImageIds.add(id)
    const assetId = readImageAssetId(
      { imageAssetId: source.assetId },
      imagePath,
    )
    if (!assetId) {
      throw new GraphValidationError(imagePath + '.assetId 必须是非空字符串')
    }
    if (typeof source.visible !== 'boolean') {
      throw new GraphValidationError(imagePath + '.visible 必须是布尔值')
    }
    return {
      id,
      name: readString(source, 'name', imagePath),
      assetId,
      visible: source.visible,
      x: readNumber(source, 'x', imagePath, 0, 1),
      y: readNumber(source, 'y', imagePath, 0, 1),
      size: readNumber(source, 'size', imagePath, 0.05, 1.5),
      rotation: readNumber(source, 'rotation', imagePath, -180, 180),
      opacity: readNumber(source, 'opacity', imagePath, 0, 1),
    }
  })
  const readLayerIds = (key: 'layerOrder' | 'hiddenLayerIds'): string[] => {
    if (decoration[key] === undefined) return []
    const values = readArray(decoration, key, path).map((value, index) => {
      if (typeof value !== 'string' || !value.trim()) {
        throw new GraphValidationError(
          path + '.' + key + '[' + index + '] 必须是非空字符串',
        )
      }
      return value
    })
    if (new Set(values).size !== values.length) {
      throw new GraphValidationError(path + '.' + key + ' 不能包含重复项')
    }
    return values
  }
  const layerOrder = readLayerIds('layerOrder')
  const draft: GraphDecorationSettings = {
    templateBackgroundVisible:
      typeof templateVisible === 'boolean'
        ? templateVisible
        : DEFAULT_DECORATION_SETTINGS.templateBackgroundVisible,
    presetIds,
    pattern,
    frames,
    images,
    layerOrder,
    hiddenLayerIds: readLayerIds('hiddenLayerIds'),
  }
  const resolvedOrder = resolveDecorationLayerOrder(draft, customTextIds)
  return {
    ...draft,
    layerOrder: resolvedOrder,
    hiddenLayerIds: draft.hiddenLayerIds.filter((id) =>
      resolvedOrder.includes(id),
    ),
  }
}

function readArray(
  record: UnknownRecord,
  key: string,
  path: string,
): unknown[] {
  const value = record[key]
  if (!Array.isArray(value)) {
    throw new GraphValidationError(`${path}.${key} 必须是数组`)
  }
  return value
}

export function parseGraphDocument(input: unknown): GraphDocument {
  const record = readRecord(input, 'document')
  if (record.schemaVersion !== GRAPH_SCHEMA_VERSION) {
    throw new GraphValidationError(
      `不支持的数据版本：${String(record.schemaVersion)}`,
    )
  }

  const canvasRecord = readRecord(record.canvas, 'document.canvas')
  const backgroundColor = readString(
    canvasRecord,
    'backgroundColor',
    'document.canvas',
  )
  if (!/^#[0-9a-f]{6}$/i.test(backgroundColor)) {
    throw new GraphValidationError(
      'document.canvas.backgroundColor 必须是 #RRGGBB 颜色',
    )
  }

  const seenIds = new Set<string>()
  const registerId = (id: string, path: string) => {
    if (seenIds.has(id)) {
      throw new GraphValidationError(`${path}.id 与其他节点重复`)
    }
    seenIds.add(id)
  }

  const categories = readArray(record, 'categories', 'document').map(
    (categoryValue, categoryIndex): GraphCategory => {
      const path = `document.categories[${categoryIndex}]`
      const categoryRecord = readRecord(categoryValue, path)
      const base = readNodeBase(categoryRecord, path)
      registerId(base.id, path)
      const color = readString(categoryRecord, 'color', path)
      if (!/^#[0-9a-f]{6}$/i.test(color)) {
        throw new GraphValidationError(`${path}.color 必须是 #RRGGBB 颜色`)
      }

      const attributes = readArray(categoryRecord, 'attributes', path).map(
        (attributeValue, attributeIndex): GraphAttribute => {
          const attributePath = `${path}.attributes[${attributeIndex}]`
          const attributeRecord = readRecord(attributeValue, attributePath)
          const attributeBase = readNodeBase(attributeRecord, attributePath)
          registerId(attributeBase.id, attributePath)

          const children = readArray(
            attributeRecord,
            'children',
            attributePath,
          ).map((childValue, childIndex): GraphSubAttribute => {
            const childPath = `${attributePath}.children[${childIndex}]`
            const childRecord = readRecord(childValue, childPath)
            const child = readNodeBase(childRecord, childPath)
            registerId(child.id, childPath)
            return child
          })

          return { ...attributeBase, children }
        },
      )

      const appearance = readCategoryAppearance(categoryRecord, path)
      return {
        ...base,
        color,
        ...(appearance ? { appearance } : {}),
        attributes,
      }
    },
  )

  const id = readString(record, 'id', 'document')
  registerId(id, 'document')
  const templateId = readTemplateId(canvasRecord)

  const profile = readProfileSettings(record, templateId)
  const decoration = readDecorationSettings(
    record,
    profile.customTexts.map((text) => text.id),
  )
  const resolvedLayerOrder = resolveDecorationLayerOrder(
    decoration,
    profile.customTexts.map((text) => text.id),
  )
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    id,
    name: readString(record, 'name', 'document'),
    createdAt: readString(record, 'createdAt', 'document'),
    updatedAt: readString(record, 'updatedAt', 'document'),
    canvas: {
      width: readNumber(canvasRecord, 'width', 'document.canvas', 320, 4096),
      height: readNumber(canvasRecord, 'height', 'document.canvas', 320, 4096),
      backgroundColor,
      layoutMode: readLayoutMode(canvasRecord),
      templateId,
      contentBounds: readContentBounds(canvasRecord),
      labelSettings: readLabelSettings(canvasRecord),
    },
    profile,
    decoration: {
      ...decoration,
      layerOrder: resolvedLayerOrder,
      hiddenLayerIds: decoration.hiddenLayerIds.filter((id) =>
        resolvedLayerOrder.includes(id),
      ),
    },
    categories,
  }
}
