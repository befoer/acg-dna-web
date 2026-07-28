import { createEntityId } from '../domain/graph'
import type { OnlineImageSearchResult } from '../search/onlineImageSearch'

export const MAX_LOCAL_IMAGE_BYTES = 15 * 1024 * 1024

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
  source?: ImageAssetSource
}

export class LocalImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocalImageError'
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
  let response: Response
  try {
    response = await fetch(result.downloadUrl, {
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    throw new LocalImageError('无法下载所选在线图片')
  }
  if (!response.ok) {
    throw new LocalImageError('在线图片下载失败（' + response.status + '）')
  }
  const blob = await response.blob()
  const mimeType = blob.type.split(';')[0]?.trim().toLowerCase() || ''
  if (!isAcceptedLocalImageMimeType(mimeType)) {
    throw new LocalImageError('在线图片返回了不支持的格式')
  }
  if (blob.size <= 0 || blob.size > MAX_LOCAL_IMAGE_BYTES) {
    throw new LocalImageError('在线图片为空或超过 15 MB')
  }
  const resolvedSearchSeed =
    searchSeed?.provider === 'bangumi'
      ? searchSeed
      : result.provider === 'bangumi'
        ? result
        : undefined
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
  const objectUrl = URL.createObjectURL(source.blob)
  try {
    const image = await decodeImage(objectUrl)
    return {
      ...source,
      objectUrl,
      image,
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
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
    ...(asset.source ? { source: asset.source } : {}),
  }
}

export function revokeLocalImageAsset(asset: LocalImageAsset): void {
  URL.revokeObjectURL(asset.objectUrl)
}
