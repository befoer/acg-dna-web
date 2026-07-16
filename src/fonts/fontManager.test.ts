import { IDBFactory } from 'fake-indexeddb'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_LABEL_SETTINGS } from '../domain/graph'

const originalFontFace = globalThis.FontFace
const originalStructuredClone = globalThis.structuredClone
const originalDocumentFonts = Object.getOwnPropertyDescriptor(document, 'fonts')

interface FontFaceCall {
  family: string
  source: string | ArrayBuffer
  descriptors?: FontFaceDescriptors
}

let fontFaceCalls: FontFaceCall[] = []
let addedFaces: FontFace[] = []
let deletedFaces: FontFace[] = []

class MockFontFace {
  family: string
  source: string | ArrayBuffer
  descriptors?: FontFaceDescriptors

  constructor(
    family: string,
    source: string | ArrayBuffer,
    descriptors?: FontFaceDescriptors,
  ) {
    this.family = family
    this.source = source
    this.descriptors = descriptors
    fontFaceCalls.push({ family, source, descriptors })
  }

  async load(): Promise<FontFace> {
    return this as unknown as FontFace
  }
}

function validTrueTypeFile(name = 'test-font.ttf'): File {
  return new File(
    [new Uint8Array([0x00, 0x01, 0x00, 0x00, 1, 2, 3, 4])],
    name,
    {
      type: 'font/ttf',
    },
  )
}

beforeEach(() => {
  vi.resetModules()
  fontFaceCalls = []
  addedFaces = []
  deletedFaces = []
  globalThis.indexedDB = new IDBFactory()
  Object.defineProperty(globalThis, 'FontFace', {
    configurable: true,
    value: MockFontFace,
    writable: true,
  })
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      add: (face: FontFace) => {
        addedFaces.push(face)
      },
      delete: (face: FontFace) => {
        deletedFaces.push(face)
        return true
      },
    },
  })
  Object.defineProperty(globalThis, 'structuredClone', {
    configurable: true,
    value: <T>(value: T): T => value,
    writable: true,
  })
})

afterAll(() => {
  if (originalFontFace) {
    globalThis.FontFace = originalFontFace
  } else {
    Reflect.deleteProperty(globalThis, 'FontFace')
  }
  if (originalStructuredClone) {
    globalThis.structuredClone = originalStructuredClone
  } else {
    Reflect.deleteProperty(globalThis, 'structuredClone')
  }
  if (originalDocumentFonts) {
    Object.defineProperty(document, 'fonts', originalDocumentFonts)
  } else {
    Reflect.deleteProperty(document, 'fonts')
  }
})

describe('graph font manager', () => {
  it('registers a valid local font and persists it in IndexedDB', async () => {
    const { registerLocalFont } = await import('./fontManager')
    const { loadStoredLocalFont } = await import('./fontStorage')

    const registered = await registerLocalFont(validTrueTypeFile('圆体.ttf'))
    const stored = await loadStoredLocalFont(registered.id)

    expect(registered).toMatchObject({ name: '圆体.ttf', persisted: true })
    expect(stored).toMatchObject({
      id: registered.id,
      name: '圆体.ttf',
      byteLength: 8,
      mimeType: 'font/ttf',
    })
    expect(fontFaceCalls).toHaveLength(1)
    expect(fontFaceCalls[0]?.source).toBeInstanceOf(ArrayBuffer)
    expect(addedFaces).toHaveLength(1)
  })

  it('rejects invalid and oversized local font files', async () => {
    const { MAX_LOCAL_FONT_BYTES, registerLocalFont } =
      await import('./fontManager')
    const invalid = new File([new Uint8Array([1, 2, 3, 4])], 'not-font.ttf')
    const oversized = {
      name: 'huge.woff2',
      size: MAX_LOCAL_FONT_BYTES + 1,
      type: 'font/woff2',
    } as File

    await expect(registerLocalFont(invalid)).rejects.toThrow(/有效的/)
    await expect(registerLocalFont(oversized)).rejects.toThrow(/20 MB/)
    expect(fontFaceCalls).toHaveLength(0)
  })

  it('loads the same built-in font only once', async () => {
    const { ensureGraphFontLoaded } = await import('./fontManager')
    const settings = {
      ...DEFAULT_LABEL_SETTINGS,
      fontFamily: 'resource-rounded' as const,
      fontWeight: 700,
    }

    await Promise.all([
      ensureGraphFontLoaded(settings),
      ensureGraphFontLoaded(settings),
    ])

    expect(fontFaceCalls).toHaveLength(1)
    expect(fontFaceCalls[0]).toMatchObject({
      family: 'ACGDNA Resource Han Rounded',
      descriptors: { display: 'swap', weight: '700' },
    })
    expect(addedFaces).toHaveLength(1)
  })

  it('reloads the Alimama face when its roundness axis changes', async () => {
    const { ensureGraphFontLoaded, getGraphFontCssFamily } =
      await import('./fontManager')
    const settings = {
      ...DEFAULT_LABEL_SETTINGS,
      fontFamily: 'alimama-fangyuan' as const,
      fontWeight: 700,
      fontRoundness: 42,
    }

    await ensureGraphFontLoaded(settings)
    await ensureGraphFontLoaded(settings)
    await ensureGraphFontLoaded({ ...settings, fontRoundness: 80 })

    expect(fontFaceCalls).toHaveLength(2)
    expect(fontFaceCalls[0]?.family).toContain('w700-r40')
    expect(fontFaceCalls[0]?.descriptors?.variationSettings).toBe(
      '"wght" 700, "BEVL" 40.6',
    )
    expect(fontFaceCalls[1]?.family).toContain('w700-r80')
    expect(fontFaceCalls[1]?.descriptors?.variationSettings).toBe(
      '"wght" 700, "BEVL" 80.2',
    )
    expect(getGraphFontCssFamily(settings)).toContain('w700-r40')
    expect(getGraphFontCssFamily({ ...settings, fontRoundness: 80 })).toContain(
      'w700-r80',
    )
    expect(addedFaces).toHaveLength(2)
    expect(deletedFaces).toHaveLength(0)
  })

  it('keeps at most 24 Alimama font instances like the app cache', async () => {
    const { ensureGraphFontLoaded } = await import('./fontManager')
    const base = {
      ...DEFAULT_LABEL_SETTINGS,
      fontFamily: 'alimama-fangyuan' as const,
      fontWeight: 700,
    }

    for (let roundness = 0; roundness <= 100; roundness += 5) {
      await ensureGraphFontLoaded({ ...base, fontRoundness: roundness })
    }
    for (const fontWeight of [200, 300, 400, 500]) {
      await ensureGraphFontLoaded({ ...base, fontWeight, fontRoundness: 0 })
    }

    expect(fontFaceCalls).toHaveLength(25)
    expect(addedFaces).toHaveLength(25)
    expect(deletedFaces).toHaveLength(1)
  })

  it('restores a local font from IndexedDB in a new module session', async () => {
    const firstManager = await import('./fontManager')
    const registered = await firstManager.registerLocalFont(
      validTrueTypeFile('恢复字体.ttf'),
    )

    vi.resetModules()
    fontFaceCalls = []
    addedFaces = []
    const secondManager = await import('./fontManager')
    await secondManager.ensureGraphFontLoaded({
      ...DEFAULT_LABEL_SETTINGS,
      fontFamily: 'local',
      localFontId: registered.id,
      localFontName: registered.name,
    })

    expect(fontFaceCalls).toHaveLength(1)
    expect(fontFaceCalls[0]?.family).toContain(registered.id)
    expect(addedFaces).toHaveLength(1)
  })
})
