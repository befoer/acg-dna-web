import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CONTENT_BOUNDS,
  DEFAULT_LABEL_SETTINGS,
  GRAPH_SCHEMA_VERSION,
  GraphValidationError,
  createStarterGraph,
  findGraphNode,
  parseGraphDocument,
} from './graph'

describe('graph document schema', () => {
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

    const invalidRoundness = createStarterGraph('2026-07-15T00:00:00.000Z')
    invalidRoundness.canvas.labelSettings.fontRoundness = 101
    expect(() => parseGraphDocument(invalidRoundness)).toThrow(/fontRoundness/)

    invalidRoundness.canvas.labelSettings.fontRoundness = -1
    expect(() => parseGraphDocument(invalidRoundness)).toThrow(/fontRoundness/)
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
    delete (
      rounded.canvas.labelSettings as Partial<
        typeof rounded.canvas.labelSettings
      >
    ).fontRoundness
    const migrated = parseGraphDocument(rounded).canvas.labelSettings
    expect(migrated.fontFamily).toBe('resource-rounded')
    expect(migrated.fontRoundness).toBe(0)

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
