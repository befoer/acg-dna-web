const FONT_DATABASE_NAME = 'acg-dna-font-library'
const FONT_DATABASE_VERSION = 1
const FONT_STORE = 'fonts'

export interface StoredLocalFont {
  id: string
  name: string
  mimeType: string
  byteLength: number
  createdAt: string
  blob: Blob
}

let databasePromise: Promise<IDBDatabase> | null = null

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('本地字体数据库请求失败'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('本地字体数据库事务失败'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('本地字体数据库事务已中止'))
  })
}

function openFontDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持 IndexedDB'))
      return
    }
    const request = indexedDB.open(FONT_DATABASE_NAME, FONT_DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(FONT_STORE)) {
        database.createObjectStore(FONT_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => {
      databasePromise = null
      reject(request.error ?? new Error('无法打开本地字体数据库'))
    }
    request.onblocked = () => {
      databasePromise = null
      reject(new Error('本地字体数据库被其他页面阻塞'))
    }
  })
  return databasePromise
}

export async function saveStoredLocalFont(
  font: StoredLocalFont,
): Promise<void> {
  const database = await openFontDatabase()
  const transaction = database.transaction(FONT_STORE, 'readwrite')
  const completion = transactionDone(transaction)
  transaction.objectStore(FONT_STORE).put(font)
  await completion
}

export async function loadStoredLocalFont(
  fontId: string,
): Promise<StoredLocalFont | null> {
  const database = await openFontDatabase()
  const transaction = database.transaction(FONT_STORE, 'readonly')
  const completion = transactionDone(transaction)
  const value = await requestResult(
    transaction.objectStore(FONT_STORE).get(fontId),
  )
  await completion
  if (
    typeof value !== 'object' ||
    value === null ||
    !('blob' in value) ||
    !(value.blob instanceof Blob)
  ) {
    return null
  }
  return value as StoredLocalFont
}
