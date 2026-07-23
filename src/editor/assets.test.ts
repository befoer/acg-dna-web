import { describe, expect, it } from 'vitest'

import { readImageAssetSource } from './assets'

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
        thumbnailUrl: 'https://bangumi-api.acg-dna.top/v1/image?id=32',
        downloadUrl: 'https://bangumi-api.acg-dna.top/v1/image?id=32',
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
})
