import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ImageSearchDialog,
  resetImageSearchHistoryForTests,
} from './ImageSearchDialog'

const searchMock = vi.hoisted(() => vi.fn())
const workSearchMock = vi.hoisted(() => vi.fn())
const workCharactersMock = vi.hoisted(() => vi.fn())

vi.mock('../search/onlineImageSearch', async () => {
  const actual = await vi.importActual('../search/onlineImageSearch')
  return {
    ...actual,
    searchOnlineImages: searchMock,
    searchBangumiWorks: workSearchMock,
    searchBangumiSubjectCharacters: workCharactersMock,
  }
})

describe('ImageSearchDialog', () => {
  afterEach(() => {
    vi.useRealTimers()
    searchMock.mockReset()
    workSearchMock.mockReset()
    workCharactersMock.mockReset()
    resetImageSearchHistoryForTests()
  })

  it('finds characters through a selected work after the provider hints', async () => {
    searchMock.mockResolvedValue({
      provider: 'bangumi',
      results: [
        {
          provider: 'bangumi',
          externalId: '87968',
          kind: 'character',
          name: '后藤一里',
          nativeName: '後藤ひとり',
          thumbnailUrl: 'https://gateway.example/hitori.jpg',
          downloadUrl: 'https://gateway.example/hitori.jpg',
          originalUrl: 'https://lain.bgm.tv/pic/crt/l/hitori.jpg',
          sourceUrl: 'https://bgm.tv/character/87968',
        },
      ],
    })
    const work = {
      externalId: '236957',
      name: '孤独摇滚',
      nativeName: 'ぼっち・ざ・ろっく！',
      alternateName: 'ぼっち・ざ・ろっく！',
      subjectType: 1 as const,
      thumbnailUrl: 'https://gateway.example/bocchi.jpg',
      sourceUrl: 'https://bgm.tv/subject/236957',
    }
    workSearchMock.mockResolvedValue([work])
    workCharactersMock.mockResolvedValue([
      {
        provider: 'bangumi',
        externalId: '87968',
        kind: 'character',
        name: '后藤一里',
        subtitle: '孤独摇滚',
        thumbnailUrl: 'https://gateway.example/hitori.jpg',
        downloadUrl: 'https://gateway.example/hitori.jpg',
        originalUrl: 'https://lain.bgm.tv/pic/crt/l/hitori.jpg',
        sourceUrl: 'https://bgm.tv/character/87968',
      },
    ])
    const onSelect = vi.fn().mockResolvedValue(false)
    const { container } = render(
      <ImageSearchDialog
        initialQuery="后藤一里"
        onClose={() => undefined}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByText('找到 1 个 Bangumi 结果。')
    const hints = screen.getByText('没有合适结果？').parentElement
    expect(hints).not.toBeNull()
    if (!hints) return
    expect(
      within(hints)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['改用 AniList 搜索', '搜日文', '按作品查找角色'])

    fireEvent.click(screen.getByRole('button', { name: '按作品查找角色' }))
    const input = screen.getByPlaceholderText('搜索动画、游戏或漫画')
    fireEvent.change(input, { target: { value: '孤独摇滚' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByText('找到 1 个作品，选择一个作品后显示该作品的角色。')
    expect(workCharactersMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '返回角色搜索' }))
    expect(screen.getByDisplayValue('后藤一里')).toBeInTheDocument()
    expect(screen.getByText('找到 1 个 Bangumi 结果。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '按作品查找角色' }))
    const secondInput = screen.getByPlaceholderText('搜索动画、游戏或漫画')
    fireEvent.change(secondInput, { target: { value: '孤独摇滚' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByText('找到 1 个作品，选择一个作品后显示该作品的角色。')
    const workButton = container.querySelector<HTMLButtonElement>(
      '.image-search-result.is-work .image-search-result-select',
    )
    expect(workButton).not.toBeNull()
    if (!workButton) return
    fireEvent.click(workButton)
    await screen.findByText('《孤独摇滚》中找到 1 个角色。')
    expect(workCharactersMock).toHaveBeenCalledWith(
      work,
      expect.any(AbortSignal),
    )
    expect(
      screen.getByRole('button', { name: '选择其他作品' }),
    ).toBeInTheDocument()
    const characterButton = container.querySelector<HTMLButtonElement>(
      '.image-search-result.is-character .image-search-result-select',
    )
    expect(characterButton).not.toBeNull()
    if (!characterButton) return
    fireEvent.click(characterButton)
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: '87968', subtitle: '孤独摇滚' }),
    )
  })

  it('offers AniList when a Bangumi search takes longer than ten seconds', () => {
    vi.useFakeTimers()
    searchMock.mockImplementation(() => new Promise(() => undefined))
    render(
      <ImageSearchDialog
        initialQuery="后藤一里"
        onClose={() => undefined}
        onSelect={async () => true}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(screen.getByText('Bangumi 搜索较慢')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '使用 AniList 搜索' }),
    ).toBeInTheDocument()
  })

  it('offers custom content and searches games through Bangumi only', async () => {
    searchMock.mockResolvedValue({ provider: 'bangumi', results: [] })
    const onCustomize = vi.fn()
    render(
      <ImageSearchDialog
        initialQuery="蔚蓝档案"
        onClose={() => undefined}
        onSelect={async () => true}
        onCustomize={onCustomize}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '自定义' }))
    expect(onCustomize).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '游戏' }))
    expect(screen.getByPlaceholderText('搜索游戏')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '改用 AniList 搜索' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await vi.waitFor(() =>
      expect(searchMock).toHaveBeenCalledWith(
        '蔚蓝档案',
        'game',
        expect.objectContaining({ provider: 'bangumi' }),
      ),
    )
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
    const { container } = render(
      <ImageSearchDialog
        initialQuery="小叽"
        onClose={onClose}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByRole('dialog', { name: '搜索图片' })).toBeInTheDocument()
    expect(screen.queryByText('ONLINE IMAGE')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByText('找到 1 个 Bangumi 结果。')
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

    const resultButton = container.querySelector<HTMLButtonElement>(
      '.image-search-result-select',
    )
    expect(resultButton).not.toBeNull()
    if (!resultButton) return
    fireEvent.click(resultButton)
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
    await screen.findByText('找到 1 个 Bangumi 结果。')

    expect(container.querySelector('.image-search-result img')).toHaveAttribute(
      'crossorigin',
      'anonymous',
    )
  })

  it('keeps the six most recent search terms below the search field', async () => {
    searchMock.mockResolvedValue({ provider: 'bangumi', results: [] })
    const { container } = render(
      <ImageSearchDialog
        initialQuery="初始搜索"
        onClose={() => undefined}
        onSelect={async () => true}
      />,
    )
    const input = container.querySelector<HTMLInputElement>(
      '.image-search-form input',
    )
    const searchButton = screen.getByRole('button', { name: '搜索' })
    expect(input).not.toBeNull()
    if (!input) return

    for (const term of [
      '搜索一',
      '搜索二',
      '搜索三',
      '搜索四',
      '搜索五',
      '搜索六',
      '搜索七',
    ]) {
      fireEvent.change(input, { target: { value: term } })
      fireEvent.click(searchButton)
      await vi.waitFor(() => expect(searchButton).toBeEnabled())
    }

    const history = screen.getByLabelText('历史搜索记录')
    expect(within(history).getAllByRole('button')).toHaveLength(6)
    expect(
      within(history).getByRole('button', { name: '使用历史搜索 搜索七' }),
    ).toBeInTheDocument()
    expect(
      within(history).queryByRole('button', { name: '使用历史搜索 搜索一' }),
    ).not.toBeInTheDocument()
  })

  it('renders remote thumbnails in batches of six', async () => {
    const results = Array.from({ length: 14 }, (_, index) => ({
      provider: 'bangumi' as const,
      externalId: String(index + 1),
      kind: 'character' as const,
      name: `角色 ${index + 1}`,
      thumbnailUrl: `https://bangumi-api.acg-dna.top/v1/image?id=${index + 1}`,
      downloadUrl: `https://bangumi-api.acg-dna.top/v1/image?id=${index + 1}`,
      originalUrl: `https://lain.bgm.tv/pic/crt/l/${index + 1}.jpg`,
      sourceUrl: `https://bgm.tv/character/${index + 1}`,
    }))
    searchMock.mockResolvedValue({ provider: 'bangumi', results })
    const { container } = render(
      <ImageSearchDialog
        initialQuery="角色"
        onClose={() => undefined}
        onSelect={async () => true}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByText('找到 14 个 Bangumi 结果。')
    expect(container.querySelectorAll('.image-search-result img')).toHaveLength(
      6,
    )

    const scrollArea = container.querySelector<HTMLElement>(
      '.image-search-results',
    )
    expect(scrollArea).not.toBeNull()
    if (!scrollArea) return
    Object.defineProperties(scrollArea, {
      scrollTop: { configurable: true, value: 700 },
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1100 },
    })

    fireEvent.scroll(scrollArea)
    expect(container.querySelectorAll('.image-search-result img')).toHaveLength(
      12,
    )

    fireEvent.scroll(scrollArea)
    expect(container.querySelectorAll('.image-search-result img')).toHaveLength(
      14,
    )
    expect(screen.queryByText('继续向下滚动加载更多')).not.toBeInTheDocument()
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
    await screen.findByText('找到 1 个 Bangumi 结果。')
    first.unmount()

    const { container } = render(
      <ImageSearchDialog
        cacheKey={'node-32'}
        initialQuery={'小叽'}
        onClose={() => undefined}
        onSelect={async () => true}
      />,
    )
    expect(screen.getByDisplayValue('小叽')).toBeInTheDocument()
    expect(screen.getByText('找到 1 个 Bangumi 结果。')).toBeInTheDocument()
    expect(
      container.querySelector('.image-search-result-select'),
    ).toHaveTextContent('小叽')
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
