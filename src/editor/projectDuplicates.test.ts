import { describe, expect, it } from 'vitest'

import { createStarterGraph } from '../domain/graph'
import {
  findDuplicateProjectIds,
  type ProjectSnapshotEntry,
} from './projectDuplicates'

function entry(
  id: string,
  savedAt: string,
  blobText: string,
): ProjectSnapshotEntry {
  const document = createStarterGraph(savedAt)
  document.id = id
  return {
    summary: {
      id,
      name: document.name,
      createdAt: savedAt,
      updatedAt: savedAt,
      savedAt,
    },
    snapshot: {
      document,
      savedAt,
      assets: [
        {
          id: 'asset-shared',
          fileName: 'image.png',
          mimeType: 'image/png',
          byteLength: blobText.length,
          blob: new Blob([blobText], { type: 'image/png' }),
        },
      ],
    },
  }
}

describe('duplicate project detection', () => {
  it('ignores project identity and timestamps while keeping the active copy', async () => {
    const oldCopy = entry('graph-old', '2026-07-17T01:00:00.000Z', 'same')
    const activeCopy = entry('graph-active', '2026-07-17T02:00:00.000Z', 'same')

    await expect(
      findDuplicateProjectIds([oldCopy, activeCopy], activeCopy.summary.id),
    ).resolves.toEqual(['graph-old'])
  })

  it('does not merge projects whose image bytes differ', async () => {
    const first = entry('graph-first', '2026-07-17T01:00:00.000Z', 'first')
    const second = entry('graph-second', '2026-07-17T02:00:00.000Z', 'other')

    await expect(
      findDuplicateProjectIds([first, second], first.summary.id),
    ).resolves.toEqual([])
  })
})
