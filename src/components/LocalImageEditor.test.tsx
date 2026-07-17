import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LocalImageAsset } from '../editor/assets'
import { LocalImageEditor } from './LocalImageEditor'

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
  afterEach(() => vi.restoreAllMocks())

  it('edits zoom, position, and rotation before applying once', async () => {
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

    fireEvent.change(screen.getByRole('slider', { name: '缩放' }), {
      target: { value: '175' },
    })
    fireEvent.change(screen.getByRole('slider', { name: '水平位置' }), {
      target: { value: '40' },
    })
    await user.click(screen.getByRole('button', { name: '↷ 右转 90°' }))
    await user.click(screen.getByRole('button', { name: '应用' }))

    expect(onApply).toHaveBeenCalledWith({
      zoom: 1.75,
      offsetX: 0.4,
      offsetY: 0,
      rotation: 90,
    })
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

  it('zooms with the mouse wheel and the drag handle', async () => {
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
    const canvas = screen.getByLabelText('图片裁切预览')
    const handle = screen.getByRole('button', { name: '拖拽缩放图片' })

    fireEvent.wheel(canvas, { deltaY: -100 })
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
    expect(onApply.mock.calls[0]![0].zoom).toBeGreaterThan(1.5)
  })
})
