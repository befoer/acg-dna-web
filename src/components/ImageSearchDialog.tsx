import { useEffect, useRef, useState, type FormEvent } from 'react'

import {
  OnlineImageSearchError,
  searchOnlineImages,
  type OnlineImageKind,
  type OnlineImageProvider,
  type OnlineImageSearchResult,
} from '../search/onlineImageSearch'

interface ImageSearchDialogProps {
  initialQuery: string
  onClose: () => void
  onSelect: (result: OnlineImageSearchResult) => Promise<boolean>
}

const FALLBACK_BUTTON_DELAY_MS = 5_000
const AUTO_FALLBACK_DELAY_MS = 10_000

export function ImageSearchDialog({
  initialQuery,
  onClose,
  onSelect,
}: ImageSearchDialogProps) {
  const [query, setQuery] = useState(initialQuery)
  const [kind, setKind] = useState<OnlineImageKind>('character')
  const [results, setResults] = useState<OnlineImageSearchResult[]>([])
  const [message, setMessage] = useState(
    '优先搜索 Bangumi；找不到时会自动使用 AniList。',
  )
  const [searching, setSearching] = useState(false)
  const [fallbackAvailable, setFallbackAvailable] = useState(false)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const bangumiAbortRef = useRef<AbortController | null>(null)
  const anilistAbortRef = useRef<AbortController | null>(null)
  const fallbackTimerRef = useRef<number | null>(null)
  const autoFallbackTimerRef = useRef<number | null>(null)
  const searchSequenceRef = useRef(0)
  const activeProviderRef = useRef<OnlineImageProvider>('bangumi')
  const bangumiHintsRef = useRef<string[]>([])
  const bangumiDirectSucceededRef = useRef(false)
  const isAniListActive = () => activeProviderRef.current === 'anilist'

  const clearFallbackTimers = () => {
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
    if (autoFallbackTimerRef.current !== null) {
      window.clearTimeout(autoFallbackTimerRef.current)
      autoFallbackTimerRef.current = null
    }
  }

  useEffect(
    () => () => {
      bangumiAbortRef.current?.abort()
      anilistAbortRef.current?.abort()
      clearFallbackTimers()
    },
    [],
  )

  const runAniList = async (
    sequence: number,
    originalQuery: string,
    reason: 'manual' | 'timeout' | 'empty' | 'unavailable' | 'hint',
  ) => {
    if (sequence !== searchSequenceRef.current) return
    clearFallbackTimers()
    setFallbackAvailable(false)
    activeProviderRef.current = 'anilist'
    anilistAbortRef.current?.abort()
    const controller = new AbortController()
    anilistAbortRef.current = controller
    const candidates = Array.from(
      new Set(
        bangumiHintsRef.current.length > 0
          ? bangumiHintsRef.current.slice(0, 2)
          : [originalQuery],
      ),
    )
    setSearching(true)
    setMessage(
      reason === 'timeout'
        ? 'Bangumi 等待超过 10 秒，正在自动切换 AniList…'
        : '正在搜索 AniList…',
    )
    try {
      for (const candidate of candidates) {
        const response = await searchOnlineImages(candidate, kind, {
          provider: 'anilist',
          signal: controller.signal,
        })
        if (
          controller.signal.aborted ||
          sequence !== searchSequenceRef.current ||
          activeProviderRef.current !== 'anilist'
        ) {
          return
        }
        if (response.results.length > 0) {
          setResults(response.results)
          setMessage(
            candidate === originalQuery
              ? `找到 ${response.results.length} 张图片 · AniList`
              : `${bangumiDirectSucceededRef.current ? 'Bangumi 文字直连成功；' : ''}已使用 Bangumi 名称「${candidate}」找到 ${response.results.length} 张 AniList 图片`,
          )
          return
        }
      }
      setResults([])
      setMessage(
        bangumiDirectSucceededRef.current
          ? 'Bangumi 文字直连成功，但 AniList 未找到与该名称匹配的图片。'
          : reason === 'unavailable'
            ? 'Bangumi 文字直连失败；AniList 未找到与关键词匹配的内容。'
            : 'AniList 未找到与关键词匹配的内容。',
      )
    } catch (error) {
      if (controller.signal.aborted || sequence !== searchSequenceRef.current) {
        return
      }
      const suffix =
        error instanceof OnlineImageSearchError && error.retryAfterSeconds
          ? `，约 ${error.retryAfterSeconds} 秒后重试`
          : ''
      setMessage(
        (error instanceof Error ? error.message : '图片搜索失败') + suffix,
      )
      setResults([])
    } finally {
      if (
        !controller.signal.aborted &&
        sequence === searchSequenceRef.current &&
        activeProviderRef.current === 'anilist'
      ) {
        setSearching(false)
      }
    }
  }

  const runBangumi = async () => {
    const normalized = query.trim()
    if (normalized.length < 2) {
      setMessage('请至少输入 2 个字符。')
      return
    }
    searchSequenceRef.current += 1
    const sequence = searchSequenceRef.current
    clearFallbackTimers()
    bangumiAbortRef.current?.abort()
    anilistAbortRef.current?.abort()
    const controller = new AbortController()
    bangumiAbortRef.current = controller
    bangumiHintsRef.current = []
    bangumiDirectSucceededRef.current = false
    activeProviderRef.current = 'bangumi'
    setResults([])
    setFallbackAvailable(false)
    setSearching(true)
    setMessage('正在搜索 Bangumi…')
    fallbackTimerRef.current = window.setTimeout(() => {
      if (
        sequence === searchSequenceRef.current &&
        activeProviderRef.current === 'bangumi'
      ) {
        setFallbackAvailable(true)
        setMessage('Bangumi 等待超过 5 秒，可以切换到 AniList。')
      }
    }, FALLBACK_BUTTON_DELAY_MS)
    autoFallbackTimerRef.current = window.setTimeout(() => {
      if (
        sequence === searchSequenceRef.current &&
        activeProviderRef.current === 'bangumi'
      ) {
        void runAniList(sequence, normalized, 'timeout')
      }
    }, AUTO_FALLBACK_DELAY_MS)
    try {
      const response = await searchOnlineImages(normalized, kind, {
        provider: 'bangumi',
        signal: controller.signal,
      })
      if (controller.signal.aborted || sequence !== searchSequenceRef.current) {
        return
      }
      bangumiHintsRef.current = response.queryHints ?? []
      bangumiDirectSucceededRef.current = response.bangumiTransport === 'direct'
      if (isAniListActive()) {
        if (response.queryHints?.length) {
          void runAniList(sequence, normalized, 'hint')
        }
        return
      }
      clearFallbackTimers()
      setFallbackAvailable(false)
      setResults(response.results)
      if (response.results.length > 0) {
        setMessage(`找到 ${response.results.length} 张图片 · Bangumi`)
        setSearching(false)
      } else {
        void runAniList(sequence, normalized, 'empty')
      }
    } catch {
      if (controller.signal.aborted || sequence !== searchSequenceRef.current) {
        return
      }
      if (activeProviderRef.current === 'bangumi') {
        void runAniList(sequence, normalized, 'unavailable')
      }
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void runBangumi()
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
            onClick={() => setKind('character')}
          >
            角色
          </button>
          <button
            type="button"
            className={kind === 'anime' ? 'is-active' : ''}
            onClick={() => setKind('anime')}
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
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <button className="primary-button" type="submit" disabled={searching}>
            {searching ? '搜索中…' : '搜索'}
          </button>
        </form>

        <div className="image-search-status">
          <span>{message}</span>
          {fallbackAvailable ? (
            <button
              type="button"
              className="compact-button"
              onClick={() =>
                void runAniList(
                  searchSequenceRef.current,
                  query.trim(),
                  'manual',
                )
              }
            >
              AniList 备用搜索
            </button>
          ) : null}
        </div>

        <div className="image-search-results" aria-live="polite">
          {results.map((result) => {
            const key = result.provider + ':' + result.externalId
            return (
              <article className="image-search-result" key={key}>
                <button
                  type="button"
                  className="image-search-result-select"
                  disabled={selectingId !== null}
                  onClick={() => void selectResult(result)}
                >
                  <img src={result.thumbnailUrl} alt="" loading="lazy" />
                  <strong>{result.name}</strong>
                  {result.alternateName &&
                  result.alternateName !== result.name ? (
                    <span>{result.alternateName}</span>
                  ) : null}
                  {result.subtitle ? <small>{result.subtitle}</small> : null}
                  <em>
                    {result.provider === 'bangumi' ? 'Bangumi' : 'AniList'}
                  </em>
                  {selectingId === key ? <b>正在保存…</b> : null}
                </button>
                <a href={result.sourceUrl} target="_blank" rel="noreferrer">
                  查看来源
                </a>
              </article>
            )
          })}
        </div>

        <p className="image-rights-note">
          图片版权归原权利人所有。仅在你确认有权使用时选择；图片会保存到本机浏览器，不会上传到项目服务器。
        </p>
      </section>
    </div>
  )
}
