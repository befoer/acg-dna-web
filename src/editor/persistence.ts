import { parseGraphDocument, type GraphDocument } from '../domain/graph'
import {
  storeLocalImageAsset,
  readImageAssetSource,
  type LocalImageAsset,
  type StoredLocalImageAsset,
} from './assets'

const DATABASE_NAME = 'acg-dna-web'
const DATABASE_VERSION = 3
const LEGACY_PROJECTS_STORE = 'projects'
const LEGACY_ASSETS_STORE = 'assets'
const LEGACY_CURRENT_PROJECT_KEY = 'current'
const PROJECTS_STORE = 'project-library'
const ASSETS_STORE = 'project-assets'
const ASSETS_PROJECT_INDEX = 'projectId'
const SETTINGS_STORE = 'settings'
const ACTIVE_PROJECT_KEY = 'active-project'
const LEGACY_STORAGE_VERSION = 1
const STORAGE_VERSION = 2

interface LegacyStoredProjectRecord {
  key: typeof LEGACY_CURRENT_PROJECT_KEY
  storageVersion: typeof LEGACY_STORAGE_VERSION
  document: unknown
  savedAt: string
}

interface StoredProjectRecord {
  id: string
  storageVersion: typeof STORAGE_VERSION
  document: unknown
  savedAt: string
}

interface StoredProjectAssetRecord extends StoredLocalImageAsset {
  projectId: string
}

interface StoredSettingRecord {
  key: string
  value: string
}

export interface PersistedEditorSnapshot {
  document: GraphDocument
  assets: StoredLocalImageAsset[]
  savedAt: string
}

export interface LoadedProject {
  projectId: string
  snapshot: PersistedEditorSnapshot
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  savedAt: string
}

export interface ProjectRepository {
  listProjects(): Promise<ProjectSummary[]>
  loadActiveProject(): Promise<LoadedProject | null>
  loadProject(projectId: string): Promise<PersistedEditorSnapshot | null>
  saveProject(
    projectId: string,
    snapshot: PersistedEditorSnapshot,
  ): Promise<void>
  setActiveProject(projectId: string): Promise<void>
  deleteProject(projectId: string): Promise<void>
}

export class ProjectPersistenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectPersistenceError'
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(
        request.error ?? new ProjectPersistenceError('浏览器本地存储请求失败'),
      )
  })
}

function transactionFinished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new ProjectPersistenceError('浏览器本地存储事务已中止'),
      )
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new ProjectPersistenceError('浏览器本地存储事务失败'),
      )
  })
}

function openDatabase(
  factory: IDBFactory,
  databaseName: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(LEGACY_PROJECTS_STORE)) {
        database.createObjectStore(LEGACY_PROJECTS_STORE, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(LEGACY_ASSETS_STORE)) {
        database.createObjectStore(LEGACY_ASSETS_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
        database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(ASSETS_STORE)) {
        const assetsStore = database.createObjectStore(ASSETS_STORE, {
          keyPath: ['projectId', 'id'],
        })
        assetsStore.createIndex(ASSETS_PROJECT_INDEX, 'projectId', {
          unique: false,
        })
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () =>
      reject(
        request.error ??
          new ProjectPersistenceError('无法打开浏览器本地数据库'),
      )
    request.onblocked = () =>
      reject(
        new ProjectPersistenceError(
          '本地数据库升级被其他标签页阻止，请关闭旧页面后重试',
        ),
      )
  })
}

function isStoredAsset(value: unknown): value is StoredLocalImageAsset {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    record.id.trim().length > 0 &&
    typeof record.fileName === 'string' &&
    record.fileName.trim().length > 0 &&
    typeof record.mimeType === 'string' &&
    typeof record.byteLength === 'number' &&
    Number.isFinite(record.byteLength) &&
    record.blob instanceof Blob
  )
}

function parseSavedAt(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ProjectPersistenceError('本地项目保存时间无效')
  }
  return value
}

function parseLegacyProjectRecord(value: unknown): {
  document: GraphDocument
  savedAt: string
} | null {
  if (value === undefined) return null
  if (typeof value !== 'object' || value === null) {
    throw new ProjectPersistenceError('旧版本地项目记录格式无效')
  }
  const record = value as Partial<LegacyStoredProjectRecord>
  if (
    record.key !== LEGACY_CURRENT_PROJECT_KEY ||
    record.storageVersion !== LEGACY_STORAGE_VERSION
  ) {
    throw new ProjectPersistenceError('旧版本地项目记录版本无效')
  }
  return {
    document: parseGraphDocument(record.document),
    savedAt: parseSavedAt(record.savedAt),
  }
}

function parseProjectRecord(
  value: unknown,
  expectedProjectId?: string,
): {
  document: GraphDocument
  savedAt: string
} | null {
  if (value === undefined) return null
  if (typeof value !== 'object' || value === null) {
    throw new ProjectPersistenceError('本地项目记录格式无效')
  }
  const record = value as Partial<StoredProjectRecord>
  if (
    typeof record.id !== 'string' ||
    !record.id.trim() ||
    record.storageVersion !== STORAGE_VERSION ||
    (expectedProjectId !== undefined && record.id !== expectedProjectId)
  ) {
    throw new ProjectPersistenceError('本地项目记录 ID 或版本无效')
  }
  const document = parseGraphDocument(record.document)
  if (document.id !== record.id) {
    throw new ProjectPersistenceError('本地项目记录与文档 ID 不一致')
  }
  return {
    document,
    savedAt: parseSavedAt(record.savedAt),
  }
}

function parseProjectAssetRecord(
  value: unknown,
  projectId: string,
): StoredLocalImageAsset | null {
  if (!isStoredAsset(value)) return null
  const record = value as StoredProjectAssetRecord
  if (record.projectId !== projectId) return null
  const source = readImageAssetSource(record.source)
  return {
    id: record.id,
    fileName: record.fileName,
    mimeType: record.mimeType,
    byteLength: record.byteLength,
    blob: record.blob,
    ...(source ? { source } : {}),
  }
}

function projectSummary(
  projectId: string,
  snapshot: Pick<PersistedEditorSnapshot, 'document' | 'savedAt'>,
): ProjectSummary {
  return {
    id: projectId,
    name: snapshot.document.name,
    createdAt: snapshot.document.createdAt,
    updatedAt: snapshot.document.updatedAt,
    savedAt: snapshot.savedAt,
  }
}

async function migrateLegacyProject(database: IDBDatabase): Promise<void> {
  const transaction = database.transaction(
    [
      LEGACY_PROJECTS_STORE,
      LEGACY_ASSETS_STORE,
      PROJECTS_STORE,
      ASSETS_STORE,
      SETTINGS_STORE,
    ],
    'readwrite',
  )
  const finished = transactionFinished(transaction)
  const projectCountRequest = transaction.objectStore(PROJECTS_STORE).count()
  const legacyProjectRequest = transaction
    .objectStore(LEGACY_PROJECTS_STORE)
    .get(LEGACY_CURRENT_PROJECT_KEY)
  const legacyAssetsRequest = transaction
    .objectStore(LEGACY_ASSETS_STORE)
    .getAll()

  try {
    const [projectCount, legacyProjectValue, legacyAssetValues] =
      await Promise.all([
        requestResult(projectCountRequest),
        requestResult(legacyProjectRequest),
        requestResult(legacyAssetsRequest),
      ])
    if (projectCount === 0) {
      const legacyProject = parseLegacyProjectRecord(legacyProjectValue)
      if (legacyProject) {
        const projectId = legacyProject.document.id
        transaction.objectStore(PROJECTS_STORE).put({
          id: projectId,
          storageVersion: STORAGE_VERSION,
          document: legacyProject.document,
          savedAt: legacyProject.savedAt,
        } satisfies StoredProjectRecord)
        const assetsStore = transaction.objectStore(ASSETS_STORE)
        legacyAssetValues.filter(isStoredAsset).forEach((asset) => {
          assetsStore.put({
            projectId,
            ...asset,
          } satisfies StoredProjectAssetRecord)
        })
        transaction.objectStore(SETTINGS_STORE).put({
          key: ACTIVE_PROJECT_KEY,
          value: projectId,
        } satisfies StoredSettingRecord)
      }
    }
    await finished
  } catch (error) {
    try {
      transaction.abort()
    } catch {
      // The transaction may already have completed after a read error.
    }
    try {
      await finished
    } catch {
      // The original validation error is more useful than the abort error.
    }
    throw error
  }
}

export function createPersistedSnapshot(
  document: GraphDocument,
  assets: Readonly<Record<string, LocalImageAsset>>,
  savedAt: string,
): PersistedEditorSnapshot {
  return {
    document,
    assets: Object.values(assets).map(storeLocalImageAsset),
    savedAt,
  }
}

export class IndexedDbProjectRepository implements ProjectRepository {
  private readonly database: Promise<IDBDatabase>

  constructor(factory: IDBFactory, databaseName = DATABASE_NAME) {
    this.database = openDatabase(factory, databaseName).then(
      async (database) => {
        await migrateLegacyProject(database)
        return database
      },
    )
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const database = await this.database
    const transaction = database.transaction(PROJECTS_STORE, 'readonly')
    const finished = transactionFinished(transaction)
    const values = await requestResult(
      transaction.objectStore(PROJECTS_STORE).getAll(),
    )
    await finished
    return values
      .map((value) => {
        const parsed = parseProjectRecord(value)
        if (!parsed) {
          throw new ProjectPersistenceError('本地项目列表包含空记录')
        }
        return projectSummary(parsed.document.id, parsed)
      })
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
  }

  async loadActiveProject(): Promise<LoadedProject | null> {
    const database = await this.database
    const transaction = database.transaction(SETTINGS_STORE, 'readonly')
    const finished = transactionFinished(transaction)
    const settingValue = await requestResult(
      transaction.objectStore(SETTINGS_STORE).get(ACTIVE_PROJECT_KEY),
    )
    await finished
    const activeProjectId =
      typeof settingValue === 'object' &&
      settingValue !== null &&
      typeof (settingValue as Partial<StoredSettingRecord>).value === 'string'
        ? (settingValue as StoredSettingRecord).value
        : null

    if (activeProjectId) {
      const snapshot = await this.loadProject(activeProjectId)
      if (snapshot) {
        return { projectId: activeProjectId, snapshot }
      }
    }

    const projects = await this.listProjects()
    const fallbackProject = projects[0]
    if (!fallbackProject) return null
    const snapshot = await this.loadProject(fallbackProject.id)
    if (!snapshot) return null
    await this.setActiveProject(fallbackProject.id)
    return { projectId: fallbackProject.id, snapshot }
  }

  async loadProject(
    projectId: string,
  ): Promise<PersistedEditorSnapshot | null> {
    const database = await this.database
    const transaction = database.transaction(
      [PROJECTS_STORE, ASSETS_STORE],
      'readonly',
    )
    const finished = transactionFinished(transaction)
    const projectRequest = transaction
      .objectStore(PROJECTS_STORE)
      .get(projectId)
    const assetsRequest = transaction
      .objectStore(ASSETS_STORE)
      .index(ASSETS_PROJECT_INDEX)
      .getAll(projectId)
    const [projectValue, assetValues] = await Promise.all([
      requestResult(projectRequest),
      requestResult(assetsRequest),
    ])
    await finished
    const project = parseProjectRecord(projectValue, projectId)
    if (!project) return null

    return {
      ...project,
      assets: assetValues
        .map((value) => parseProjectAssetRecord(value, projectId))
        .filter((asset): asset is StoredLocalImageAsset => asset !== null),
    }
  }

  async saveProject(
    projectId: string,
    snapshot: PersistedEditorSnapshot,
  ): Promise<void> {
    if (snapshot.document.id !== projectId) {
      throw new ProjectPersistenceError('项目 ID 与文档 ID 不一致')
    }
    parseSavedAt(snapshot.savedAt)
    const database = await this.database
    const transaction = database.transaction(
      [PROJECTS_STORE, ASSETS_STORE],
      'readwrite',
    )
    const finished = transactionFinished(transaction)
    transaction.objectStore(PROJECTS_STORE).put({
      id: projectId,
      storageVersion: STORAGE_VERSION,
      document: snapshot.document,
      savedAt: snapshot.savedAt,
    } satisfies StoredProjectRecord)
    const assetsStore = transaction.objectStore(ASSETS_STORE)
    const existingAssetKeys = await requestResult(
      assetsStore.index(ASSETS_PROJECT_INDEX).getAllKeys(projectId),
    )
    existingAssetKeys.forEach((key) => assetsStore.delete(key))
    snapshot.assets.forEach((asset) =>
      assetsStore.put({
        projectId,
        ...asset,
      } satisfies StoredProjectAssetRecord),
    )
    await finished
  }

  async setActiveProject(projectId: string): Promise<void> {
    const database = await this.database
    const transaction = database.transaction(
      [PROJECTS_STORE, SETTINGS_STORE],
      'readwrite',
    )
    const finished = transactionFinished(transaction)
    const project = await requestResult(
      transaction.objectStore(PROJECTS_STORE).get(projectId),
    )
    if (project === undefined) {
      transaction.abort()
      try {
        await finished
      } catch {
        // Surface the clearer missing-project error below.
      }
      throw new ProjectPersistenceError('要打开的本地项目不存在')
    }
    transaction.objectStore(SETTINGS_STORE).put({
      key: ACTIVE_PROJECT_KEY,
      value: projectId,
    } satisfies StoredSettingRecord)
    await finished
  }

  async deleteProject(projectId: string): Promise<void> {
    const database = await this.database
    const transaction = database.transaction(
      [PROJECTS_STORE, ASSETS_STORE, SETTINGS_STORE],
      'readwrite',
    )
    const finished = transactionFinished(transaction)
    const assetsStore = transaction.objectStore(ASSETS_STORE)
    const assetKeysRequest = assetsStore
      .index(ASSETS_PROJECT_INDEX)
      .getAllKeys(projectId)
    const activeSettingRequest = transaction
      .objectStore(SETTINGS_STORE)
      .get(ACTIVE_PROJECT_KEY)
    const [assetKeys, activeSetting] = await Promise.all([
      requestResult(assetKeysRequest),
      requestResult(activeSettingRequest),
    ])
    transaction.objectStore(PROJECTS_STORE).delete(projectId)
    assetKeys.forEach((key) => assetsStore.delete(key))
    if (
      typeof activeSetting === 'object' &&
      activeSetting !== null &&
      (activeSetting as Partial<StoredSettingRecord>).value === projectId
    ) {
      transaction.objectStore(SETTINGS_STORE).delete(ACTIVE_PROJECT_KEY)
    }
    await finished
  }

  async close(): Promise<void> {
    const database = await this.database
    database.close()
  }
}

export function createBrowserProjectRepository(): ProjectRepository | null {
  return typeof indexedDB === 'undefined'
    ? null
    : new IndexedDbProjectRepository(indexedDB)
}

export function persistenceErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return '浏览器存储空间不足，请移除部分图片后重试'
  }
  return error instanceof Error ? error.message : '浏览器本地保存失败'
}
