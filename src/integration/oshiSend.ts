/**
 * 反向联动：把某个分类下的属性当作角色发给「推日」。
 * 本站用 window.open 打开推日（带 ?import=acg-dna），推日准备好后发 ready，
 * 本站再用 postMessage 把名字、头像和 Bangumi 角色 ID 交给它；推日确认后回 imported。
 * 推日只运行在本机，没有启动时等不到 ready，会提示先启动推日。
 */
import type { GraphCategory } from '../domain/graph'
import type { LocalImageAsset } from '../editor/assets'
import { isAllowedOshiOrigin, OSHI_PROTOCOL_VERSION } from './oshiImport'

export const OSHI_URL = 'http://127.0.0.1:36524/'
export const OSHI_SEND_READY = 'oshi-calendar:ready'
export const OSHI_SEND_IMPORTED = 'oshi-calendar:imported'
export const ACG_CHARACTERS = 'acg-dna:characters'
const WAIT_READY_MS = 20_000
const BANGUMI_IMAGE = /^https:\/\/lain\.bgm\.tv\//

export interface OshiSendCharacter {
  name: string
  /** 本地图片，data URL */
  image?: string
  /** Bangumi 图片链接（本站只保存了链接时） */
  imageUrl?: string
  /** 图片来自 Bangumi 角色搜索时附上角色 ID，推日可直接关联补全资料 */
  bangumiId?: number
}

/** 开发时可在 localStorage 里设置 acg-dna-oshi-url 指向开发中的推日。 */
export function oshiURL(): string {
  try {
    const custom = localStorage.getItem('acg-dna-oshi-url')
    if (custom && isAllowedOshiOrigin(new URL(custom).origin)) return custom
  } catch {
    /* 读不到时用默认地址 */
  }
  return OSHI_URL
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

export function bangumiCharacterId(
  asset?: LocalImageAsset,
): number | undefined {
  const source = asset?.source
  if (source?.provider !== 'bangumi') return undefined
  if (source.searchSeed && source.searchSeed.kind !== 'character')
    return undefined
  const id = Number(source.externalId)
  return Number.isInteger(id) && id > 0 ? id : undefined
}

export async function oshiSendPayload(
  category: GraphCategory,
  assets: Record<string, LocalImageAsset>,
) {
  const seen = new Set<string>()
  const characters: OshiSendCharacter[] = []
  for (const attribute of category.attributes) {
    const name = attribute.name.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const asset = attribute.imageAssetId
      ? assets[attribute.imageAssetId]
      : undefined
    const character: OshiSendCharacter = { name }
    if (asset?.remoteUrl && BANGUMI_IMAGE.test(asset.remoteUrl)) {
      character.imageUrl = asset.remoteUrl
    } else if (asset && asset.byteLength > 0) {
      try {
        character.image = await blobToDataURL(asset.blob)
      } catch {
        /* 图片读不到时只发名字 */
      }
    }
    const bangumiId = bangumiCharacterId(asset)
    if (bangumiId) character.bangumiId = bangumiId
    characters.push(character)
  }
  return {
    type: ACG_CHARACTERS,
    version: OSHI_PROTOCOL_VERSION,
    characters,
  }
}

export type OshiSendPayload = Awaited<ReturnType<typeof oshiSendPayload>>

/**
 * 必须在点击事件里同步调用（window.open 才不会被拦截）。
 * 推日导入完成时 resolve 导入数量；没启动、窗口被关掉时 reject。
 */
export function sendToOshi(payload: Promise<OshiSendPayload>): Promise<number> {
  const target = new URL(oshiURL())
  target.searchParams.set('import', 'acg-dna')
  const popup = window.open(target.href, 'oshi-calendar')
  if (!popup) {
    return Promise.reject(
      new Error('浏览器拦截了弹出窗口，请允许本页打开新窗口'),
    )
  }
  return new Promise<number>((resolve, reject) => {
    let sent = false
    const finish = () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      clearInterval(closed)
    }
    const timer = setTimeout(() => {
      if (sent) return
      finish()
      reject(new Error('推日没有响应。请先双击「推日.exe」启动推日，再点发送'))
    }, WAIT_READY_MS)
    const closed = setInterval(() => {
      if (!popup.closed) return
      finish()
      reject(new Error(sent ? '推日窗口已关闭，未确认导入' : '推日窗口已关闭'))
    }, 1000)
    const onMessage = async (event: MessageEvent) => {
      if (event.source !== popup || event.origin !== target.origin) return
      const data = event.data as { type?: string; count?: number } | null
      if (data?.type === OSHI_SEND_READY && !sent) {
        sent = true
        popup.postMessage(await payload, target.origin)
      } else if (data?.type === OSHI_SEND_IMPORTED) {
        finish()
        resolve(typeof data.count === 'number' ? data.count : 0)
      }
    }
    window.addEventListener('message', onMessage)
  })
}
