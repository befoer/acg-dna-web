import resourceHanRoundedUrl from '../assets/fonts/resource-han-rounded-bold.woff2'
import {
  createEntityId,
  type GraphLabelSettings,
  type GraphProfileSettings,
  type GraphProfileTextFontFamily,
} from '../domain/graph'
import {
  loadStoredLocalFont,
  saveStoredLocalFont,
  type StoredLocalFont,
} from './fontStorage'

export const MAX_LOCAL_FONT_BYTES = 20 * 1024 * 1024

export const RESOURCE_ROUNDED_FAMILY = 'ACGDNA Resource Han Rounded'
const loadedFontPromises = new Map<string, Promise<void>>()
const sessionLocalFonts = new Map<string, StoredLocalFont>()

export interface RegisteredLocalFont {
  id: string
  name: string
  persisted: boolean
}

export class GraphFontError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GraphFontError'
  }
}

function localFontFamily(fontId: string): string {
  return 'ACGDNA Local ' + fontId.replace(/[^a-z0-9_-]/gi, '_')
}

function quotedFamily(family: string): string {
  return '"' + family.replaceAll('"', '') + '"'
}

export function getGraphFontCssFamily(settings: GraphLabelSettings): string {
  switch (settings.fontFamily) {
    case 'resource-rounded':
      return (
        quotedFamily(RESOURCE_ROUNDED_FAMILY) +
        ', ui-rounded, system-ui, sans-serif'
      )
    case 'local':
      return settings.localFontId
        ? quotedFamily(localFontFamily(settings.localFontId)) +
            ', system-ui, sans-serif'
        : 'system-ui, sans-serif'
    case 'sans':
      return 'Inter, "Noto Sans SC", system-ui, sans-serif'
  }
}

export function getProfileTextFontCssFamily(
  fontFamily: GraphProfileTextFontFamily,
): string {
  if (fontFamily === 'resource-rounded') {
    return (
      quotedFamily(RESOURCE_ROUNDED_FAMILY) +
      ', ui-rounded, system-ui, sans-serif'
    )
  }
  return 'Inter, "Noto Sans SC", system-ui, sans-serif'
}

function ensureFontApi(): FontFaceSet {
  if (
    typeof FontFace !== 'function' ||
    typeof document === 'undefined' ||
    !document.fonts
  ) {
    throw new GraphFontError('当前浏览器不支持动态字体加载')
  }
  return document.fonts
}

function loadFaceOnce(key: string, createFace: () => FontFace): Promise<void> {
  const existing = loadedFontPromises.get(key)
  if (existing) return existing

  const loading = (async () => {
    const fontSet = ensureFontApi()
    const face = createFace()
    const loadedFace = await face.load()
    fontSet.add(loadedFace)
  })()
  loadedFontPromises.set(key, loading)
  void loading.catch(() => loadedFontPromises.delete(key))
  return loading
}

async function loadLocalFontRecord(font: StoredLocalFont): Promise<void> {
  sessionLocalFonts.set(font.id, font)
  const data = await font.blob.arrayBuffer()
  await loadFaceOnce(
    'local:' + font.id,
    () =>
      new FontFace(localFontFamily(font.id), data, {
        display: 'swap',
        weight: '100 900',
      }),
  )
}

export async function ensureGraphFontLoaded(
  settings: GraphLabelSettings,
): Promise<void> {
  switch (settings.fontFamily) {
    case 'sans':
      return
    case 'resource-rounded':
      return loadFaceOnce(
        'builtin:resource-rounded',
        () =>
          new FontFace(
            RESOURCE_ROUNDED_FAMILY,
            'url("' + resourceHanRoundedUrl + '")',
            {
              display: 'swap',
              weight: '700',
            },
          ),
      )
    case 'local': {
      if (!settings.localFontId) {
        throw new GraphFontError('项目缺少本地字体 ID')
      }
      const sessionFont = sessionLocalFonts.get(settings.localFontId)
      if (sessionFont) return loadLocalFontRecord(sessionFont)
      let storedFont: StoredLocalFont | null
      try {
        storedFont = await loadStoredLocalFont(settings.localFontId)
      } catch {
        throw new GraphFontError('无法读取浏览器本地字体库')
      }
      if (!storedFont) {
        throw new GraphFontError(
          '未找到本地字体“' +
            (settings.localFontName ?? '未知字体') +
            '”，请重新选择字体文件',
        )
      }
      return loadLocalFontRecord(storedFont)
    }
  }
}

export async function ensureProfileFontsLoaded(
  profile: GraphProfileSettings,
): Promise<void> {
  const needsResourceRounded =
    profile.subTemplateId?.startsWith('cute_pink') === true ||
    profile.customTexts.some((text) => text.fontFamily === 'resource-rounded')
  if (!needsResourceRounded) return
  await loadFaceOnce(
    'builtin:resource-rounded',
    () =>
      new FontFace(
        RESOURCE_ROUNDED_FAMILY,
        'url("' + resourceHanRoundedUrl + '")',
        {
          display: 'swap',
          weight: '700',
        },
      ),
  )
}

function supportedFontSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  const ascii = String.fromCharCode(...bytes.subarray(0, 4))
  return (
    (bytes[0] === 0x00 &&
      bytes[1] === 0x01 &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x00) ||
    ascii === 'OTTO' ||
    ascii === 'wOFF' ||
    ascii === 'wOF2' ||
    ascii === 'true' ||
    ascii === 'typ1'
  )
}

export async function registerLocalFont(
  file: File,
): Promise<RegisteredLocalFont> {
  if (file.size <= 0) {
    throw new GraphFontError('字体文件为空')
  }
  if (file.size > MAX_LOCAL_FONT_BYTES) {
    throw new GraphFontError('本地字体不能超过 20 MB')
  }
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (!supportedFontSignature(header)) {
    throw new GraphFontError('请选择有效的 TTF、OTF、WOFF 或 WOFF2 字体')
  }

  const font: StoredLocalFont = {
    id: createEntityId('font'),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    byteLength: file.size,
    createdAt: new Date().toISOString(),
    blob: file,
  }
  try {
    await loadLocalFontRecord(font)
  } catch {
    throw new GraphFontError('浏览器无法解析这个字体文件')
  }

  let persisted = true
  try {
    await saveStoredLocalFont(font)
  } catch {
    persisted = false
  }
  return { id: font.id, name: font.name, persisted }
}
