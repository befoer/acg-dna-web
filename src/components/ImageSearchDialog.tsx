import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type UIEvent,
} from 'react'

import { userErrorMessage } from '../errors/userErrorMessage'
import {
  searchBangumiSubjectCharacters,
  searchBangumiWorks,
  searchOnlineImages,
  type OnlineImageKind,
  type OnlineImageProvider,
  type OnlineImageSearchResult,
  type OnlineWorkSearchResult,
} from '../search/onlineImageSearch'

interface ImageSearchDialogProps {
  cacheKey?: string
  initialQuery: string
  onClose: () => void
  onSelect: (result: OnlineImageSearchResult) => Promise<boolean>
  onCustomize?: () => void
}

interface ImageSearchSession {
  query: string
  kind: OnlineImageKind
  provider: OnlineImageProvider
  results: OnlineImageSearchResult[]
  visibleResultCount: number
  message: string
  japaneseQuery?: string
  searchMode?: 'images' | 'works' | 'work-characters'
  workResults?: OnlineWorkSearchResult[]
  selectedWork?: OnlineWorkSearchResult
  characterReturnState?: CharacterSearchReturnState
}

interface CharacterSearchReturnState {
  query: string
  provider: OnlineImageProvider
  results: OnlineImageSearchResult[]
  visibleResultCount: number
  message: string
  japaneseQuery?: string
}

const imageSearchSessions = new Map<string, ImageSearchSession>()
const imageSearchHistory: string[] = []
const MAX_IMAGE_SEARCH_SESSIONS = 200
const RESULT_BATCH_SIZE = 6
const MAX_IMAGE_SEARCH_HISTORY = 6
const ANILIST_KINDS = new Set<OnlineImageKind>(['character', 'anime'])

const KIND_COPY: Record<
  OnlineImageKind,
  { label: string; placeholder: string; switched: string }
> = {
  character: {
    label: '角色',
    placeholder: '输入角色名称',
    switched: '已切换到角色搜索。',
  },
  anime: {
    label: '动画',
    placeholder: '输入动画名称',
    switched: '已切换到动画搜索。',
  },
  game: {
    label: '游戏',
    placeholder: '输入游戏名称',
    switched: '已切换到游戏搜索。',
  },
  singer: {
    label: '歌手',
    placeholder: '输入歌手名称',
    switched: '已切换到歌手搜索。',
  },
}

// eslint-disable-next-line react-refresh/only-export-components
export function resetImageSearchHistoryForTests(): void {
  imageSearchHistory.length = 0
}

export function ImageSearchDialog({
  cacheKey,
  initialQuery,
  onClose,
  onSelect,
  onCustomize,
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
  const [visibleResultCount, setVisibleResultCount] = useState(
    previousSession?.visibleResultCount ?? RESULT_BATCH_SIZE,
  )
  const [message, setMessage] = useState(
    previousSession?.message ??
      '优先使用 Bangumi；没有合适结果时可改用 AniList。',
  )
  const [japaneseQuery, setJapaneseQuery] = useState(
    previousSession?.japaneseQuery,
  )
  const [searchMode, setSearchMode] = useState(
    previousSession?.searchMode ?? 'images',
  )
  const [workResults, setWorkResults] = useState<OnlineWorkSearchResult[]>(
    previousSession?.workResults ?? [],
  )
  const [selectedWork, setSelectedWork] = useState<
    OnlineWorkSearchResult | undefined
  >(previousSession?.selectedWork)
  const [characterReturnState, setCharacterReturnState] = useState<
    CharacterSearchReturnState | undefined
  >(previousSession?.characterReturnState)
  const [searching, setSearching] = useState(false)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [searchHistory, setSearchHistory] = useState(() => [
    ...imageSearchHistory,
  ])
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
      visibleResultCount,
      message,
      ...(japaneseQuery ? { japaneseQuery } : {}),
      searchMode,
      workResults,
      ...(selectedWork ? { selectedWork } : {}),
      ...(characterReturnState ? { characterReturnState } : {}),
      ...next,
    })
    while (imageSearchSessions.size > MAX_IMAGE_SEARCH_SESSIONS) {
      const oldestKey = imageSearchSessions.keys().next().value
      if (!oldestKey) break
      imageSearchSessions.delete(oldestKey)
    }
  }

  const rememberSearch = (nextQuery: string): void => {
    const nextHistory = [
      nextQuery,
      ...imageSearchHistory.filter((item) => item !== nextQuery),
    ].slice(0, MAX_IMAGE_SEARCH_HISTORY)
    imageSearchHistory.splice(0, imageSearchHistory.length, ...nextHistory)
    setSearchHistory(nextHistory)
  }

  const runSearch = async (
    nextProvider: OnlineImageProvider = provider,
    nextQuery: string = query,
  ) => {
    if (!ANILIST_KINDS.has(kind)) nextProvider = 'bangumi'
    const normalized = nextQuery.trim()
    if (normalized.length < 1) {
      setMessage('请输入搜索名称。')
      return
    }
    const providerLabel = nextProvider === 'bangumi' ? 'Bangumi' : 'AniList'
    rememberSearch(normalized)
    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller
    setProvider(nextProvider)
    setSearchMode('images')
    setWorkResults([])
    setSelectedWork(undefined)
    setQuery(normalized)
    setResults([])
    setVisibleResultCount(RESULT_BATCH_SIZE)
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
          visibleResultCount: RESULT_BATCH_SIZE,
          message: nextMessage,
          japaneseQuery: nextJapaneseQuery,
          searchMode: 'images',
          workResults: [],
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
          visibleResultCount: RESULT_BATCH_SIZE,
          message: nextMessage,
          japaneseQuery: nextJapaneseQuery,
          searchMode: 'images',
          workResults: [],
        })
      }
    } catch (error) {
      if (controller.signal.aborted) return
      const nextMessage = userErrorMessage(
        error,
        `${providerLabel} 搜索失败，请稍后重试`,
      )
      setMessage(nextMessage)
      setResults([])
      saveSession({
        query: normalized,
        kind,
        provider: nextProvider,
        results: [],
        visibleResultCount: RESULT_BATCH_SIZE,
        message: nextMessage,
        searchMode: 'images',
        workResults: [],
      })
    } finally {
      if (!controller.signal.aborted) setSearching(false)
    }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (searchMode === 'images') void runSearch()
    else void runWorkSearch()
  }

  const runWorkSearch = async (nextQuery: string = query) => {
    const normalized = nextQuery.trim()
    if (!normalized) {
      setMessage('请输入作品名称。')
      return
    }
    rememberSearch(normalized)
    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller
    setQuery(normalized)
    setProvider('bangumi')
    setSearchMode('works')
    setResults([])
    setWorkResults([])
    setSelectedWork(undefined)
    setVisibleResultCount(RESULT_BATCH_SIZE)
    setSearching(true)
    setMessage('正在按作品名称搜索 Bangumi…')
    try {
      const nextWorkResults = await searchBangumiWorks(
        normalized,
        controller.signal,
      )
      if (controller.signal.aborted) return
      const nextMessage = nextWorkResults.length
        ? `找到 ${nextWorkResults.length} 个作品，选择一个作品后显示该作品的角色。`
        : '没有找到作品，请尝试完整中文名或日文原名。'
      setWorkResults(nextWorkResults)
      setMessage(nextMessage)
      saveSession({
        query: normalized,
        provider: 'bangumi',
        results: [],
        workResults: nextWorkResults,
        searchMode: 'works',
        visibleResultCount: RESULT_BATCH_SIZE,
        message: nextMessage,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      const nextMessage = userErrorMessage(error, '作品搜索失败，请稍后重试')
      setMessage(nextMessage)
      setWorkResults([])
    } finally {
      if (!controller.signal.aborted) setSearching(false)
    }
  }

  const startWorkSearch = () => {
    if (searching) return
    setCharacterReturnState({
      query,
      provider,
      results,
      visibleResultCount,
      message,
      ...(japaneseQuery ? { japaneseQuery } : {}),
    })
    setProvider('bangumi')
    setSearchMode('works')
    setResults([])
    setWorkResults([])
    setSelectedWork(undefined)
    setVisibleResultCount(RESULT_BATCH_SIZE)
    setJapaneseQuery(undefined)
    setMessage('输入作品名称，再从作品中选择角色。')
  }

  const returnToCharacterSearch = () => {
    searchAbortRef.current?.abort()
    const previous = characterReturnState
    const nextQuery = previous?.query ?? ''
    const nextProvider = previous?.provider ?? 'bangumi'
    const nextResults = previous?.results ?? []
    const nextVisibleResultCount =
      previous?.visibleResultCount ?? RESULT_BATCH_SIZE
    const nextMessage = previous?.message ?? '已返回角色搜索。'
    setKind('character')
    setSearchMode('images')
    setQuery(nextQuery)
    setProvider(nextProvider)
    setResults(nextResults)
    setVisibleResultCount(nextVisibleResultCount)
    setJapaneseQuery(previous?.japaneseQuery)
    setWorkResults([])
    setSelectedWork(undefined)
    setMessage(nextMessage)
    saveSession({
      query: nextQuery,
      kind: 'character',
      provider: nextProvider,
      results: nextResults,
      visibleResultCount: nextVisibleResultCount,
      message: nextMessage,
      japaneseQuery: previous?.japaneseQuery,
      searchMode: 'images',
      workResults: [],
      selectedWork: undefined,
      characterReturnState: undefined,
    })
    setCharacterReturnState(undefined)
  }

  const selectWork = async (
    work: OnlineWorkSearchResult,
    availableWorks: OnlineWorkSearchResult[] = workResults,
  ) => {
    if (searching) return
    searchAbortRef.current?.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller
    setSearching(true)
    setSelectingId('work:' + work.externalId)
    setMessage(`正在读取《${work.name}》的角色…`)
    try {
      const characters = await searchBangumiSubjectCharacters(
        work,
        controller.signal,
      )
      if (controller.signal.aborted) return
      const nextMessage = characters.length
        ? `《${work.name}》中找到 ${characters.length} 个角色。`
        : `《${work.name}》没有可用的角色图片。`
      setSelectedWork(work)
      setWorkResults(availableWorks)
      setResults(characters)
      setSearchMode('work-characters')
      setVisibleResultCount(RESULT_BATCH_SIZE)
      setMessage(nextMessage)
      saveSession({
        results: characters,
        workResults: availableWorks,
        selectedWork: work,
        searchMode: 'work-characters',
        visibleResultCount: RESULT_BATCH_SIZE,
        message: nextMessage,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      setMessage(userErrorMessage(error, '作品角色读取失败，请稍后重试'))
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false)
        setSelectingId(null)
      }
    }
  }

  const switchProvider = (nextProvider: OnlineImageProvider) => {
    if (
      searching ||
      nextProvider === provider ||
      (nextProvider === 'anilist' && !ANILIST_KINDS.has(kind))
    ) {
      return
    }
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
    setSearchMode('images')
    setWorkResults([])
    setSelectedWork(undefined)
    if (!ANILIST_KINDS.has(nextKind)) setProvider('bangumi')
    setResults([])
    setVisibleResultCount(RESULT_BATCH_SIZE)
    setJapaneseQuery(undefined)
    setMessage(KIND_COPY[nextKind].switched)
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

  const visibleResults = results.slice(0, visibleResultCount)
  const visibleWorkResults = workResults.slice(0, visibleResultCount)
  const activeResultCount =
    searchMode === 'works' ? workResults.length : results.length
  const visibleActiveResultCount =
    searchMode === 'works' ? visibleWorkResults.length : visibleResults.length
  const remainingResultCount = activeResultCount - visibleActiveResultCount

  const loadMoreResultsOnScroll = (event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget
    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceToBottom > 240) return

    setVisibleResultCount((current) => {
      const nextCount = Math.min(activeResultCount, current + RESULT_BATCH_SIZE)
      if (nextCount === current) return current
      if (cacheKey) {
        const session = imageSearchSessions.get(cacheKey)
        if (session) {
          imageSearchSessions.set(cacheKey, {
            ...session,
            visibleResultCount: nextCount,
          })
        }
      }
      return nextCount
    })
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
            <h2 id="image-search-title">搜索图片</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="image-search-kind" role="group" aria-label="搜索类型">
          {(Object.keys(KIND_COPY) as OnlineImageKind[]).map((item) => (
            <button
              type="button"
              className={kind === item ? 'is-active' : ''}
              onClick={() => changeKind(item)}
              key={item}
            >
              {KIND_COPY[item].label}
            </button>
          ))}
          {onCustomize ? (
            <button
              type="button"
              className="image-search-custom-tab"
              disabled={selectingId !== null}
              onClick={onCustomize}
            >
              自定义
            </button>
          ) : null}
        </div>

        <form className="image-search-form" onSubmit={submit}>
          <input
            className="text-input"
            value={query}
            maxLength={80}
            autoFocus
            placeholder={
              searchMode === 'images'
                ? KIND_COPY[kind].placeholder
                : '输入动画、游戏或漫画名称'
            }
            onChange={(event) => updateQuery(event.currentTarget.value)}
          />
          <button className="primary-button" type="submit" disabled={searching}>
            {searching ? '搜索中…' : '搜索'}
          </button>
        </form>

        {searchHistory.length > 0 ? (
          <div className="image-search-history" aria-label="历史搜索记录">
            <span>历史搜索</span>
            <div>
              {searchHistory.map((item) => (
                <button
                  type="button"
                  disabled={searching}
                  aria-label={'使用历史搜索 ' + item}
                  onClick={() =>
                    searchMode === 'images'
                      ? void runSearch(provider, item)
                      : void runWorkSearch(item)
                  }
                  key={item}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="image-search-status">
          <div className="image-search-status-copy">
            <span>{message}</span>
            {!searching &&
            query.trim() &&
            searchMode === 'images' &&
            ANILIST_KINDS.has(kind) ? (
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
                {kind === 'character' ? (
                  <button type="button" onClick={startWorkSearch}>
                    按作品查找角色
                  </button>
                ) : null}
              </div>
            ) : null}
            {!searching && searchMode === 'work-characters' ? (
              <div className="image-search-hints">
                <button
                  type="button"
                  onClick={() => {
                    setSearchMode('works')
                    setResults([])
                    setVisibleResultCount(RESULT_BATCH_SIZE)
                    setMessage('请选择作品，或修改名称重新搜索。')
                  }}
                >
                  选择其他作品
                </button>
                <button type="button" onClick={returnToCharacterSearch}>
                  返回角色搜索
                </button>
              </div>
            ) : null}
            {!searching && searchMode === 'works' ? (
              <div className="image-search-hints">
                <button type="button" onClick={returnToCharacterSearch}>
                  返回角色搜索
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div
          className="image-search-results"
          aria-live="polite"
          onScroll={loadMoreResultsOnScroll}
        >
          <div className="image-search-results-flow">
            {searchMode === 'works'
              ? visibleWorkResults.map((work) => {
                  const key = 'work:' + work.externalId
                  return (
                    <article
                      className="image-search-result is-bangumi is-work"
                      key={key}
                    >
                      <button
                        type="button"
                        className="image-search-result-select"
                        disabled={searching}
                        onClick={() => void selectWork(work)}
                      >
                        <img
                          crossOrigin="anonymous"
                          src={work.thumbnailUrl}
                          alt=""
                          loading="lazy"
                        />
                        <strong>{work.name}</strong>
                        {work.alternateName ? (
                          <span>{work.alternateName}</span>
                        ) : null}
                        {selectingId === key ? <b>正在读取角色…</b> : null}
                      </button>
                      <a href={work.sourceUrl} target="_blank" rel="noreferrer">
                        查看来源
                      </a>
                    </article>
                  )
                })
              : null}
            {searchMode !== 'works'
              ? visibleResults.map((result) => {
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
                        {result.subtitle ? (
                          <small>{result.subtitle}</small>
                        ) : null}
                        {selectingId === key ? <b>正在保存…</b> : null}
                      </button>
                      <a
                        href={result.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看来源
                      </a>
                    </article>
                  )
                })
              : null}
          </div>
          {remainingResultCount > 0 ? (
            <p className="image-search-loading-more">继续向下滚动加载更多</p>
          ) : null}
          {!searching && results.length > 0 && searchMode === 'images' ? (
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
