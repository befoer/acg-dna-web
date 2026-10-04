import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearOnlineImageSearchCache,
  searchBangumiWorks,
  searchBangumiSubjectCharacters,
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

  it('uses the official Bangumi API and Chinese infobox names by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: '32',
              name: 'ちぃ',
              infobox: [{ key: '简体中文名', value: '小叽' }],
              images: { large: 'https://lain.bgm.tv/pic/crt/l/example.jpg' },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await searchOnlineImages('小叽', 'character')

    expect(response.provider).toBe('bangumi')
    expect(response.bangumiTransport).toBe('direct')
    expect(response.results).toHaveLength(1)
    expect(response.results[0]).toMatchObject({
      name: '小叽',
      nativeName: 'ちぃ',
      alternateName: 'ちぃ',
      downloadUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain(
      'https://api.bgm.tv/v0/search/characters',
    )
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('limit=18')
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
      keyword: '小叽',
      filter: { nsfw: false },
    })
  })

  it('reuses a recent provider response without another API request', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [] }), {
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
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await searchOnlineImages('白', 'character')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('filters games and singers through official subject and person endpoints', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await searchOnlineImages('蔚蓝档案', 'game')
    await searchOnlineImages('宇多田光', 'singer')

    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain(
      '/v0/search/subjects',
    )
    expect(fetchMock.mock.calls[1]?.[0].toString()).toContain(
      '/v0/search/persons',
    )
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).filter.type).toEqual([
      4,
    ])
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body).filter.career).toEqual(
      ['artist'],
    )
  })

  it('uses preferred game and singer foreign names as secondary text', async () => {
    const responses = [
      {
        id: '1',
        name: 'ブルーアーカイブ',
        name_cn: '蔚蓝档案',
        infobox: [{ key: '别名', value: [{ k: '英文名', v: 'Blue Archive' }] }],
        images: { large: 'https://lain.bgm.tv/pic/cover/l/game.jpg' },
      },
      {
        id: '2',
        name: '宇多田ヒカル',
        infobox: [{ key: '简体中文名', value: '宇多田光' }],
        images: { large: 'https://lain.bgm.tv/pic/crt/l/singer.jpg' },
      },
    ]
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [responses.shift()] }), {
          status: 200,
        }),
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

  it('skips missing images instead of fabricating broken URLs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: 1, name: '没有图片' },
              {
                id: 2,
                name: '限制内容',
                nsfw: true,
                images: { large: 'https://lain.bgm.tv/pic/crt/l/2.jpg' },
              },
            ],
          }),
        ),
      ),
    )
    expect((await searchOnlineImages('角色', 'character')).results).toEqual([])
  })

  it('finds books, anime and games then reads the selected work characters directly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 3,
                type: 1,
                name: '原名',
                name_cn: '作品',
                images: { large: 'https://lain.bgm.tv/pic/cover/l/3.jpg' },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 32,
              name: 'ちぃ',
              images: { large: 'https://lain.bgm.tv/pic/crt/l/32.jpg' },
            },
          ]),
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    const works = await searchBangumiWorks('作品')
    expect(works[0]).toMatchObject({
      name: '作品',
      nativeName: '原名',
      subjectType: 1,
    })
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).filter.type).toEqual([
      1, 2, 4,
    ])
    expect(await searchBangumiSubjectCharacters(works[0]!)).toEqual([
      expect.objectContaining({
        externalId: '32',
        name: 'ちぃ',
        subtitle: '作品',
        sourceUrl: 'https://bgm.tv/character/32',
      }),
    ])
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe(
      'https://api.bgm.tv/v0/subjects/3/characters',
    )
  })

  it('converts browser fetch failures to a Chinese provider error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )

    await expect(searchOnlineImages('小叽', 'character')).rejects.toThrow(
      '无法连接 Bangumi，请检查网络后重试',
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
    const rejection = expect(search).rejects.toThrow(
      'Bangumi 文字搜索超时，请稍后重试',
    )
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
