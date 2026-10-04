import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LocalImageAsset } from '../editor/assets'
import { LocalImageEditor } from './LocalImageEditor'

const searchMock = vi.hoisted(() => vi.fn())

vi.mock('../search/onlineImageSearch', async () => {
  const actual = await vi.importActual('../search/onlineImageSearch')
  return { ...actual, searchOnlineImages: searchMock }
})

function createAsset(): LocalImageAsset {
  const blob = new Blob(['image'], { type: 'image/png' })
  return {
    id: 'asset-editor',
    fileName: 'avatar.png',
    mimeType: 'image/png',
    byteLength: blob.size,
    blob,
    objectUrl: 'blob:avatar',
    image: {
      naturalWidth: 400,
      naturalHeight: 300,
      width: 400,
      height: 300,
    } as HTMLImageElement,
  }
}

describe('local image editor', () => {
  afterEach(() => {
    searchMock.mockReset()
    vi.restoreAllMocks()
  })

  it('uses the chosen Bangumi result to load AniList avatar candidates', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const bangumiResult = {
      provider: 'bangumi' as const,
      externalId: '32',
      kind: 'character' as const,
      name: '小叽',
      nativeName: 'ちぃ',
      alternateName: 'ちぃ',
      thumbnailUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
      downloadUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
      originalUrl: 'https://lain.bgm.tv/pic/crt/l/example.jpg',
      sourceUrl: 'https://bgm.tv/character/32',
    }
    const anilistResult = {
      provider: 'anilist' as const,
      externalId: '123',
      kind: 'character' as const,
      name: 'Chii',
      thumbnailUrl:
        'https://s4.anilist.co/file/anilistcdn/character/large/123.jpg',
      downloadUrl:
        'https://s4.anilist.co/file/anilistcdn/character/large/123.jpg',
      originalUrl:
        'https://s4.anilist.co/file/anilistcdn/character/large/123.jpg',
      sourceUrl: 'https://anilist.co/character/123',
    }
    searchMock.mockResolvedValue({
      provider: 'anilist',
      results: [anilistResult],
    })
    const onSelectOnlineImage = vi.fn().mockResolvedValue(true)
    render(
      <LocalImageEditor
        asset={createAsset()}
        cropShape={'circle'}
        title={'调整头像'}
        onlineImageSeed={bangumiResult}
        onSelectOnlineImage={onSelectOnlineImage}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    await screen.findByText('Chii')
    expect(screen.getByText('图片候选')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /小叽/ })).toBeInTheDocument()
    expect(searchMock).toHaveBeenCalledWith(
      'ちぃ',
      'character',
      expect.objectContaining({ provider: 'anilist' }),
    )
    await userEvent.click(screen.getByRole('button', { name: /Chii/ }))
    expect(onSelectOnlineImage).toHaveBeenCalledWith(anilistResult)
  })

  it('scales from a corner before applying once', async () => {
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(
      <LocalImageEditor
        asset={createAsset()}
        cropShape={'circle'}
        title={'调整头像'}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    )

    const handle = screen.getByRole('button', {
      name: '拖拽缩放图片（top-left）',
    })
    fireEvent.pointerDown(handle, {
      pointerId: 2,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(handle, {
      pointerId: 2,
      clientX: 40,
      clientY: 40,
    })
    fireEvent.pointerUp(handle, { pointerId: 2 })
    await user.click(screen.getByRole('button', { name: '应用' }))

    expect(onApply.mock.calls[0]![0].zoom).toBeGreaterThan(1)
  })

  it('resets an existing transform without changing the original asset', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(
      <LocalImageEditor
        asset={createAsset()}
        initialTransform={{
          zoom: 2,
          offsetX: 0.5,
          offsetY: -0.5,
          rotation: 30,
        }}
        cropShape={'square'}
        title={'调整图片'}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    )

    await user.click(screen.getByRole('button', { name: '重置' }))
    await user.click(screen.getByRole('button', { name: '应用' }))

    expect(onApply).toHaveBeenCalledWith({
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    })
  })

  it('can switch from image adjustment back to image search', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const onSearch = vi.fn()
    const user = userEvent.setup()
    render(
      <LocalImageEditor
        asset={createAsset()}
        cropShape={'circle'}
        title={'调整图片'}
        onSearch={onSearch}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: '调整图片' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('LOCAL IMAGE')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '搜索图片' }))
    expect(onSearch).toHaveBeenCalledOnce()
  })

  it('moves the image by dragging directly on the preview', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(
      HTMLCanvasElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      width: 300,
      height: 300,
      top: 0,
      right: 300,
      bottom: 300,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(
      <LocalImageEditor
        asset={createAsset()}
        cropShape={'circle'}
        title={'调整头像'}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    )
    const canvas = screen.getByLabelText('图片裁切预览')

    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      clientX: 130,
      clientY: 85,
    })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    await user.click(screen.getByRole('button', { name: '应用' }))

    expect(onApply).toHaveBeenCalledWith({
      zoom: 1,
      offsetX: 0.2,
      offsetY: -0.1,
      rotation: 0,
    })
  })

  it('zooms with the bottom-right corner handle', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const onApply = vi.fn()
    const user = userEvent.setup()
    render(
      <LocalImageEditor
        asset={createAsset()}
        cropShape={'square'}
        title={'调整图片'}
        onCancel={vi.fn()}
        onApply={onApply}
      />,
    )
    const handle = screen.getByRole('button', {
      name: '拖拽缩放图片（bottom-right）',
    })

    fireEvent.pointerDown(handle, {
      pointerId: 2,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(handle, {
      pointerId: 2,
      clientX: 160,
      clientY: 160,
    })
    fireEvent.pointerUp(handle, { pointerId: 2 })
    await user.click(screen.getByRole('button', { name: '应用' }))

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ zoom: expect.any(Number) }),
    )
    expect(onApply.mock.calls[0]![0].zoom).toBeGreaterThan(1)
  })
})
