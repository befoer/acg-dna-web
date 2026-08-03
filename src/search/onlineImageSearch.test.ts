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
    vi.useRealTimers()
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
              alternateName: '小叽',
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
    expect(response.results[0]).toMatchObject({
      name: '小叽',
      nativeName: 'ちぃ',
      alternateName: 'ちぃ',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain(
      'https://bangumi-api.acg-dna.top/v1/search',
    )
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('kind=character')
  })

  it('reuses a recent provider response without another API request', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ results: [], queryHints: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await searchOnlineImages('小叽', 'character')
    await searchOnlineImages('小叽', 'character')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('allows one-character names such as 白', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [], queryHints: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await searchOnlineImages('白', 'character')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('passes game and singer kinds to the restricted gateway', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ results: [], queryHints: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await searchOnlineImages('蔚蓝档案', 'game')
    await searchOnlineImages('宇多田光', 'singer')

    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('kind=game')
    expect(fetchMock.mock.calls[1]?.[0].toString()).toContain('kind=singer')
  })

  it('uses preferred game and singer foreign names as secondary text', async () => {
    const responses = [
      {
        id: '1',
        name: 'ブルーアーカイブ',
        alternateName: '蔚蓝档案',
        foreignName: 'Blue Archive',
        thumbnailUrl: 'https://gateway.example/game.jpg',
        downloadUrl: 'https://gateway.example/game.jpg',
        originalUrl: 'https://lain.bgm.tv/pic/cover/l/game.jpg',
        sourceUrl: 'https://bgm.tv/subject/1',
      },
      {
        id: '2',
        name: '宇多田ヒカル',
        alternateName: '宇多田光',
        foreignName: '宇多田ヒカル',
        thumbnailUrl: 'https://gateway.example/singer.jpg',
        downloadUrl: 'https://gateway.example/singer.jpg',
        originalUrl: 'https://lain.bgm.tv/pic/crt/l/singer.jpg',
        sourceUrl: 'https://bgm.tv/person/2',
      },
    ]
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ results: [responses.shift()], queryHints: [] }),
            { status: 200 },
          ),
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const game = await searchOnlineImages('蔚蓝档案', 'game')
    const singer = await searchOnlineImages('宇多田光', 'singer')

    expect(game.results[0]).toMatchObject({
      name: '蔚蓝档案',
      alternateName: 'Blue Archive',
    })
    expect(singer.results[0]).toMatchObject({
      name: '宇多田光',
      alternateName: '宇多田ヒカル',
    })
  })

  it('converts browser fetch failures to a Chinese provider error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )

    await expect(searchOnlineImages('小叽', 'character')).rejects.toThrow(
      '无法连接 Bangumi 搜索服务，请检查网络后重试',
    )
  })

  it('stops a stalled Bangumi request with a retryable Chinese timeout error', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              { once: true },
            )
          }),
      ),
    )

    const search = searchOnlineImages('小叽', 'character')
    const rejection =
      expect(search).rejects.toThrow('Bangumi 搜索超时，请稍后重试')
    await vi.advanceTimersByTimeAsync(15_000)

    await rejection
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

  it('honors AniList retry guidance before sending another request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ errors: [{ message: 'Too Many Requests' }] }),
        {
          status: 429,
          headers: { 'Retry-After': '30' },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      searchOnlineImages('後藤ひとり', 'character', { provider: 'anilist' }),
    ).rejects.toThrow('请在 30 秒后重试')
    await expect(
      searchOnlineImages('伊地知虹夏', 'character', { provider: 'anilist' }),
    ).rejects.toThrow('请在 30 秒后重试')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
