import { createEntityId } from '../domain/graph'

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
}

export interface StoredLocalImageAsset {
  id: string
  fileName: string
  mimeType: string
  byteLength: number
  blob: Blob
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
  }
}

export function revokeLocalImageAsset(asset: LocalImageAsset): void {
  URL.revokeObjectURL(asset.objectUrl)
}
