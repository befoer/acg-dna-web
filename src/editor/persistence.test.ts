import { IDBFactory } from 'fake-indexeddb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createStarterGraph } from '../domain/graph'
import type { LocalImageAsset } from './assets'
import {
  createPersistedSnapshot,
  IndexedDbProjectRepository,
  type PersistedEditorSnapshot,
} from './persistence'

const originalStructuredClone = globalThis.structuredClone

beforeAll(() => {
  Object.defineProperty(globalThis, 'structuredClone', {
    configurable: true,
    value: <T>(value: T): T => value,
    writable: true,
  })
})

afterAll(() => {
  if (originalStructuredClone) {
    globalThis.structuredClone = originalStructuredClone
  } else {
    Reflect.deleteProperty(globalThis, 'structuredClone')
  }
})

describe('project persistence snapshot', () => {
  it('stores document JSON and Blob metadata without runtime image objects', () => {
    const document = createStarterGraph('2026-07-16T00:00:00.000Z')
    const blob = new Blob(['image'], { type: 'image/png' })
    const asset: LocalImageAsset = {
      id: 'asset-test',
      fileName: 'test.png',
      mimeType: 'image/png',
      byteLength: blob.size,
      blob,
      objectUrl: 'blob:test',
      image: documentImage(),
    }

    const snapshot = createPersistedSnapshot(
      document,
      { [asset.id]: asset },
      '2026-07-16T01:00:00.000Z',
    )

    expect(snapshot.document).toBe(document)
    expect(snapshot.assets).toHaveLength(1)
    expect(snapshot.assets[0]).toEqual({
      id: 'asset-test',
      fileName: 'test.png',
      mimeType: 'image/png',
      byteLength: blob.size,
      blob,
    })
    expect(snapshot.assets[0]).not.toHaveProperty('objectUrl')
    expect(snapshot.assets[0]).not.toHaveProperty('image')
  })
})

function documentImage(): HTMLImageElement {
  return window.document.createElement('img')
}

function storedSnapshot(
  projectId: string,
  name: string,
  assetId: string,
  savedAt: string,
): PersistedEditorSnapshot {
  const document = createStarterGraph(savedAt)
  document.id = projectId
  document.name = name
  document.categories[0]!.attributes[0]!.imageAssetId = assetId
  const blob = new Blob([projectId], { type: 'image/png' })
  return {
    document,
    savedAt,
    assets: [
      {
        id: assetId,
        fileName: assetId + '.png',
        mimeType: 'image/png',
        byteLength: blob.size,
        blob,
      },
    ],
  }
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function seedLegacyDatabase(
  factory: IDBFactory,
  databaseName: string,
  snapshot: PersistedEditorSnapshot,
  databaseVersion = 1,
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('projects', { keyPath: 'key' })
      request.result.createObjectStore('assets', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const transaction = database.transaction(['projects', 'assets'], 'readwrite')
  transaction.objectStore('projects').put({
    key: 'current',
    storageVersion: 1,
    document: snapshot.document,
    savedAt: snapshot.savedAt,
  })
  snapshot.assets.forEach((asset) =>
    transaction.objectStore('assets').put(asset),
  )
  await transactionComplete(transaction)
  database.close()
}

describe('IndexedDB project library', () => {
  it('keeps documents and image blobs isolated per project', async () => {
    const factory = new IDBFactory()
    const repository = new IndexedDbProjectRepository(
      factory,
      'project-isolation',
    )
    const first = storedSnapshot(
      'graph-first',
      '第一个项目',
      'asset-first',
      '2026-07-16T01:00:00.000Z',
    )
    const second = storedSnapshot(
      'graph-second',
      '第二个项目',
      'asset-second',
      '2026-07-16T02:00:00.000Z',
    )

    await repository.saveProject(first.document.id, first)
    await repository.saveProject(second.document.id, second)
    await repository.setActiveProject(first.document.id)

    const projects = await repository.listProjects()
    expect(projects.map((project) => project.name)).toEqual([
      '第二个项目',
      '第一个项目',
    ])
    const active = await repository.loadActiveProject()
    expect(active?.projectId).toBe('graph-first')
    expect(active?.snapshot.assets[0]?.id).toBe('asset-first')
    expect((await repository.loadProject('graph-second'))?.assets[0]?.id).toBe(
      'asset-second',
    )

    await repository.deleteProject('graph-first')
    expect(await repository.loadProject('graph-first')).toBeNull()
    expect((await repository.loadProject('graph-second'))?.document.name).toBe(
      '第二个项目',
    )
    await repository.close()
  })
})

describe('IndexedDB legacy migration', () => {
  it('copies the old current project without deleting the legacy record', async () => {
    const factory = new IDBFactory()
    const databaseName = 'legacy-migration'
    const legacy = storedSnapshot(
      'graph-legacy',
      '旧版项目',
      'asset-legacy',
      '2026-07-16T03:00:00.000Z',
    )
    await seedLegacyDatabase(factory, databaseName, legacy)

    const repository = new IndexedDbProjectRepository(factory, databaseName)
    const active = await repository.loadActiveProject()
    expect(active?.projectId).toBe('graph-legacy')
    expect(active?.snapshot.document.name).toBe('旧版项目')
    expect(active?.snapshot.assets[0]?.id).toBe('asset-legacy')
    await repository.close()

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(databaseName, 3)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('projects', 'readonly')
    const request = transaction.objectStore('projects').get('current')
    const legacyRecord = await new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await transactionComplete(transaction)
    expect(legacyRecord).toMatchObject({
      key: 'current',
      storageVersion: 1,
    })
    database.close()
  })

  it('repairs an intermediate v2 database that only has legacy stores', async () => {
    const factory = new IDBFactory()
    const databaseName = 'intermediate-v2-repair'
    const legacy = storedSnapshot(
      'graph-v2-legacy',
      '中间态项目',
      'asset-v2-legacy',
      '2026-07-16T04:00:00.000Z',
    )
    await seedLegacyDatabase(factory, databaseName, legacy, 2)

    const repository = new IndexedDbProjectRepository(factory, databaseName)
    const active = await repository.loadActiveProject()

    expect(active?.projectId).toBe('graph-v2-legacy')
    expect(active?.snapshot.document.name).toBe('中间态项目')
    expect(active?.snapshot.assets[0]?.id).toBe('asset-v2-legacy')
    expect(await repository.listProjects()).toHaveLength(1)
    await repository.close()
  })
})
