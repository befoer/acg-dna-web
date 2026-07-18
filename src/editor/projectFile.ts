import { parseGraphDocument, type GraphDocument } from '../domain/graph'
import {
  isAcceptedLocalImageMimeType,
  MAX_LOCAL_IMAGE_BYTES,
  readImageAssetSource,
  type ImageAssetSource,
  type StoredLocalImageAsset,
} from './assets'
import type { PersistedEditorSnapshot } from './persistence'

export const PROJECT_FILE_FORMAT = 'acg-dna-web-project'
export const PROJECT_FILE_VERSION = 1 as const
export const MAX_PROJECT_FILE_BYTES = 128 * 1024 * 1024
const MAX_PROJECT_ASSET_COUNT = 256
const BASE64_CHUNK_SIZE = 32_768

interface SerializedProjectAsset {
  id: string
  fileName: string
  mimeType: string
  byteLength: number
  dataBase64: string
  source?: ImageAssetSource
}

interface SerializedProjectFile {
  format: typeof PROJECT_FILE_FORMAT
  fileVersion: typeof PROJECT_FILE_VERSION
  exportedAt: string
  document: GraphDocument
  assets: SerializedProjectAsset[]
}

type UnknownRecord = Record<string, unknown>

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectFileError'
  }
}

function readRecord(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProjectFileError(path + ' 必须是对象')
  }
  return value as UnknownRecord
}

function readNonEmptyString(
  record: UnknownRecord,
  key: string,
  path: string,
): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ProjectFileError(path + '.' + key + ' 必须是非空字符串')
  }
  return value
}

function collectReferencedAssetIds(document: GraphDocument): Set<string> {
  const ids = new Set<string>()
  const add = (imageAssetId: string | undefined) => {
    if (imageAssetId) ids.add(imageAssetId)
  }
  add(document.profile.avatarAssetId)
  document.decoration.images.forEach((image) => add(image.assetId))
  document.categories.forEach((category) => {
    add(category.imageAssetId)
    category.attributes.forEach((attribute) => {
      add(attribute.imageAssetId)
      attribute.children.forEach((child) => add(child.imageAssetId))
    })
  })
  return ids
}

async function encodeBlob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    chunks.push(
      String.fromCharCode(
        ...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE),
      ),
    )
  }
  return btoa(chunks.join(''))
}

function decodeAsset(value: unknown, index: number): StoredLocalImageAsset {
  const path = 'assets[' + index + ']'
  const record = readRecord(value, path)
  const id = readNonEmptyString(record, 'id', path)
  const fileName = readNonEmptyString(record, 'fileName', path)
  const mimeType = readNonEmptyString(record, 'mimeType', path)
  const byteLength = record.byteLength
  const dataBase64 = record.dataBase64
  const source = readImageAssetSource(record.source)

  if (!isAcceptedLocalImageMimeType(mimeType)) {
    throw new ProjectFileError(path + '.mimeType 不是支持的图片格式')
  }
  if (
    typeof byteLength !== 'number' ||
    !Number.isInteger(byteLength) ||
    byteLength <= 0 ||
    byteLength > MAX_LOCAL_IMAGE_BYTES
  ) {
    throw new ProjectFileError(path + '.byteLength 无效')
  }
  if (
    typeof dataBase64 !== 'string' ||
    dataBase64.length === 0 ||
    dataBase64.length % 4 !== 0 ||
    !/^[a-z0-9+/]*={0,2}$/i.test(dataBase64)
  ) {
    throw new ProjectFileError(path + '.dataBase64 不是有效的 Base64')
  }

  let binary: string
  try {
    binary = atob(dataBase64)
  } catch {
    throw new ProjectFileError(path + '.dataBase64 无法解码')
  }
  if (binary.length !== byteLength) {
    throw new ProjectFileError(path + ' 的图片大小与记录不一致')
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return {
    id,
    fileName,
    mimeType,
    byteLength,
    blob: new Blob([bytes], { type: mimeType }),
    ...(source ? { source } : {}),
  }
}

function validateAssetReferences(
  document: GraphDocument,
  assets: StoredLocalImageAsset[],
): StoredLocalImageAsset[] {
  const referencedIds = collectReferencedAssetIds(document)
  const assetsById = new Map<string, StoredLocalImageAsset>()
  assets.forEach((asset) => {
    if (assetsById.has(asset.id)) {
      throw new ProjectFileError('项目文件包含重复的图片 ID：' + asset.id)
    }
    assetsById.set(asset.id, asset)
  })
  referencedIds.forEach((assetId) => {
    if (!assetsById.has(assetId)) {
      throw new ProjectFileError('项目引用的图片不存在：' + assetId)
    }
  })
  return assets.filter((asset) => referencedIds.has(asset.id))
}

export async function serializeProjectFile(
  snapshot: PersistedEditorSnapshot,
  exportedAt = new Date().toISOString(),
): Promise<string> {
  if (!Number.isFinite(Date.parse(exportedAt))) {
    throw new ProjectFileError('项目导出时间无效')
  }
  const document = parseGraphDocument(snapshot.document)
  const assets = validateAssetReferences(document, snapshot.assets)
  const serializedAssets = await Promise.all(
    assets.map(async (asset): Promise<SerializedProjectAsset> => ({
      id: asset.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      byteLength: asset.byteLength,
      dataBase64: await encodeBlob(asset.blob),
      ...(asset.source ? { source: asset.source } : {}),
    })),
  )
  const serialized = JSON.stringify(
    {
      format: PROJECT_FILE_FORMAT,
      fileVersion: PROJECT_FILE_VERSION,
      exportedAt,
      document,
      assets: serializedAssets,
    } satisfies SerializedProjectFile,
    null,
    2,
  )
  if (new Blob([serialized]).size > MAX_PROJECT_FILE_BYTES) {
    throw new ProjectFileError('项目文件超过 128 MB，无法生成可重新导入的文件')
  }
  return serialized
}

export function parseProjectFileText(text: string): PersistedEditorSnapshot {
  if (!text.trim()) {
    throw new ProjectFileError('项目文件为空')
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new ProjectFileError('项目文件不是有效的 JSON')
  }
  const record = readRecord(value, 'projectFile')
  if (record.format !== PROJECT_FILE_FORMAT) {
    throw new ProjectFileError('这不是 ACG DNA Web 项目文件')
  }
  if (record.fileVersion !== PROJECT_FILE_VERSION) {
    throw new ProjectFileError(
      '不支持的项目文件版本：' + String(record.fileVersion),
    )
  }
  const exportedAt = readNonEmptyString(record, 'exportedAt', 'projectFile')
  if (!Number.isFinite(Date.parse(exportedAt))) {
    throw new ProjectFileError('项目文件导出时间无效')
  }
  const document = parseGraphDocument(record.document)
  if (!Array.isArray(record.assets)) {
    throw new ProjectFileError('projectFile.assets 必须是数组')
  }
  if (record.assets.length > MAX_PROJECT_ASSET_COUNT) {
    throw new ProjectFileError('项目文件包含过多图片')
  }
  const assets = validateAssetReferences(
    document,
    record.assets.map(decodeAsset),
  )
  return {
    document,
    assets,
    savedAt: exportedAt,
  }
}

export async function readProjectFile(
  file: File,
): Promise<PersistedEditorSnapshot> {
  if (file.size === 0) {
    throw new ProjectFileError('项目文件为空')
  }
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    throw new ProjectFileError('项目文件不能超过 128 MB')
  }
  return parseProjectFileText(await file.text())
}

export function createProjectFileBlob(text: string): Blob {
  return new Blob([text], { type: 'application/json;charset=utf-8' })
}

export function createProjectFileName(projectName: string): string {
  const forbidden = '<>:/|?*' + String.fromCharCode(34, 92)
  const cleaned = Array.from(projectName.trim(), (character) =>
    character.charCodeAt(0) < 32 || forbidden.includes(character)
      ? '-'
      : character,
  ).join('')
  const safeName = cleaned.replace(/[. ]+$/g, '').slice(0, 64) || '未命名属性图'
  return safeName + '.acgdna.json'
}
