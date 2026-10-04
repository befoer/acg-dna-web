import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NodeCreateDialog } from './NodeCreateDialog'

describe('node create dialog', () => {
  it('parses and de-duplicates batch names from APP-compatible separators', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <NodeCreateDialog
        kind={'attribute'}
        parentName={'动画偏好'}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole('tab', { name: '批量添加' }))
    await user.type(
      screen.getByRole('textbox', { name: /批量名称/ }),
      '配乐、演出\n配乐；镜头',
    )
    await user.click(screen.getByRole('button', { name: '添加 3 项' }))

    expect(onConfirm).toHaveBeenCalledWith(['配乐', '演出', '镜头'])
  })

  it('closes with Escape', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <NodeCreateDialog
        kind={'category'}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    )

    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
