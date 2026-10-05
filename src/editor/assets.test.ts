import { describe, expect, it, vi } from 'vitest'

import {
  loadOnlineImageAsset,
  readImageAssetSource,
  storeLocalImageAsset,
} from './assets'

describe('image asset source', () => {
  it('preserves the Bangumi search seed used for AniList candidates', () => {
    const source = readImageAssetSource({
      provider: 'anilist',
      externalId: '123',
      sourceUrl: 'https://anilist.co/character/123',
      originalUrl: 'https://s4.anilist.co/file/character.jpg',
      fetchedAt: '2026-07-20T10:00:00.000Z',
      searchSeed: {
        provider: 'bangumi',
        externalId: '32',
        kind: 'character',
        name: '小叽',
        nativeName: 'ちぃ',
        alternateName: 'ちぃ',
        thumbnailUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
        downloadUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
        originalUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
        sourceUrl: 'https://bgm.tv/character/32',
      },
    })

    expect(source?.searchSeed).toMatchObject({
      provider: 'bangumi',
      externalId: '32',
      name: '小叽',
      nativeName: 'ちぃ',
    })
  })

  it('stores a Bangumi image URL without downloading the image', async () => {
    class FakeImage {
      decoding = 'auto'
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private currentSrc = ''

      set src(value: string) {
        this.currentSrc = value
        queueMicrotask(() => this.onload?.())
      }

      get src() {
        return this.currentSrc
      }
    }
    const fetchMock = vi.fn()
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('fetch', fetchMock)

    const asset = await loadOnlineImageAsset({
      provider: 'bangumi',
      externalId: '32',
      kind: 'character',
      name: '小叽',
      thumbnailUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
      downloadUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
      originalUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
      sourceUrl: 'https://bgm.tv/character/32',
    })
    const stored = storeLocalImageAsset(asset)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(asset.remoteUrl).toBe('https://lain.bgm.tv/pic/crt/l/example.jpg')
    expect(asset.objectUrl).toBe(asset.remoteUrl)
    expect(stored).toMatchObject({
      remoteUrl: asset.remoteUrl,
      byteLength: 0,
    })
    vi.unstubAllGlobals()
  })
})
