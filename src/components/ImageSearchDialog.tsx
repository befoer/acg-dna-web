import { useEffect, useRef, useState, type FormEvent } from 'react'

import {
  searchOnlineImages,
  type OnlineImageKind,
  type OnlineImageProvider,
  type OnlineImageSearchResult,
} from '../search/onlineImageSearch'

interface ImageSearchDialogProps {
  cacheKey?: string
  initialQuery: string
  onClose: () => void
  onSelect: (result: OnlineImageSearchResult) => Promise<boolean>
}

interface ImageSearchSession {
  query: string
  kind: OnlineImageKind
  provider: OnlineImageProvider
  results: OnlineImageSearchResult[]
  message: string
  japaneseQuery?: string
}

const imageSearchSessions = new Map<string, ImageSearchSession>()
const MAX_IMAGE_SEARCH_SESSIONS = 200

export function ImageSearchDialog({
  cacheKey,
  initialQuery,
  onClose,
  onSelect,
}: ImageSearchDialogProps) {
  const previousSession = cacheKey ? imageSearchSessions.get(cacheKey) : null
  const [query, setQuery] = useState(previousSession?.query ?? initialQuery)
  const [kind, setKind] = useState<OnlineImageKind>(
    previousSession?.kind ?? 'character',
  )
  const [provider, setProvider] = useState<OnlineImageProvider>(
    previousSession?.provider ?? 'bangumi',
  )
  const [results, setResults] = useState<OnlineImageSearchResult[]>(
    previousSession?.results ?? [],
  )
  const [message, setMessage] = useState(
    previousSession?.message ??
      '优先使用 Bangumi；没有合适结果时可改用 AniList。',
  )
  const [japaneseQuery, setJapaneseQuery] = useState(
    previousSession?.japaneseQuery,
  )
  const [searching, setSearching] = useState(false)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      searchAbortRef.current?.abort()
    },
    [],
  )

  const saveSession = (next: Partial<ImageSearchSession> = {}): void => {
    if (!cacheKey) return
    imageSearchSessions.delete(cacheKey)
    imageSearchSessions.set(cacheKey, {
      query,
      kind,
      provider,
      results,
      message,
      ...(japaneseQuery ? { japaneseQuery } : {}),
      ...next,
    })
    while (imageSearchSessions.size > MAX_IMAGE_SEARCH_SESSIONS) {
      const oldestKey = imageSearchSessions.keys().next().value
      if (!oldestKey) break
      imageSearchSessions.delete(oldestKey)
    }
  }

  const runSearch = async (
    nextProvider: OnlineImageProvider = provider,
    nextQuery: string = query,
  ) => {
    const normalized = nextQuery.trim()
    if (normalized.length < 1) {
      setMessage('请输入搜索名称。')
      return
    }
    const providerLabel = nextProvider === 'bangumi' ? 'Bangumi' : 'AniList'
    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller
    setProvider(nextProvider)
    setQuery(normalized)
    setResults([])
    setSearching(true)
    setMessage(`正在搜索 ${providerLabel}…`)
    try {
      const response = await searchOnlineImages(normalized, kind, {
        provider: nextProvider,
        signal: controller.signal,
      })
      if (controller.signal.aborted) {
        return
      }
      setResults(response.results)
      const nextJapaneseQuery =
        nextProvider === 'bangumi'
          ? response.results.find((result) => result.nativeName?.trim())
              ?.nativeName
          : japaneseQuery
      setJapaneseQuery(nextJapaneseQuery)
      if (response.results.length > 0) {
        const nextMessage = `找到 ${response.results.length} 个 ${providerLabel} 结果。`
        setMessage(nextMessage)
        saveSession({
          query: normalized,
          kind,
          provider: nextProvider,
          results: response.results,
          message: nextMessage,
          japaneseQuery: nextJapaneseQuery,
        })
      } else {
        const nextMessage =
          nextProvider === 'bangumi'
            ? 'Bangumi 没有找到结果，可切换 AniList 或补充名称后重试。'
            : 'AniList 没有找到结果，请尝试日文名、罗马音或切换 Bangumi。'
        setMessage(nextMessage)
        saveSession({
          query: normalized,
          kind,
          provider: nextProvider,
          results: [],
          message: nextMessage,
          japaneseQuery: nextJapaneseQuery,
        })
      }
    } catch (error) {
      if (controller.signal.aborted) return
      const nextMessage =
        error instanceof Error ? error.message : `${providerLabel} 搜索失败`
      setMessage(nextMessage)
      setResults([])
      saveSession({
        query: normalized,
        kind,
        provider: nextProvider,
        results: [],
        message: nextMessage,
      })
    } finally {
      if (!controller.signal.aborted) setSearching(false)
    }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void runSearch()
  }

  const switchProvider = (nextProvider: OnlineImageProvider) => {
    if (searching || nextProvider === provider) return
    const nextQuery =
      provider === 'bangumi' &&
      nextProvider === 'anilist' &&
      japaneseQuery?.trim()
        ? japaneseQuery
        : query
    if (nextQuery.trim()) {
      void runSearch(nextProvider, nextQuery)
      return
    }
    setProvider(nextProvider)
  }

  const changeKind = (nextKind: OnlineImageKind) => {
    if (searching || nextKind === kind) return
    setKind(nextKind)
    setResults([])
    setJapaneseQuery(undefined)
    setMessage(
      nextKind === 'character' ? '已切换到角色搜索。' : '已切换到动画搜索。',
    )
  }

  const updateQuery = (nextQuery: string) => {
    setQuery(nextQuery)
    if (nextQuery.trim() !== query.trim()) setJapaneseQuery(undefined)
  }

  const selectResult = async (result: OnlineImageSearchResult) => {
    const key = result.provider + ':' + result.externalId
    setSelectingId(key)
    const selected = await onSelect(result)
    setSelectingId(null)
    if (selected) onClose()
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog-card image-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-search-title"
      >
        <header className="dialog-header">
          <div>
            <p className="section-kicker">ONLINE IMAGE</p>
            <h2 id="image-search-title">在线选择图片</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="image-search-kind" role="group" aria-label="搜索类型">
          <button
            type="button"
            className={kind === 'character' ? 'is-active' : ''}
            onClick={() => changeKind('character')}
          >
            角色
          </button>
          <button
            type="button"
            className={kind === 'anime' ? 'is-active' : ''}
            onClick={() => changeKind('anime')}
          >
            动画
          </button>
        </div>

        <form className="image-search-form" onSubmit={submit}>
          <input
            className="text-input"
            value={query}
            maxLength={80}
            autoFocus
            placeholder={kind === 'character' ? '输入角色名称' : '输入动画名称'}
            onChange={(event) => updateQuery(event.currentTarget.value)}
          />
          <button className="primary-button" type="submit" disabled={searching}>
            {searching ? '搜索中…' : '搜索'}
          </button>
        </form>

        <div className="image-search-status">
          <div className="image-search-status-copy">
            <span>{message}</span>
            {!searching && query.trim() ? (
              <div className="image-search-hints">
                <span>没有合适结果？</span>
                <button
                  type="button"
                  onClick={() =>
                    switchProvider(
                      provider === 'bangumi' ? 'anilist' : 'bangumi',
                    )
                  }
                >
                  {provider === 'bangumi'
                    ? '改用 AniList 搜索'
                    : '改用 Bangumi 搜索'}
                </button>
                {japaneseQuery && japaneseQuery.trim() !== query.trim() ? (
                  <button
                    type="button"
                    title={`使用日文原名“${japaneseQuery}”搜索 ${
                      provider === 'bangumi' ? 'Bangumi' : 'AniList'
                    }`}
                    onClick={() => void runSearch(provider, japaneseQuery)}
                  >
                    搜日文
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="image-search-results" aria-live="polite">
          <div className="image-search-results-flow">
            {results.map((result) => {
              const key = result.provider + ':' + result.externalId
              return (
                <article
                  className={
                    'image-search-result is-' +
                    result.provider +
                    ' is-' +
                    result.kind
                  }
                  key={key}
                >
                  <button
                    type="button"
                    className="image-search-result-select"
                    disabled={selectingId !== null}
                    onClick={() => void selectResult(result)}
                  >
                    <img
                      crossOrigin="anonymous"
                      src={result.thumbnailUrl}
                      alt=""
                      loading="lazy"
                    />
                    <strong>{result.name}</strong>
                    {result.alternateName &&
                    result.alternateName !== result.name ? (
                      <span>{result.alternateName}</span>
                    ) : null}
                    {result.subtitle ? <small>{result.subtitle}</small> : null}
                    {selectingId === key ? <b>正在保存…</b> : null}
                  </button>
                  <a href={result.sourceUrl} target="_blank" rel="noreferrer">
                    查看来源
                  </a>
                </article>
              )
            })}
          </div>
          {!searching && results.length > 0 ? (
            <div className="image-search-bottom-hint" role="note">
              <span>找不到？试试搜全名或日文，例如：</span>
              <span className="image-search-hint-example is-wrong">
                小春 <b aria-label="不推荐">×</b>
              </span>
              <span className="image-search-hint-example is-right">
                下江小春 <b aria-label="推荐">✓</b>
              </span>
              <span className="image-search-hint-example is-right">
                コハル <b aria-label="推荐">✓</b>
              </span>
            </div>
          ) : null}
        </div>

        <p className="image-rights-note">
          图片版权归原权利人所有。仅在你确认有权使用时选择；图片会保存到本机浏览器，不会上传到项目服务器。
        </p>
      </section>
    </div>
  )
}
