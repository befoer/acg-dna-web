import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { createStarterGraph } from '../domain/graph'
import { createInitialEditorState } from '../editor/editorReducer'
import { OSHI_CHARACTERS, OSHI_IMPORTED } from '../integration/oshiImport'
import { OshiImportDialog } from './OshiImportDialog'

const editor = vi.hoisted(() => ({
  dispatch: vi.fn(),
  attachImage: vi.fn(),
}))
vi.mock('../editor/editorContext', () => ({
  useEditor: () => ({
    state: createInitialEditorState(createStarterGraph()),
    ...editor,
  }),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

it('开始导入后移除弹窗，慢图片只显示进度，完成后仍通知推日', async () => {
  const source = { postMessage: vi.fn(), closed: false }
  vi.stubGlobal('opener', source)
  window.history.replaceState(null, '', '/?import=oshi-calendar')
  let finish!: (value: string) => void
  editor.attachImage.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  )
  const { container } = render(<OshiImportDialog />)
  act(() =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: source as unknown as Window,
        origin: 'http://127.0.0.1:36524',
        data: {
          type: OSHI_CHARACTERS,
          version: 1,
          characters: [
            {
              name: '测试角色',
              works: [],
              image: 'data:image/png;base64,YQ==',
            },
          ],
        },
      }),
    ),
  )
  expect(screen.getByRole('dialog')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '确认导入' }))
  await waitFor(() => expect(editor.attachImage).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(container.querySelector('.graph-text-backdrop')).toBeNull()
  expect(screen.getByRole('status')).toHaveTextContent('正在导入图片 1 / 1')
  expect(editor.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'category-added' }),
  )
  await act(async () => finish('asset-id'))
  await waitFor(() =>
    expect(screen.queryByRole('status')).not.toBeInTheDocument(),
  )
  expect(source.postMessage).toHaveBeenCalledWith(
    { type: OSHI_IMPORTED, version: 1, count: 1 },
    'http://127.0.0.1:36524',
  )
  expect(editor.dispatch).toHaveBeenCalledWith({
    type: 'status-changed',
    message: '已从推日导入 1 个角色，1 张头像',
  })
})
