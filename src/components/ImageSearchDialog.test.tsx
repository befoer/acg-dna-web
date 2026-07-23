import { fireEvent, render, screen } from '@testing-library/react'
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
  })

  it('waits for the user to choose a Bangumi result before using AniList', async () => {
    const result = {
      provider: 'bangumi' as const,
      externalId: '32',
      kind: 'character' as const,
      name: '小叽',
      nativeName: 'ちぃ',
      alternateName: 'ちぃ',
      thumbnailUrl: 'https://bangumi-api.acg-dna.top/v1/image?id=32',
      downloadUrl: 'https://bangumi-api.acg-dna.top/v1/image?id=32',
      originalUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
      sourceUrl: 'https://bgm.tv/character/32',
    }
    searchMock.mockResolvedValue({ provider: 'bangumi', results: [result] })
    const onClose = vi.fn()
    const onSelect = vi.fn().mockResolvedValue(true)
    render(
      <ImageSearchDialog
        initialQuery="小叽"
        onClose={onClose}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByText('小叽')
    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(searchMock).toHaveBeenCalledWith(
      '小叽',
      'character',
      expect.objectContaining({ provider: 'bangumi' }),
    )
    expect(searchMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ provider: 'anilist' }),
    )

    fireEvent.click(screen.getByRole('button', { name: /小叽/ }))
    expect(onSelect).toHaveBeenCalledWith(result)
    expect(
      screen.getByText('找不到？试试搜全名或日文，例如：'),
    ).toBeInTheDocument()
    expect(screen.getByText('小春')).toBeInTheDocument()
    expect(screen.getByText('下江小春')).toBeInTheDocument()
    expect(screen.getByText('コハル')).toBeInTheDocument()
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('loads result thumbnails with anonymous CORS', async () => {
    searchMock.mockResolvedValue({
      provider: 'bangumi',
      results: [
        {
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
      ],
    })
    const { container } = render(
      <ImageSearchDialog
        initialQuery="小叽"
        onClose={() => undefined}
        onSelect={async () => true}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByText('小叽')

    expect(container.querySelector('.image-search-result img')).toHaveAttribute(
      'crossorigin',
      'anonymous',
    )
  })

  it('restores the last search screen for the same node', async () => {
    searchMock.mockResolvedValue({
      provider: 'bangumi',
      results: [
        {
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
      ],
    })
    const first = render(
      <ImageSearchDialog
        cacheKey={'node-32'}
        initialQuery={'小叽'}
        onClose={() => undefined}
        onSelect={async () => true}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByText('小叽')
    first.unmount()

    render(
      <ImageSearchDialog
        cacheKey={'node-32'}
        initialQuery={'小叽'}
        onClose={() => undefined}
        onSelect={async () => true}
      />,
    )
    expect(screen.getByDisplayValue('小叽')).toBeInTheDocument()
    expect(screen.getByText('找到 1 个 Bangumi 结果。')).toBeInTheDocument()
    expect(screen.getByText('小叽')).toBeInTheDocument()
    expect(searchMock).toHaveBeenCalledTimes(1)
  })
  it('switches to AniList manually and can reuse the Bangumi Japanese name', async () => {
    const bangumiResult = {
      provider: 'bangumi' as const,
      externalId: '87968',
      kind: 'character' as const,
      name: '后藤一里',
      nativeName: '後藤ひとり',
      alternateName: '後藤ひとり',
      thumbnailUrl: 'https://bangumi-api.acg-dna.top/v1/image?id=87968',
      downloadUrl: 'https://bangumi-api.acg-dna.top/v1/image?id=87968',
      originalUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
      sourceUrl: 'https://bgm.tv/character/87968',
    }

    searchMock
      .mockResolvedValueOnce({
        provider: 'bangumi',
        results: [bangumiResult],
      })
      .mockResolvedValueOnce({ provider: 'anilist', results: [] })

    render(
      <ImageSearchDialog
        initialQuery="后藤一里"
        onClose={() => undefined}
        onSelect={async () => true}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByText('找到 1 个 Bangumi 结果。')
    expect(screen.getByRole('button', { name: '搜日文' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '改用 AniList 搜索' }))
    await screen.findByText(
      'AniList 没有找到结果，请尝试日文名、罗马音或切换 Bangumi。',
    )

    expect(searchMock).toHaveBeenCalledTimes(2)
    expect(searchMock).toHaveBeenLastCalledWith(
      '後藤ひとり',
      'character',
      expect.objectContaining({ provider: 'anilist' }),
    )
    expect(screen.getByDisplayValue('後藤ひとり')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '搜日文' }),
    ).not.toBeInTheDocument()
  })
})
