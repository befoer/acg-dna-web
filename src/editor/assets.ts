import { createEntityId } from '../domain/graph'
import type { OnlineImageSearchResult } from '../search/onlineImageSearch'

export const MAX_LOCAL_IMAGE_BYTES = 15 * 1024 * 1024
const ONLINE_IMAGE_DOWNLOAD_TIMEOUT_MS = 20_000

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/avif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export function isAcceptedLocalImageMimeType(mimeType: string): boolean {
  return ACCEPTED_IMAGE_TYPES.has(mimeType)
}

export interface LocalImageAsset {
  id: string
  fileName: string
  mimeType: string
  byteLength: number
  blob: Blob
  objectUrl: string
  image: HTMLImageElement
  remoteUrl?: string
  source?: ImageAssetSource
}

export interface ImageAssetSource {
  provider: 'bangumi' | 'anilist'
  externalId: string
  sourceUrl: string
  originalUrl: string
  fetchedAt: string
  searchSeed?: OnlineImageSearchResult
}

function readOnlineImageSearchSeed(
  value: unknown,
): OnlineImageSearchResult | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (
    record.provider !== 'bangumi' ||
    !['character', 'anime', 'game', 'singer'].includes(String(record.kind)) ||
    typeof record.externalId !== 'string' ||
    !record.externalId.trim() ||
    typeof record.name !== 'string' ||
    !record.name.trim() ||
    typeof record.thumbnailUrl !== 'string' ||
    !record.thumbnailUrl.startsWith('https://') ||
    typeof record.downloadUrl !== 'string' ||
    !record.downloadUrl.startsWith('https://') ||
    typeof record.originalUrl !== 'string' ||
    !record.originalUrl.startsWith('https://') ||
    typeof record.sourceUrl !== 'string' ||
    !record.sourceUrl.startsWith('https://')
  ) {
    return undefined
  }
  const optionalText = (field: string): string | undefined => {
    const text = record[field]
    return typeof text === 'string' && text.trim() ? text : undefined
  }
  return {
    provider: 'bangumi',
    externalId: record.externalId,
    kind: record.kind as OnlineImageSearchResult['kind'],
    name: record.name,
    ...(optionalText('nativeName')
      ? { nativeName: optionalText('nativeName') }
      : {}),
    ...(optionalText('alternateName')
      ? { alternateName: optionalText('alternateName') }
      : {}),
    ...(optionalText('subtitle') ? { subtitle: optionalText('subtitle') } : {}),
    thumbnailUrl: record.thumbnailUrl,
    downloadUrl: record.downloadUrl,
    originalUrl: record.originalUrl,
    sourceUrl: record.sourceUrl,
  }
}

export function readImageAssetSource(
  value: unknown,
): ImageAssetSource | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const searchSeed = readOnlineImageSearchSeed(record.searchSeed)
  if (
    (record.provider !== 'bangumi' && record.provider !== 'anilist') ||
    typeof record.externalId !== 'string' ||
    !record.externalId.trim() ||
    typeof record.sourceUrl !== 'string' ||
    !record.sourceUrl.startsWith('https://') ||
    typeof record.originalUrl !== 'string' ||
    !record.originalUrl.startsWith('https://') ||
    typeof record.fetchedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.fetchedAt))
  ) {
    return undefined
  }
  return {
    provider: record.provider,
    externalId: record.externalId,
    sourceUrl: record.sourceUrl,
    originalUrl: record.originalUrl,
    fetchedAt: record.fetchedAt,
    ...(searchSeed ? { searchSeed } : {}),
  }
}

export interface StoredLocalImageAsset {
  id: string
  fileName: string
  mimeType: string
  byteLength: number
  blob: Blob
  remoteUrl?: string
  source?: ImageAssetSource
}

export class LocalImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocalImageError'
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function createTimedAbortSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort()
  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromCaller)
    },
  }
}

function decodeImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new LocalImageError('无法解码这张图片'))
    image.src = objectUrl
  })
}

export async function loadLocalImageAsset(
  file: File,
): Promise<LocalImageAsset> {
  if (!isAcceptedLocalImageMimeType(file.type)) {
    throw new LocalImageError('请选择 PNG、JPEG、WebP 或 AVIF 图片')
  }
  if (file.size > MAX_LOCAL_IMAGE_BYTES) {
    throw new LocalImageError('图片不能超过 15 MB')
  }
  if (file.size === 0) {
    throw new LocalImageError('图片文件为空')
  }

  return createRuntimeImageAsset({
    id: createEntityId('asset'),
    fileName: file.name,
    mimeType: file.type,
    byteLength: file.size,
    blob: file,
  })
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'avif'
}

function safeRemoteFileName(result: OnlineImageSearchResult, mimeType: string) {
  const name = result.name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 80)
  return `${name || result.kind}-${result.provider}-${result.externalId}.${extensionForMimeType(mimeType)}`
}

export async function loadOnlineImageAsset(
  result: OnlineImageSearchResult,
  signal?: AbortSignal,
  searchSeed?: OnlineImageSearchResult,
): Promise<LocalImageAsset> {
  const resolvedSearchSeed =
    searchSeed?.provider === 'bangumi'
      ? searchSeed
      : result.provider === 'bangumi'
        ? result
        : undefined
  if (result.provider === 'bangumi') {
    const remoteUrl = result.originalUrl || result.downloadUrl
    return createRuntimeImageAsset({
      id: createEntityId('asset'),
      fileName: safeRemoteFileName(result, 'image/jpeg'),
      mimeType: 'image/jpeg',
      byteLength: 0,
      blob: new Blob([], { type: 'image/jpeg' }),
      remoteUrl,
      source: {
        provider: result.provider,
        externalId: result.externalId,
        sourceUrl: result.sourceUrl,
        originalUrl: remoteUrl,
        fetchedAt: new Date().toISOString(),
        ...(resolvedSearchSeed ? { searchSeed: resolvedSearchSeed } : {}),
      },
    })
  }
  let response: Response
  let blob: Blob
  const request = createTimedAbortSignal(
    signal,
    ONLINE_IMAGE_DOWNLOAD_TIMEOUT_MS,
  )
  try {
    response = await fetch(result.downloadUrl, {
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: request.signal,
    })
    if (!response.ok) {
      if (response.status === 429) {
        throw new LocalImageError('在线图片请求过于频繁，请稍后重试')
      }
      if (response.status === 504) {
        throw new LocalImageError('在线图片下载超时，请稍后重试')
      }
      throw new LocalImageError('在线图片下载失败（' + response.status + '）')
    }
    blob = await response.blob()
  } catch (error) {
    if (request.timedOut()) {
      throw new LocalImageError('在线图片下载超时，请稍后重试')
    }
    if (error instanceof LocalImageError || isAbortError(error)) throw error
    throw new LocalImageError('无法下载所选在线图片')
  } finally {
    request.dispose()
  }
  const mimeType = blob.type.split(';')[0]?.trim().toLowerCase() || ''
  if (!isAcceptedLocalImageMimeType(mimeType)) {
    throw new LocalImageError('在线图片返回了不支持的格式')
  }
  if (blob.size <= 0 || blob.size > MAX_LOCAL_IMAGE_BYTES) {
    throw new LocalImageError('在线图片为空或超过 15 MB')
  }
  return createRuntimeImageAsset({
    id: createEntityId('asset'),
    fileName: safeRemoteFileName(result, mimeType),
    mimeType,
    byteLength: blob.size,
    blob,
    source: {
      provider: result.provider,
      externalId: result.externalId,
      sourceUrl: result.sourceUrl,
      originalUrl: result.originalUrl,
      fetchedAt: new Date().toISOString(),
      ...(resolvedSearchSeed ? { searchSeed: resolvedSearchSeed } : {}),
    },
  })
}

async function createRuntimeImageAsset(
  source: StoredLocalImageAsset,
): Promise<LocalImageAsset> {
  const objectUrl = source.remoteUrl ?? URL.createObjectURL(source.blob)
  try {
    const image = await decodeImage(objectUrl)
    return {
      ...source,
      objectUrl,
      image,
    }
  } catch (error) {
    if (!source.remoteUrl) URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export async function restoreLocalImageAsset(
  source: StoredLocalImageAsset,
): Promise<LocalImageAsset> {
  if (!source.id.trim() || !source.fileName.trim()) {
    throw new LocalImageError('本地图片记录缺少名称或 ID')
  }
  if (!isAcceptedLocalImageMimeType(source.mimeType)) {
    throw new LocalImageError('本地图片记录格式不受支持')
  }
  if (source.remoteUrl !== undefined) {
    if (!source.remoteUrl.startsWith('https://')) {
      throw new LocalImageError('远程图片地址无效')
    }
    return createRuntimeImageAsset(source)
  }
  if (
    source.byteLength !== source.blob.size ||
    source.byteLength <= 0 ||
    source.byteLength > MAX_LOCAL_IMAGE_BYTES
  ) {
    throw new LocalImageError('本地图片记录大小无效')
  }
  return createRuntimeImageAsset(source)
}

export function storeLocalImageAsset(
  asset: LocalImageAsset,
): StoredLocalImageAsset {
  return {
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
    blob: asset.blob,
    ...(asset.remoteUrl ? { remoteUrl: asset.remoteUrl } : {}),
    ...(asset.source ? { source: asset.source } : {}),
  }
}

export function revokeLocalImageAsset(asset: LocalImageAsset): void {
  if (!asset.remoteUrl) URL.revokeObjectURL(asset.objectUrl)
}
