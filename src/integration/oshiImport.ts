/**
 * 与「推日 · 角色创作日历」联动：推日用 window.open 打开本站（带 ?import=oshi-calendar），
 * 本站准备好后向打开者发 ready，推日再把角色（名字、作品、头像 data URL）用 postMessage 发过来。
 * 只接受白名单来源、且必须来自打开本页的那个窗口；数据只在浏览器内传递，不经过任何服务器。
 */
export const OSHI_IMPORT_PARAM = 'import'
export const OSHI_IMPORT_VALUE = 'oshi-calendar'
export const OSHI_READY = 'acg-dna:ready'
export const OSHI_IMPORTED = 'acg-dna:imported'
export const OSHI_CHARACTERS = 'oshi-calendar:characters'
export const OSHI_PROTOCOL_VERSION = 1

/** 推日运行在本机服务（36524）或开发服务器（5173）上。 */
export const OSHI_ALLOWED_ORIGINS = [
  'http://127.0.0.1:36524',
  'http://localhost:36524',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
] as const

const MAX_CHARACTERS = 200
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const IMAGE_DATA_URL =
  /^data:(image\/(?:png|jpeg|webp|avif));base64,([A-Za-z0-9+/]+={0,2})$/

export interface OshiCharacter {
  name: string
  works: string[]
  /** 头像，base64 data URL；没有头像时为空 */
  image?: { mimeType: string; base64: string }
}

export function isOshiImportRequest(search: string): boolean {
  return (
    new URLSearchParams(search).get(OSHI_IMPORT_PARAM) === OSHI_IMPORT_VALUE
  )
}

export function isAllowedOshiOrigin(origin: string): boolean {
  return (OSHI_ALLOWED_ORIGINS as readonly string[]).includes(origin)
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string'
    ? Array.from(value)
        .filter((char) => {
          const code = char.charCodeAt(0)
          return code >= 0x20 && code !== 0x7f
        })
        .join('')
        .trim()
        .slice(0, max)
    : ''
}

function readImage(value: unknown): OshiCharacter['image'] {
  if (typeof value !== 'string') return undefined
  const match = value.match(IMAGE_DATA_URL)
  if (!match?.[1] || !match[2]) return undefined
  // base64 每 4 个字符对应 3 个字节
  if ((match[2].length * 3) / 4 > MAX_IMAGE_BYTES) return undefined
  return { mimeType: match[1], base64: match[2] }
}

/** 校验推日发来的消息；格式不对返回 null。名字为空的条目会被丢弃，重名只保留第一个。 */
export function parseOshiMessage(data: unknown): OshiCharacter[] | null {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  if (
    record.type !== OSHI_CHARACTERS ||
    record.version !== OSHI_PROTOCOL_VERSION ||
    !Array.isArray(record.characters)
  ) {
    return null
  }
  const seen = new Set<string>()
  const characters: OshiCharacter[] = []
  for (const item of record.characters.slice(0, MAX_CHARACTERS)) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    const name = cleanText(entry.name, 40)
    if (!name || seen.has(name)) continue
    seen.add(name)
    const works = Array.isArray(entry.works)
      ? entry.works
          .map((work) => cleanText(work, 60))
          .filter(Boolean)
          .slice(0, 6)
      : []
    const image = readImage(entry.image)
    characters.push({ name, works, ...(image ? { image } : {}) })
  }
  return characters
}

export function oshiImageFile(character: OshiCharacter): File | null {
  if (!character.image) return null
  const binary = atob(character.image.base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  const extension = character.image.mimeType.split('/')[1] ?? 'png'
  const safeName =
    character.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 60) || 'avatar'
  return new File(
    [bytes],
    `${safeName}.${extension === 'jpeg' ? 'jpg' : extension}`,
    {
      type: character.image.mimeType,
    },
  )
}

/** 去掉地址栏里的 ?import=oshi-calendar，刷新后不再等待推日。 */
export function clearOshiImportParam(location: Location, history: History) {
  const url = new URL(location.href)
  url.searchParams.delete(OSHI_IMPORT_PARAM)
  history.replaceState(history.state, '', url.pathname + url.search + url.hash)
}
