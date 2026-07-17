import type { PersistedEditorSnapshot, ProjectSummary } from './persistence'

export interface ProjectSnapshotEntry {
  summary: ProjectSummary
  snapshot: PersistedEditorSnapshot
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  )
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('当前浏览器不支持重复项目指纹检查')
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
}

export async function projectContentFingerprint(
  snapshot: PersistedEditorSnapshot,
): Promise<string> {
  const documentContent = Object.fromEntries(
    Object.entries(snapshot.document).filter(
      ([key]) => key !== 'id' && key !== 'createdAt' && key !== 'updatedAt',
    ),
  )
  const assets = []
  for (const asset of [...snapshot.assets].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    assets.push({
      id: asset.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      byteLength: asset.byteLength,
      digest: await sha256Hex(await asset.blob.arrayBuffer()),
    })
  }
  return JSON.stringify(stableValue({ document: documentContent, assets }))
}

export async function findDuplicateProjectIds(
  entries: ProjectSnapshotEntry[],
  activeProjectId: string | null,
): Promise<string[]> {
  const groups = new Map<string, ProjectSnapshotEntry[]>()
  for (const entry of entries) {
    const fingerprint = await projectContentFingerprint(entry.snapshot)
    groups.set(fingerprint, [...(groups.get(fingerprint) ?? []), entry])
  }

  const duplicateIds: string[] = []
  groups.forEach((group) => {
    if (group.length < 2) return
    const newestFirst = [...group].sort((left, right) =>
      right.summary.savedAt.localeCompare(left.summary.savedAt),
    )
    const keeper =
      newestFirst.find((entry) => entry.summary.id === activeProjectId) ??
      newestFirst[0]
    newestFirst.forEach((entry) => {
      if (entry.summary.id !== keeper?.summary.id) {
        duplicateIds.push(entry.summary.id)
      }
    })
  })
  return duplicateIds
}
