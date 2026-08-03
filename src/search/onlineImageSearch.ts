export type OnlineImageProvider = 'bangumi' | 'anilist'

export type OnlineImageKind = 'character' | 'anime' | 'game' | 'singer'

export interface OnlineImageSearchResult {
  provider: OnlineImageProvider
  externalId: string
  kind: OnlineImageKind
  name: string
  nativeName?: string
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

export interface OnlineWorkSearchResult {
  externalId: string
  name: string
  nativeName?: string
  alternateName?: string
  subjectType: 1 | 2 | 4
  thumbnailUrl: string
  sourceUrl: string
}

export const DEFAULT_BANGUMI_GATEWAY_URL = 'https://bangumi-api.acg-dna.top'

const BANGUMI_GATEWAY_URL = (
  import.meta.env.VITE_BANGUMI_GATEWAY_URL || DEFAULT_BANGUMI_GATEWAY_URL
).replace(/\/$/, '')

const BANGUMI_SEARCH_MODE =
  import.meta.env.VITE_BANGUMI_SEARCH_MODE === 'direct' ? 'direct' : 'gateway'

const BANGUMI_API_URL = 'https://api.bgm.tv'

const SEARCH_LIMIT = 18
const MAX_CACHE_ENTRIES = 80
const ANILIST_DEFAULT_COOLDOWN_SECONDS = 60
const SEARCH_REQUEST_TIMEOUT_MS = 15_000

let anilistCooldownUntil = 0

interface CacheEntry {
  response: OnlineImageSearchResponse
}

const resultCache = new Map<string, CacheEntry>()
const workResultCache = new Map<string, OnlineWorkSearchResult[]>()

export class OnlineImageSearchError extends Error {
  retryAfterSeconds: number | null

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'OnlineImageSearchError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function createTimedAbortSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort()
  if (signal?.aborted) abortFromCaller()
  else signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromCaller)
    },
  }
}

async function fetchSearchResponse(
  input: RequestInfo | URL,
  init: RequestInit,
  unavailableMessage: string,
  timeoutMessage: string,
): Promise<Response> {
  const request = createTimedAbortSignal(
    init.signal ?? undefined,
    SEARCH_REQUEST_TIMEOUT_MS,
  )
  try {
    return await fetch(input, { ...init, signal: request.signal })
  } catch (error) {
    if (request.timedOut()) throw new OnlineImageSearchError(timeoutMessage)
    if (isAbortError(error)) throw error
    throw new OnlineImageSearchError(unavailableMessage)
  } finally {
    request.dispose()
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
    const nativeName = requiredString(record.name, '名称')
    const chineseName = optionalString(record.alternateName)
    const foreignName = optionalString(record.foreignName)
    const displayName = chineseName ?? nativeName
    const secondaryName =
      foreignName && foreignName !== displayName
        ? foreignName
        : chineseName && nativeName !== displayName
          ? nativeName
          : undefined
    return {
      provider: 'bangumi',
      externalId: requiredString(String(record.id ?? ''), 'ID'),
      kind,
      name: displayName,
      nativeName,
      ...(secondaryName ? { alternateName: secondaryName } : {}),
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

function parseBangumiWorkResult(value: unknown): OnlineWorkSearchResult | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  try {
    const nativeName = requiredString(record.name, '作品名称')
    const chineseName = optionalString(record.alternateName)
    const subjectType = Number(record.subjectType)
    if (![1, 2, 4].includes(subjectType)) return null
    return {
      externalId: requiredString(String(record.id ?? ''), '作品 ID'),
      name: chineseName ?? nativeName,
      nativeName,
      ...(chineseName && chineseName !== nativeName
        ? { alternateName: nativeName }
        : {}),
      subjectType: subjectType as 1 | 2 | 4,
      thumbnailUrl: requiredString(record.thumbnailUrl, '作品缩略图'),
      sourceUrl: requiredString(record.sourceUrl, '作品来源页面'),
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
    kind === 'character'
      ? '/v0/search/characters'
      : kind === 'singer'
        ? '/v0/search/persons'
        : '/v0/search/subjects'
  const body =
    kind === 'character'
      ? { keyword: query, filter: { nsfw: false } }
      : kind === 'singer'
        ? { keyword: query, filter: { career: ['artist'] } }
        : {
            keyword: query,
            sort: 'match',
            filter: { type: [kind === 'game' ? 4 : 2], nsfw: false },
          }
  const url = new URL(BANGUMI_API_URL + endpoint)
  url.searchParams.set('limit', String(SEARCH_LIMIT))
  url.searchParams.set('offset', '0')
  const response = await fetchSearchResponse(
    url,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    },
    '无法连接 Bangumi，请检查网络后重试',
    'Bangumi 文字搜索超时，请稍后重试',
  )
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
  const response = await fetchSearchResponse(
    url,
    {
      headers: { Accept: 'application/json' },
      signal,
    },
    '无法连接 Bangumi 搜索服务，请检查网络后重试',
    'Bangumi 搜索超时，请稍后重试或切换 AniList',
  )
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

function anilistCooldownSeconds(headers: Headers): number | null {
  const retryAfter = headerNumber(headers, 'Retry-After')
  if (retryAfter !== null && retryAfter > 0) return Math.ceil(retryAfter)

  const resetAt = headerNumber(headers, 'X-RateLimit-Reset')
  if (resetAt === null) return null
  const remainingMilliseconds = resetAt * 1000 - Date.now()
  return remainingMilliseconds > 0
    ? Math.ceil(remainingMilliseconds / 1000)
    : null
}

function setAniListCooldown(seconds: number | null): number {
  const duration = seconds ?? ANILIST_DEFAULT_COOLDOWN_SECONDS
  anilistCooldownUntil = Math.max(
    anilistCooldownUntil,
    Date.now() + duration * 1000,
  )
  return duration
}

function ensureAniListAvailable(): void {
  const remainingMilliseconds = anilistCooldownUntil - Date.now()
  if (remainingMilliseconds <= 0) return
  const remainingSeconds = Math.ceil(remainingMilliseconds / 1000)
  throw new OnlineImageSearchError(
    `AniList 请求过于频繁，请在 ${remainingSeconds} 秒后重试`,
    remainingSeconds,
  )
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
  if (kind === 'game' || kind === 'singer') {
    throw new OnlineImageSearchError('AniList 暂不支持游戏或歌手搜索')
  }
  ensureAniListAvailable()
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
  const response = await fetchSearchResponse(
    'https://graphql.anilist.co',
    {
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
    },
    '无法连接 AniList，请检查网络后重试',
    'AniList 搜索超时，请稍后重试',
  )
  const retryAfterSeconds = anilistCooldownSeconds(response.headers)
  if (response.status === 429) {
    const cooldownSeconds = setAniListCooldown(retryAfterSeconds)
    throw new OnlineImageSearchError(
      `AniList 请求过于频繁，请在 ${cooldownSeconds} 秒后重试`,
      cooldownSeconds,
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
    throw new OnlineImageSearchError('AniList 返回了搜索错误，请稍后重试')
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
  const remaining = headerNumber(response.headers, 'X-RateLimit-Remaining')
  if (remaining !== null && remaining <= 0) {
    setAniListCooldown(retryAfterSeconds)
  }
  return {
    provider: 'anilist',
    results,
    rateLimit: {
      limit: headerNumber(response.headers, 'X-RateLimit-Limit'),
      remaining,
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
  if (cached) {
    resultCache.delete(key)
    resultCache.set(key, cached)
    return cached.response
  }
  const response =
    provider === 'bangumi'
      ? BANGUMI_SEARCH_MODE === 'direct'
        ? await searchBangumiDirect(query, kind, signal)
        : await searchBangumiGateway(query, kind, signal)
      : await searchAniList(query, kind, signal)
  resultCache.set(key, { response })
  while (resultCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = resultCache.keys().next().value
    if (!oldestKey) break
    resultCache.delete(oldestKey)
  }
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
  if (normalizedQuery.length < 1) {
    throw new OnlineImageSearchError('请输入搜索名称')
  }
  return cachedSearch(
    options.provider ?? 'bangumi',
    normalizedQuery,
    kind,
    options.signal,
  )
}

export async function searchBangumiWorks(
  query: string,
  signal?: AbortSignal,
): Promise<OnlineWorkSearchResult[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) throw new OnlineImageSearchError('请输入作品名称')
  const cacheKey = 'works:' + normalizedQuery.toLocaleLowerCase()
  const cached = workResultCache.get(cacheKey)
  if (cached) return cached
  const url = new URL(BANGUMI_GATEWAY_URL + '/v1/search')
  url.searchParams.set('query', normalizedQuery)
  url.searchParams.set('kind', 'work')
  const response = await fetchSearchResponse(
    url,
    { headers: { Accept: 'application/json' }, signal },
    '无法连接 Bangumi 作品搜索，请检查网络后重试',
    'Bangumi 作品搜索超时，请稍后重试',
  )
  if (!response.ok) {
    throw new OnlineImageSearchError(
      response.status === 429
        ? '作品搜索请求过于频繁，请稍后再试'
        : 'Bangumi 作品搜索暂时不可用',
    )
  }
  const payload = (await response.json()) as { results?: unknown[] }
  const results = (payload.results ?? [])
    .map(parseBangumiWorkResult)
    .filter((item): item is OnlineWorkSearchResult => item !== null)
  workResultCache.set(cacheKey, results)
  while (workResultCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = workResultCache.keys().next().value
    if (!oldestKey) break
    workResultCache.delete(oldestKey)
  }
  return results
}

export async function searchBangumiSubjectCharacters(
  work: OnlineWorkSearchResult,
  signal?: AbortSignal,
): Promise<OnlineImageSearchResult[]> {
  const cacheKey = 'work-characters:' + work.externalId
  const cached = resultCache.get(cacheKey)
  if (cached) return cached.response.results
  const url = new URL(BANGUMI_GATEWAY_URL + '/v1/subject-characters')
  url.searchParams.set('subjectId', work.externalId)
  const response = await fetchSearchResponse(
    url,
    { headers: { Accept: 'application/json' }, signal },
    '无法读取这个作品的角色，请检查网络后重试',
    '作品角色读取超时，请稍后重试',
  )
  if (!response.ok) {
    throw new OnlineImageSearchError(
      response.status === 429
        ? '作品角色请求过于频繁，请稍后再试'
        : '暂时无法读取这个作品的角色',
    )
  }
  const payload = (await response.json()) as { results?: unknown[] }
  const results = (payload.results ?? [])
    .map((item) => parseBangumiResult(item, 'character'))
    .filter((item): item is OnlineImageSearchResult => item !== null)
    .map((item) => ({ ...item, subtitle: work.name }))
  resultCache.set(cacheKey, {
    response: { provider: 'bangumi', results },
  })
  return results
}

export function clearOnlineImageSearchCache(): void {
  resultCache.clear()
  workResultCache.clear()
}
