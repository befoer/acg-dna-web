export const GRAPH_SCHEMA_VERSION = 1 as const

export type GraphSchemaVersion = typeof GRAPH_SCHEMA_VERSION
export type GraphNodeKind = 'category' | 'attribute' | 'subAttribute'
export type GraphLayoutMode = 'packing' | 'gravity'
export type GraphTemplateId = 'custom' | 'cute-pink' | 'endfield'
export type GraphLabelFontFamily =
  'sans' | 'resource-rounded' | 'alimama-fangyuan' | 'local'
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

export const DEFAULT_CONTENT_BOUNDS: GraphContentBounds = {
  left: 0,
  top: 0,
  right: 1,
  bottom: 1,
  rotation: 0,
}

export interface GraphLabelSettings {
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
}

export type GraphSubAttribute = GraphNodeBase

export interface GraphAttribute extends GraphNodeBase {
  children: GraphSubAttribute[]
}

export interface GraphCategory extends GraphNodeBase {
  color: string
  attributes: GraphAttribute[]
}

export interface GraphDocument {
  schemaVersion: GraphSchemaVersion
  id: string
  name: string
  createdAt: string
  updatedAt: string
  canvas: GraphCanvasSettings
  profile: GraphProfileSettings
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

function readNodeBase(record: UnknownRecord, path: string): GraphNodeBase {
  const imageAssetId = readImageAssetId(record, path)
  return {
    id: readString(record, 'id', path),
    name: readString(record, 'name', path),
    value: readNumber(record, 'value', path, 0, 1000),
    hidden: readHidden(record),
    ...(imageAssetId ? { imageAssetId } : {}),
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

      return { ...base, color, attributes }
    },
  )

  const id = readString(record, 'id', 'document')
  registerId(id, 'document')
  const templateId = readTemplateId(canvasRecord)

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
    profile: readProfileSettings(record, templateId),
    categories,
  }
}
