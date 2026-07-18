import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ImageSearchDialog } from './ImageSearchDialog'

const searchMock = vi.hoisted(() => vi.fn())

vi.mock('../search/onlineImageSearch', async () => {
  const actual = await vi.importActual('../search/onlineImageSearch')
  return { ...actual, searchOnlineImages: searchMock }
})

describe('ImageSearchDialog', () => {
  afterEach(() => {
    searchMock.mockReset()
    vi.useRealTimers()
  })

  it('shows AniList after 5 seconds and switches automatically after 10 seconds', async () => {
    vi.useFakeTimers()
    searchMock.mockImplementation(
      (_query: string, _kind: string, options?: { provider?: string }) =>
        options?.provider === 'anilist'
          ? Promise.resolve({ provider: 'anilist', results: [] })
          : new Promise(() => undefined),
    )
    render(
      <ImageSearchDialog
        initialQuery="小叽"
        onClose={() => undefined}
        onSelect={async () => true}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(
      screen.queryByRole('button', { name: 'AniList 备用搜索' }),
    ).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(
      screen.getByRole('button', { name: 'AniList 备用搜索' }),
    ).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(searchMock).toHaveBeenCalledWith(
      '小叽',
      'character',
      expect.objectContaining({ provider: 'anilist' }),
    )
  })

  it('uses a Bangumi Japanese hint for the AniList fallback', async () => {
    searchMock
      .mockResolvedValueOnce({
        provider: 'bangumi',
        results: [],
        queryHints: ['ちぃ'],
        bangumiTransport: 'direct',
      })
      .mockResolvedValueOnce({ provider: 'anilist', results: [] })
    render(
      <ImageSearchDialog
        initialQuery="小叽"
        onClose={() => undefined}
        onSelect={async () => true}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(2))
    expect(searchMock).toHaveBeenLastCalledWith(
      'ちぃ',
      'character',
      expect.objectContaining({ provider: 'anilist' }),
    )
    expect(screen.getByText(/Bangumi 文字直连成功/)).toBeInTheDocument()
  })
})
