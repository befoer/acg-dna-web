import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearOnlineImageSearchCache,
  searchOnlineImages,
} from './onlineImageSearch'

describe('online image search', () => {
  beforeEach(() => {
    clearOnlineImageSearchCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the restricted Bangumi gateway by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: '32',
              name: 'ちぃ',
              thumbnailUrl: 'https://bangumi-api.acg-dna.top/v1/image?id=32',
              downloadUrl: 'https://bangumi-api.acg-dna.top/v1/image?id=32',
              originalUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
              sourceUrl: 'https://bgm.tv/character/32',
            },
          ],
          queryHints: ['ちぃ', '小叽'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await searchOnlineImages('小叽', 'character')

    expect(response.provider).toBe('bangumi')
    expect(response.bangumiTransport).toBe('gateway')
    expect(response.queryHints).toEqual(['ちぃ', '小叽'])
    expect(response.results).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain(
      'https://bangumi-api.acg-dna.top/v1/search',
    )
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('kind=character')
  })

  it('filters unrelated AniList popularity results for unsupported Chinese queries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            Page: {
              characters: [
                {
                  id: 1,
                  name: { full: 'Hitori Gotoh', native: '後藤ひとり' },
                  image: { large: 'https://s4.anilist.co/file/image.jpg' },
                  media: {
                    nodes: [
                      {
                        isAdult: false,
                        title: { native: 'ぼっち・ざ・ろっく！' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await searchOnlineImages('后藤一里', 'character', {
      provider: 'anilist',
    })

    expect(response.provider).toBe('anilist')
    expect(response.results).toEqual([])
  })

  it('accepts AniList results found with a Bangumi Japanese name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            Page: {
              characters: [
                {
                  id: 1,
                  name: { full: 'Hitori Gotoh', native: '後藤ひとり' },
                  image: { large: 'https://s4.anilist.co/file/image.jpg' },
                  media: {
                    nodes: [
                      {
                        isAdult: false,
                        title: { native: 'ぼっち・ざ・ろっく！' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': '30',
            'X-RateLimit-Remaining': '29',
          },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await searchOnlineImages('後藤ひとり', 'character', {
      provider: 'anilist',
    })

    expect(response.results[0]).toMatchObject({
      provider: 'anilist',
      externalId: '1',
      name: '後藤ひとり',
      subtitle: 'ぼっち・ざ・ろっく！',
    })
    expect(response.rateLimit).toEqual({
      limit: 30,
      remaining: 29,
      retryAfterSeconds: null,
    })
  })
})
