import { describe, expect, it } from 'vitest'

import { createStarterGraph } from '../domain/graph'
import type { PersistedEditorSnapshot } from './persistence'
import {
  createProjectFileName,
  parseProjectFileText,
  ProjectFileError,
  serializeProjectFile,
} from './projectFile'

const EXPORTED_AT = '2026-07-16T08:00:00.000Z'

function snapshotWithImage(): PersistedEditorSnapshot {
  const document = createStarterGraph('2026-07-16T07:00:00.000Z')
  document.categories[0]!.attributes[0]!.imageAssetId = 'asset-cover'
  document.categories[0]!.attributes[0]!.imageTransform = {
    zoom: 1.6,
    offsetX: 0.25,
    offsetY: -0.4,
    rotation: 20,
  }
  const blob = new Blob([new Uint8Array([0, 1, 2, 253, 254, 255])], {
    type: 'image/png',
  })
  return {
    document,
    savedAt: EXPORTED_AT,
    assets: [
      {
        id: 'asset-cover',
        fileName: 'cover.png',
        mimeType: 'image/png',
        byteLength: blob.size,
        blob,
      },
    ],
  }
}

describe('portable project file', () => {
  it('round-trips a versioned document and embedded image bytes', async () => {
    const serialized = await serializeProjectFile(
      snapshotWithImage(),
      EXPORTED_AT,
    )
    const parsed = parseProjectFileText(serialized)

    expect(parsed.document.name).toBe('我的 ACG DNA')
    expect(parsed.savedAt).toBe(EXPORTED_AT)
    expect(
      parsed.document.categories[0]!.attributes[0]!.imageTransform,
    ).toEqual({
      zoom: 1.6,
      offsetX: 0.25,
      offsetY: -0.4,
      rotation: 20,
    })
    expect(parsed.assets).toHaveLength(1)
    expect(parsed.assets[0]).toMatchObject({
      id: 'asset-cover',
      fileName: 'cover.png',
      mimeType: 'image/png',
      byteLength: 6,
    })
    expect(
      Array.from(new Uint8Array(await parsed.assets[0]!.blob.arrayBuffer())),
    ).toEqual([0, 1, 2, 253, 254, 255])
  })

  it('rejects unsupported versions and missing referenced images', async () => {
    const serialized = await serializeProjectFile(
      snapshotWithImage(),
      EXPORTED_AT,
    )
    const unsupported = JSON.parse(serialized) as Record<string, unknown>
    unsupported.fileVersion = 2
    expect(() => parseProjectFileText(JSON.stringify(unsupported))).toThrow(
      /不支持的项目文件版本/,
    )

    const missingAsset = JSON.parse(serialized) as Record<string, unknown>
    missingAsset.assets = []
    expect(() => parseProjectFileText(JSON.stringify(missingAsset))).toThrow(
      ProjectFileError,
    )
  })

  it('creates a portable and recognizable file name', () => {
    expect(createProjectFileName('  ACG:DNA/测试.  ')).toBe(
      'ACG-DNA-测试.acgdna.json',
    )
    expect(createProjectFileName('   ')).toBe('未命名属性图.acgdna.json')
  })

  it('embeds a referenced local profile avatar', async () => {
    const document = createStarterGraph('2026-07-16T07:00:00.000Z')
    document.profile.avatarAssetId = 'asset-avatar'
    document.profile.avatarTransform = {
      zoom: 2,
      offsetX: -0.5,
      offsetY: 0.2,
      rotation: -90,
    }
    const blob = new Blob(['avatar'], { type: 'image/png' })
    const serialized = await serializeProjectFile(
      {
        document,
        savedAt: EXPORTED_AT,
        assets: [
          {
            id: 'asset-avatar',
            fileName: 'avatar.png',
            mimeType: 'image/png',
            byteLength: blob.size,
            blob,
          },
        ],
      },
      EXPORTED_AT,
    )
    const parsed = parseProjectFileText(serialized)

    expect(parsed.document.profile.avatarAssetId).toBe('asset-avatar')
    expect(parsed.document.profile.avatarTransform).toEqual({
      zoom: 2,
      offsetX: -0.5,
      offsetY: 0.2,
      rotation: -90,
    })
    expect(parsed.assets).toHaveLength(1)
  })

  it('embeds and restores free local decoration image assets', async () => {
    const document = createStarterGraph('2026-07-16T07:00:00.000Z')
    document.decoration.images = [
      {
        id: 'decoration-image-one',
        name: '自由图片.webp',
        assetId: 'asset-decoration-image',
        visible: true,
        x: 0.65,
        y: 0.25,
        size: 0.42,
        rotation: 15,
        opacity: 0.8,
      },
    ]
    const blob = new Blob(['decoration-image'], { type: 'image/webp' })
    const serialized = await serializeProjectFile(
      {
        document,
        savedAt: EXPORTED_AT,
        assets: [
          {
            id: 'asset-decoration-image',
            fileName: '自由图片.webp',
            mimeType: 'image/webp',
            byteLength: blob.size,
            blob,
          },
        ],
      },
      EXPORTED_AT,
    )
    const parsed = parseProjectFileText(serialized)

    expect(parsed.document.decoration.images).toEqual(
      document.decoration.images,
    )
    expect(parsed.assets[0]?.id).toBe('asset-decoration-image')
  })

  it('keeps only a local font reference and does not embed font bytes', async () => {
    const document = createStarterGraph('2026-07-16T07:00:00.000Z')
    document.canvas.labelSettings = {
      ...document.canvas.labelSettings,
      fontFamily: 'local',
      localFontId: 'font-local-test',
      localFontName: 'my-font.woff2',
    }
    const serialized = await serializeProjectFile(
      {
        document,
        assets: [],
        savedAt: EXPORTED_AT,
      },
      EXPORTED_AT,
    )
    const record = JSON.parse(serialized) as {
      document: typeof document
      assets: unknown[]
    }

    expect(record.document.canvas.labelSettings).toMatchObject({
      fontFamily: 'local',
      localFontId: 'font-local-test',
      localFontName: 'my-font.woff2',
    })
    expect(record.assets).toEqual([])
    expect(serialized).not.toContain('data:font')
  })
})
