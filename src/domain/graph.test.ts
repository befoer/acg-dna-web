import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CONTENT_BOUNDS,
  DEFAULT_DECORATION_FRAME,
  DEFAULT_DECORATION_PATTERN,
  DEFAULT_DECORATION_SETTINGS,
  DEFAULT_LABEL_SETTINGS,
  DEFAULT_PROFILE_SETTINGS,
  DECORATION_DATA_LAYER_ID,
  GRAPH_SCHEMA_VERSION,
  GraphValidationError,
  createAppStarterGraph,
  createStarterGraph,
  decorationCustomTextLayerId,
  decorationFrameLayerId,
  decorationImageLayerId,
  decorationPresetLayerId,
  findGraphNode,
  parseGraphDocument,
  resolveCategoryAppearance,
  resolveDecorationLayerOrder,
} from './graph'

describe('graph document schema', () => {
  it('creates the APP default animation, character, and game circles without children', () => {
    const document = createAppStarterGraph('2026-07-22T00:00:00.000Z')

    expect(document.categories.map((category) => category.name)).toEqual([
      '动画',
      '角色',
      '游戏',
    ])
    expect(
      document.categories.every((category) => category.attributes.length === 0),
    ).toBe(true)
    expect(document.canvas.labelSettings).toMatchObject({
      colorOverride: '#000000',
      textColorOverride: '#EBEBEB',
    })
  })

  it('round-trips a schema v1 document', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')
    const parsed = parseGraphDocument(JSON.parse(JSON.stringify(document)))

    expect(parsed).toEqual(document)
    expect(parsed.schemaVersion).toBe(GRAPH_SCHEMA_VERSION)
  })

  it('uses the full canvas as the classic template label range', () => {
    expect(createStarterGraph().canvas.contentBounds).toEqual({
      left: 0,
      top: 0,
      right: 1,
      bottom: 1,
      rotation: 0,
    })
  })

  it('defaults older schema v1 documents to the original packing layout', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    const canvas = input.canvas as Partial<typeof input.canvas>
    delete canvas.layoutMode

    expect(parseGraphDocument(input).canvas.layoutMode).toBe('packing')
  })

  it('defaults older schema v1 documents to classic canvas settings', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    const canvas = input.canvas as Partial<typeof input.canvas>
    delete canvas.templateId
    delete canvas.contentBounds
    delete canvas.labelSettings

    expect(parseGraphDocument(input).canvas).toMatchObject({
      templateId: 'custom',
      contentBounds: DEFAULT_CONTENT_BOUNDS,
      labelSettings: DEFAULT_LABEL_SETTINGS,
    })
  })

  it('defaults older schema v1 documents to an unselected local profile', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    delete (input as Partial<typeof input>).profile

    expect(parseGraphDocument(input).profile).toEqual(DEFAULT_PROFILE_SETTINGS)
  })

  it('defaults older schema v1 documents to no local background decoration', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    delete (input as Partial<typeof input>).decoration

    expect(parseGraphDocument(input).decoration).toEqual(
      DEFAULT_DECORATION_SETTINGS,
    )
  })

  it('round-trips and validates decoration settings', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    input.decoration = {
      ...DEFAULT_DECORATION_SETTINGS,
      templateBackgroundVisible: false,
      presetIds: ['diary', 'fox', 'pp'],
      pattern: {
        visible: true,
        type: 'grid',
        foregroundColor: '#112233',
        backgroundColor: '#AABBCC',
        size: 42,
        rotation: 30,
        weight: 0.6,
      },
      frames: [
        {
          id: 'frame-one',
          name: '矩形1',
          visible: true,
          width: 0.7,
          height: 0.6,
          x: 0.45,
          y: 0.55,
          cornerRadius: 24,
          fillColor: '#FFFFFF',
          strokeWidth: 8,
          strokeColor: '#74BFE4',
          rotation: -12,
        },
      ],
      images: [
        {
          id: 'decoration-image-one',
          name: '贴纸.png',
          assetId: 'asset-decoration-image',
          visible: true,
          x: 0.6,
          y: 0.3,
          size: 0.4,
          rotation: 18,
          opacity: 0.75,
        },
      ],
    }

    expect(
      parseGraphDocument(JSON.parse(JSON.stringify(input))).decoration,
    ).toEqual({
      ...input.decoration,
      layerOrder: resolveDecorationLayerOrder(input.decoration),
    })

    input.decoration.presetIds = ['fox', 'fox']
    expect(() => parseGraphDocument(input)).toThrow(/重复素材/)

    input.decoration.presetIds = []
    input.decoration.images[0]!.size = 2
    expect(() => parseGraphDocument(input)).toThrow(/images\[0\]\.size/)
  })

  it('resolves one stable top-to-bottom order for every active layer', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    input.decoration.presetIds = ['fox', 'pp']
    input.decoration.pattern = { ...DEFAULT_DECORATION_PATTERN }
    input.decoration.frames = [
      {
        id: 'frame-one',
        name: '矩形1',
        ...DEFAULT_DECORATION_FRAME,
      },
    ]
    input.decoration.images = [
      {
        id: 'image-one',
        name: '图片1',
        assetId: 'asset-one',
        visible: true,
        x: 0.5,
        y: 0.5,
        size: 0.4,
        rotation: 0,
        opacity: 1,
      },
    ]
    input.decoration.layerOrder = [
      decorationPresetLayerId('pp'),
      decorationImageLayerId('image-one'),
      DECORATION_DATA_LAYER_ID,
    ]

    expect(resolveDecorationLayerOrder(input.decoration)).toEqual([
      decorationPresetLayerId('pp'),
      decorationImageLayerId('image-one'),
      DECORATION_DATA_LAYER_ID,
      decorationPresetLayerId('fox'),
      decorationFrameLayerId('frame-one'),
      'pattern',
    ])
  })

  it('keeps custom profile text in the shared layer order', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    input.decoration.layerOrder = [DECORATION_DATA_LAYER_ID]

    expect(
      resolveDecorationLayerOrder(input.decoration, ['text-one', 'text-two']),
    ).toEqual([
      decorationCustomTextLayerId('text-one'),
      decorationCustomTextLayerId('text-two'),
      DECORATION_DATA_LAYER_ID,
    ])
  })

  it('round-trips custom text layer order and visibility', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    input.profile.customTexts = [
      {
        id: 'text-one',
        text: '测试文字',
        x: 0.2,
        y: 0.2,
        fontSize: 24,
        color: '#000000',
        rotation: 0,
        fontWeight: 500,
        fontFamily: 'sans',
        maxWidth: 0.5,
        maxHeight: 0.5,
        visible: true,
        strokeWidth: 0,
        strokeColor: '#ffffff',
      },
    ]
    const textLayerId = decorationCustomTextLayerId('text-one')
    input.decoration.layerOrder = [DECORATION_DATA_LAYER_ID, textLayerId]
    input.decoration.hiddenLayerIds = [textLayerId]

    const parsed = parseGraphDocument(JSON.parse(JSON.stringify(input)))
    expect(parsed.decoration.layerOrder).toEqual(input.decoration.layerOrder)
    expect(parsed.decoration.hiddenLayerIds).toEqual([textLayerId])
  })

  it('validates the APP-compatible local profile settings', () => {
    const invalid = createStarterGraph('2026-07-15T00:00:00.000Z')
    ;(
      invalid.profile as unknown as {
        subTemplateId: string
      }
    ).subTemplateId = 'unknown'
    expect(() => parseGraphDocument(invalid)).toThrow(/subTemplateId/)

    invalid.profile.subTemplateId = null
    invalid.profile.nickname = '超'.repeat(33)
    expect(() => parseGraphDocument(invalid)).toThrow(/nickname/)
  })

  it('migrates the previous simple profile card without changing schema', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    input.canvas.templateId = 'cute-pink'
    ;(input as unknown as { profile: unknown }).profile = {
      visible: true,
      nickname: '本地作者',
      position: 'bottom-left',
    }

    expect(parseGraphDocument(input).profile).toMatchObject({
      subTemplateId: 'cute_pink_2',
      nickname: '本地作者',
      gender: 'none',
      visibleLabelCount: 0,
    })
  })

  it('round-trips optional node and avatar image transforms', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    input.categories[0]!.attributes[0]!.imageTransform = {
      zoom: 1.8,
      offsetX: 0.3,
      offsetY: -0.2,
      rotation: 45,
    }
    input.profile.avatarTransform = {
      zoom: 2,
      offsetX: -0.4,
      offsetY: 0.1,
      rotation: -90,
    }

    const parsed = parseGraphDocument(JSON.parse(JSON.stringify(input)))
    expect(parsed.categories[0]!.attributes[0]!.imageTransform).toEqual(
      input.categories[0]!.attributes[0]!.imageTransform,
    )
    expect(parsed.profile.avatarTransform).toEqual(
      input.profile.avatarTransform,
    )
  })

  it('rejects image transforms outside the editor range', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    input.categories[0]!.imageTransform = {
      zoom: 5,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    }

    expect(() => parseGraphDocument(input)).toThrow(/imageTransform.zoom/)
  })

  it('rejects unknown layout modes', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    ;(input.canvas as { layoutMode: string }).layoutMode = 'orbit'

    expect(() => parseGraphDocument(input)).toThrow(/layoutMode/)
  })

  it('rejects unknown templates and invalid content bounds', () => {
    const unknownTemplate = createStarterGraph('2026-07-15T00:00:00.000Z')
    ;(unknownTemplate.canvas as { templateId: string }).templateId = 'remote'
    expect(() => parseGraphDocument(unknownTemplate)).toThrow(/templateId/)

    const tooNarrow = createStarterGraph('2026-07-15T00:00:00.000Z')
    tooNarrow.canvas.contentBounds = {
      left: 0.1,
      top: 0.1,
      right: 0.25,
      bottom: 0.9,
      rotation: 0,
    }
    expect(() => parseGraphDocument(tooNarrow)).toThrow(/宽度和高度/)
  })

  it('rejects invalid global label settings', () => {
    const invalidToggle = createStarterGraph('2026-07-15T00:00:00.000Z')
    ;(
      invalidToggle.canvas.labelSettings as unknown as {
        showImages: string
      }
    ).showImages = 'yes'
    expect(() => parseGraphDocument(invalidToggle)).toThrow(/showImages/)

    const invalidColor = createStarterGraph('2026-07-15T00:00:00.000Z')
    invalidColor.canvas.labelSettings.textColorOverride = 'red'
    expect(() => parseGraphDocument(invalidColor)).toThrow(/textColorOverride/)
  })

  it('round-trips category appearance overrides and resolves global fallbacks', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    input.categories[0]!.appearance = {
      showLabelImages: false,
      fillFactor: 1.25,
      fontFamily: 'resource-rounded',
      fontWeight: 700,
      textColorOverride: '#F0F0F0',
      imageMask: 'category',
      imageMaskOpacity: 0.4,
    }
    const parsed = parseGraphDocument(JSON.parse(JSON.stringify(input)))
    const resolved = resolveCategoryAppearance(
      parsed.categories[0]!,
      parsed.canvas.labelSettings,
    )

    expect(parsed.categories[0]!.appearance).toEqual(
      input.categories[0]!.appearance,
    )
    expect(resolved).toMatchObject({
      showCategoryImage: true,
      showLabelImages: false,
      showCategoryText: true,
      fillFactor: 1.25,
      fontFamily: 'resource-rounded',
      imageMask: 'category',
    })
  })

  it('rejects invalid category appearance values', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    input.categories[0]!.appearance = { imageMask: 'none' }
    ;(
      input.categories[0]!.appearance as unknown as {
        imageMask: string
      }
    ).imageMask = 'rainbow'

    expect(() => parseGraphDocument(input)).toThrow(/imageMask/)
  })

  it('migrates legacy font choices and validates local font references', () => {
    const rounded = createStarterGraph('2026-07-15T00:00:00.000Z')
    ;(
      rounded.canvas.labelSettings as unknown as {
        fontFamily: string
        localFontId?: string | null
        localFontName?: string | null
      }
    ).fontFamily = 'rounded'
    delete (
      rounded.canvas.labelSettings as Partial<
        typeof rounded.canvas.labelSettings
      >
    ).localFontId
    delete (
      rounded.canvas.labelSettings as Partial<
        typeof rounded.canvas.labelSettings
      >
    ).localFontName
    const migrated = parseGraphDocument(rounded).canvas.labelSettings
    expect(migrated.fontFamily).toBe('resource-rounded')

    const missingLocalFont = createStarterGraph('2026-07-15T00:00:00.000Z')
    missingLocalFont.canvas.labelSettings.fontFamily = 'local'
    expect(() => parseGraphDocument(missingLocalFont)).toThrow(/字体 ID 和名称/)
  })

  it('rejects unsupported schema versions', () => {
    const input = {
      ...createStarterGraph('2026-07-15T00:00:00.000Z'),
      schemaVersion: 2,
    }

    expect(() => parseGraphDocument(input)).toThrow(GraphValidationError)
  })

  it('rejects duplicate node ids', () => {
    const input = createStarterGraph('2026-07-15T00:00:00.000Z')
    input.categories[1]!.id = input.categories[0]!.id

    expect(() => parseGraphDocument(input)).toThrow(/重复/)
  })

  it('finds all three node levels', () => {
    const document = createStarterGraph('2026-07-15T00:00:00.000Z')

    expect(findGraphNode(document, 'category-animation')?.kind).toBe('category')
    expect(findGraphNode(document, 'attribute-story')?.kind).toBe('attribute')
    expect(findGraphNode(document, 'sub-world')?.kind).toBe('subAttribute')
    expect(findGraphNode(document, 'missing')).toBeUndefined()
  })
})
