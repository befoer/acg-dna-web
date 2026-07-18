export type OnlineImageProvider = 'bangumi' | 'anilist'

export type OnlineImageKind = 'character' | 'anime'

export interface OnlineImageSearchResult {
  provider: OnlineImageProvider
  externalId: string
  kind: OnlineImageKind
  name: string
  alternateName?: string
  subtitle?: string
  thumbnailUrl: string
  downloadUrl: string
  originalUrl: string
  sourceUrl: string
}

export interface OnlineImageSearchResponse {
  provider: OnlineImageProvider
  results: OnlineImageSearchResult[]
  queryHints?: string[]
  bangumiTransport?: 'direct' | 'gateway'
  rateLimit?: {
    limit: number | null
    remaining: number | null
    retryAfterSeconds: number | null
  }
}

export const DEFAULT_BANGUMI_GATEWAY_URL = 'https://bangumi-api.acg-dna.top'

const BANGUMI_GATEWAY_URL = (
  import.meta.env.VITE_BANGUMI_GATEWAY_URL || DEFAULT_BANGUMI_GATEWAY_URL
).replace(/\/$/, '')

const BANGUMI_SEARCH_MODE =
  import.meta.env.VITE_BANGUMI_SEARCH_MODE === 'direct' ? 'direct' : 'gateway'

const BANGUMI_API_URL = 'https://api.bgm.tv'

const SEARCH_LIMIT = 18
const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  expiresAt: number
  response: OnlineImageSearchResponse
}

const resultCache = new Map<string, CacheEntry>()

export class OnlineImageSearchError extends Error {
  retryAfterSeconds: number | null

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'OnlineImageSearchError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function requiredString(value: unknown, field: string): string {
  const parsed = optionalString(value)
  if (!parsed) throw new OnlineImageSearchError('搜索结果缺少 ' + field)
  return parsed
}

function parseBangumiResult(
  value: unknown,
  kind: OnlineImageKind,
): OnlineImageSearchResult | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  try {
    return {
      provider: 'bangumi',
      externalId: requiredString(String(record.id ?? ''), 'ID'),
      kind,
      name: requiredString(record.name, '名称'),
      ...(optionalString(record.alternateName)
        ? { alternateName: optionalString(record.alternateName) }
        : {}),
      ...(optionalString(record.subtitle)
        ? { subtitle: optionalString(record.subtitle) }
        : {}),
      thumbnailUrl: requiredString(record.thumbnailUrl, '缩略图'),
      downloadUrl: requiredString(record.downloadUrl, '下载地址'),
      originalUrl: requiredString(record.originalUrl, '原始图片地址'),
      sourceUrl: requiredString(record.sourceUrl, '来源页面'),
    }
  } catch {
    return null
  }
}

function parseBangumiQueryHints(payload: { data?: unknown[] }): string[] {
  return Array.from(
    new Set(
      (payload.data ?? []).flatMap((value) => {
        if (typeof value !== 'object' || value === null) return []
        const record = value as Record<string, unknown>
        return [record.name, record.name_cn]
          .filter((name): name is string => typeof name === 'string')
          .map((name) => name.trim())
          .filter(Boolean)
      }),
    ),
  ).slice(0, 8)
}

async function searchBangumiDirect(
  query: string,
  kind: OnlineImageKind,
  signal?: AbortSignal,
): Promise<OnlineImageSearchResponse> {
  const endpoint =
    kind === 'character' ? '/v0/search/characters' : '/v0/search/subjects'
  const body =
    kind === 'character'
      ? { keyword: query, filter: { nsfw: false } }
      : {
          keyword: query,
          sort: 'match',
          filter: { type: [2], nsfw: false },
        }
  const url = new URL(BANGUMI_API_URL + endpoint)
  url.searchParams.set('limit', String(SEARCH_LIMIT))
  url.searchParams.set('offset', '0')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    throw new OnlineImageSearchError(
      response.status === 429
        ? 'Bangumi 文字直连请求过于频繁，请稍后再试'
        : 'Bangumi 文字直连暂时不可用',
    )
  }
  const payload = (await response.json()) as { data?: unknown[] }
  const queryHints = parseBangumiQueryHints(payload)
  return {
    provider: 'bangumi',
    results: [],
    bangumiTransport: 'direct',
    ...(queryHints.length > 0 ? { queryHints } : {}),
  }
}

async function searchBangumiGateway(
  query: string,
  kind: OnlineImageKind,
  signal?: AbortSignal,
): Promise<OnlineImageSearchResponse> {
  const url = new URL(BANGUMI_GATEWAY_URL + '/v1/search')
  url.searchParams.set('query', query)
  url.searchParams.set('kind', kind)
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new OnlineImageSearchError(
      response.status === 429
        ? 'Bangumi 搜索请求过于频繁，请稍后再试'
        : 'Bangumi 搜索暂时不可用',
    )
  }
  const payload = (await response.json()) as {
    results?: unknown[]
    queryHints?: unknown[]
  }
  const queryHints = (payload.queryHints ?? [])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8)
  return {
    provider: 'bangumi',
    bangumiTransport: 'gateway',
    results: (payload.results ?? [])
      .map((item) => parseBangumiResult(item, kind))
      .filter((item): item is OnlineImageSearchResult => item !== null),
    ...(queryHints.length > 0 ? { queryHints } : {}),
  }
}

function headerNumber(headers: Headers, name: string): number | null {
  const value = headers.get(name)
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function titleText(value: {
  native?: string | null
  english?: string | null
  romaji?: string | null
}): string {
  return value.native || value.english || value.romaji || '未命名'
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

function matchesSearchQuery(query: string, values: Array<string | undefined>) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return false
  return values.some((value) => {
    if (!value) return false
    const normalizedValue = normalizeSearchText(value)
    return (
      normalizedValue.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedValue)
    )
  })
}

async function searchAniList(
  query: string,
  kind: OnlineImageKind,
  signal?: AbortSignal,
): Promise<OnlineImageSearchResponse> {
  const graphql =
    kind === 'character'
      ? `query ($search: String, $perPage: Int) {
          Page(page: 1, perPage: $perPage) {
            characters(search: $search, sort: SEARCH_MATCH) {
              id
              name { full native }
              image { large medium }
              media(perPage: 3, sort: POPULARITY_DESC) {
                nodes { isAdult title { native english romaji } }
              }
            }
          }
        }`
      : `query ($search: String, $perPage: Int) {
          Page(page: 1, perPage: $perPage) {
            media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
              id
              title { native english romaji }
              coverImage { large medium }
              isAdult
            }
          }
        }`
  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: graphql,
      variables: { search: query, perPage: SEARCH_LIMIT },
    }),
    signal,
  })
  const retryAfterSeconds = headerNumber(response.headers, 'Retry-After')
  if (response.status === 429) {
    throw new OnlineImageSearchError(
      'AniList 请求过于频繁，请稍后再试',
      retryAfterSeconds,
    )
  }
  if (!response.ok) {
    throw new OnlineImageSearchError('AniList 备用搜索暂时不可用')
  }
  const payload = (await response.json()) as {
    data?: {
      Page?: {
        characters?: Array<{
          id: number
          name?: { full?: string; native?: string }
          image?: { large?: string; medium?: string }
          media?: {
            nodes?: Array<{
              isAdult?: boolean
              title?: {
                native?: string
                english?: string
                romaji?: string
              }
            }>
          }
        }>
        media?: Array<{
          id: number
          isAdult?: boolean
          title?: {
            native?: string
            english?: string
            romaji?: string
          }
          coverImage?: { large?: string; medium?: string }
        }>
      }
    }
    errors?: Array<{ message?: string }>
  }
  if (payload.errors?.length) {
    throw new OnlineImageSearchError(
      payload.errors[0]?.message || 'AniList 返回了搜索错误',
    )
  }
  const results: OnlineImageSearchResult[] = []
  if (kind === 'character') {
    for (const character of payload.data?.Page?.characters ?? []) {
      const imageUrl = character.image?.large || character.image?.medium
      const safeMedia = (character.media?.nodes ?? []).filter(
        (media) => media.isAdult !== true,
      )
      if (
        !imageUrl ||
        safeMedia.length === 0 ||
        !matchesSearchQuery(query, [
          character.name?.native,
          character.name?.full,
        ])
      ) {
        continue
      }
      results.push({
        provider: 'anilist',
        externalId: String(character.id),
        kind,
        name: character.name?.native || character.name?.full || '未命名',
        ...(character.name?.native && character.name?.full
          ? { alternateName: character.name.full }
          : {}),
        ...(safeMedia[0]?.title
          ? { subtitle: titleText(safeMedia[0].title) }
          : {}),
        thumbnailUrl: imageUrl,
        downloadUrl: imageUrl,
        originalUrl: imageUrl,
        sourceUrl: `https://anilist.co/character/${character.id}`,
      })
    }
  } else {
    for (const media of payload.data?.Page?.media ?? []) {
      const imageUrl = media.coverImage?.large || media.coverImage?.medium
      if (
        !imageUrl ||
        media.isAdult === true ||
        !media.title ||
        !matchesSearchQuery(query, [
          media.title.native,
          media.title.english,
          media.title.romaji,
        ])
      ) {
        continue
      }
      results.push({
        provider: 'anilist',
        externalId: String(media.id),
        kind,
        name: titleText(media.title),
        thumbnailUrl: imageUrl,
        downloadUrl: imageUrl,
        originalUrl: imageUrl,
        sourceUrl: `https://anilist.co/anime/${media.id}`,
      })
    }
  }
  return {
    provider: 'anilist',
    results,
    rateLimit: {
      limit: headerNumber(response.headers, 'X-RateLimit-Limit'),
      remaining: headerNumber(response.headers, 'X-RateLimit-Remaining'),
      retryAfterSeconds,
    },
  }
}

async function cachedSearch(
  provider: OnlineImageProvider,
  query: string,
  kind: OnlineImageKind,
  signal?: AbortSignal,
): Promise<OnlineImageSearchResponse> {
  const key = provider + ':' + kind + ':' + query.toLocaleLowerCase()
  const cached = resultCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.response
  const response =
    provider === 'bangumi'
      ? BANGUMI_SEARCH_MODE === 'direct'
        ? await searchBangumiDirect(query, kind, signal)
        : await searchBangumiGateway(query, kind, signal)
      : await searchAniList(query, kind, signal)
  resultCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, response })
  return response
}

export async function searchOnlineImages(
  query: string,
  kind: OnlineImageKind,
  options: {
    provider?: OnlineImageProvider
    signal?: AbortSignal
  } = {},
): Promise<OnlineImageSearchResponse> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length < 2) {
    throw new OnlineImageSearchError('请至少输入 2 个字符')
  }
  return cachedSearch(
    options.provider ?? 'bangumi',
    normalizedQuery,
    kind,
    options.signal,
  )
}

export function clearOnlineImageSearchCache(): void {
  resultCache.clear()
}
