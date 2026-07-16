import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { createStarterGraph } from './domain/graph'
import type { ProjectRepository } from './editor/persistence'

describe('local editor flow', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('edits a selected node and adds a third-level child', async () => {
    const user = userEvent.setup()
    render(<App />)

    const nameInput = screen.getByLabelText('名称')
    expect(nameInput).toHaveValue('叙事氛围')

    await user.clear(nameInput)
    await user.type(nameInput, '赛博叙事')
    expect(screen.getByText('赛博叙事')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '＋ 添加子属性' }))
    expect(screen.getByLabelText('名称')).toHaveValue('新子属性')
  })

  it('switches layout and changes only the preview zoom', async () => {
    const user = userEvent.setup()
    render(<App />)

    const layout = screen.getByRole('combobox', { name: '布局方式' })
    expect(layout).toHaveValue('gravity')
    await user.selectOptions(layout, 'packing')
    expect(screen.getByLabelText('数据编辑面板')).toHaveTextContent(
      '已启用基础聚合布局',
    )

    const fit = screen.getByRole('button', { name: '适应画布' })
    expect(fit).toHaveTextContent('100%')
    await user.click(screen.getByRole('button', { name: '放大画布' }))
    expect(fit).toHaveTextContent('125%')
  })

  it('applies local templates and edits the shared label range', async () => {
    const user = userEvent.setup()
    render(<App />)

    const toolRail = screen.getByRole('navigation', {
      name: '编辑器工具',
    })
    await user.click(within(toolRail).getByRole('button', { name: /模板/ }))
    expect(screen.getByLabelText('模板面板')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /可爱日记/ }))
    const canvas = screen.getByRole('img', { name: /属性图预览/ })
    expect(canvas).toHaveAttribute('width', '1280')
    expect(canvas).toHaveAttribute('height', '1847')

    await user.click(within(toolRail).getByRole('button', { name: /范围/ }))
    const width = screen.getByRole('slider', { name: '宽度' })
    expect(width).toHaveValue('87')
    fireEvent.change(width, { target: { value: '60' } })
    expect(width).toHaveValue('60')
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  it('edits the shared APP profile panel with local-only data', async () => {
    const user = userEvent.setup()
    render(<App />)

    const toolRail = screen.getByRole('navigation', {
      name: '编辑器工具',
    })
    await user.click(within(toolRail).getByRole('button', { name: /模板/ }))
    await user.click(screen.getByRole('button', { name: /可爱日记/ }))
    await user.click(within(toolRail).getByRole('button', { name: /资料/ }))
    expect(screen.getByLabelText('资料面板')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /可爱日记2/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const nickname = screen.getByRole('textbox', { name: '资料昵称' })
    await user.clear(nickname)
    await user.type(nickname, '离线作者')
    expect(nickname).toHaveValue('离线作者')
    await user.click(screen.getByRole('button', { name: '性别：女' }))
    expect(screen.getByRole('button', { name: '性别：女' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: '增加资料标签' }))
    const label = screen.getByRole('textbox', { name: '资料标签 1' })
    await user.type(label, '宁波')
    expect(label).toHaveValue('宁波')
  })

  it('edits weight from the compact slider beside each node name', () => {
    render(<App />)

    const slider = screen.getByRole('slider', { name: '叙事氛围 权重' })
    const row = slider.closest<HTMLElement>('.tree-row')
    expect(row).toBeInTheDocument()
    if (!row) return
    expect(within(row).getByText('叙事氛围')).toBeInTheDocument()
    expect(within(row).getByText('86')).toBeInTheDocument()

    fireEvent.change(slider, { target: { value: '45' } })

    expect(slider).toHaveValue('45')
    expect(within(row).getByText('45')).toBeInTheDocument()
    expect(screen.queryByLabelText('节点权重数值')).not.toBeInTheDocument()
  })

  it('edits and resets global label settings from the data panel', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '全局设置' }))
    expect(screen.getByLabelText('全局标签设置')).toBeInTheDocument()

    const fontFamily = screen.getByRole('combobox', { name: '标签字体' })
    expect(
      within(fontFamily).getByRole('option', { name: '系统黑体' }),
    ).toBeInTheDocument()
    expect(
      within(fontFamily).getByRole('option', {
        name: '资源圆体 Bold',
      }),
    ).toBeInTheDocument()
    expect(
      within(fontFamily).getByRole('option', {
        name: '阿里妈妈方圆体',
      }),
    ).toBeInTheDocument()
    await user.selectOptions(fontFamily, 'resource-rounded')
    expect(screen.getByText(/固定 Bold 字重/)).toBeInTheDocument()
    expect(
      screen.queryByRole('slider', { name: '字重' }),
    ).not.toBeInTheDocument()
    await user.selectOptions(fontFamily, 'alimama-fangyuan')
    const roundness = screen.getByRole('slider', { name: '圆度' })
    expect(roundness).toHaveValue('0')
    expect(document.querySelector('.graph-label-overlay')).toBeInTheDocument()
    expect(
      document.querySelector<SVGTextElement>('.graph-label-overlay text')?.style
        .fontVariationSettings,
    ).toContain('"BEVL" 1')
    fireEvent.change(roundness, { target: { value: '40' } })
    expect(roundness).toHaveValue('40')
    expect(
      document.querySelector<SVGTextElement>('.graph-label-overlay text')?.style
        .fontVariationSettings,
    ).toContain('"BEVL" 40.6')

    const categoryText = screen.getByRole('button', {
      name: '分类文字',
    })
    expect(categoryText).toHaveAttribute('aria-pressed', 'true')
    await user.click(categoryText)
    expect(categoryText).toHaveAttribute('aria-pressed', 'false')

    const categoryStroke = screen.getByRole('slider', {
      name: '分类描边',
    })
    fireEvent.change(categoryStroke, { target: { value: '6' } })
    expect(categoryStroke).toHaveValue('6')

    const unifiedColor = screen.getByRole('checkbox', {
      name: '统一标签颜色',
    })
    const color = screen.getByLabelText('标签颜色')
    expect(color).toBeDisabled()
    await user.click(unifiedColor)
    expect(color).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '重置' }))
    expect(categoryText).toHaveAttribute('aria-pressed', 'true')
    expect(categoryStroke).toHaveValue('2')
    expect(color).toBeDisabled()
    expect(fontFamily).toHaveValue('sans')
    expect(screen.getByRole('slider', { name: '字重' })).toHaveValue('600')

    await user.click(screen.getByRole('button', { name: '返回数据编辑' }))
    expect(screen.getByLabelText('名称')).toBeInTheDocument()
  })

  it('fits the full logical canvas and enlarges only its CSS preview size', async () => {
    const user = userEvent.setup()
    render(<App />)

    const canvas = screen.getByRole('img', { name: /属性图预览/ })
    await waitFor(() => {
      expect(Number.parseFloat(canvas.style.height)).toBeCloseTo(664, 5)
    })
    expect(canvas).toHaveAttribute('width', '1380')
    expect(canvas).toHaveAttribute('height', '2000')
    expect(canvas.closest('.canvas-frame')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '放大画布' }))
    expect(Number.parseFloat(canvas.style.height)).toBeCloseTo(830, 5)
    expect(canvas).toHaveAttribute('height', '2000')
  })

  it('restores the local project and auto-saves the next edit', async () => {
    const restoredDocument = createStarterGraph('2026-07-16T00:00:00.000Z')
    restoredDocument.name = '已恢复项目'
    const saveProject = vi.fn().mockResolvedValue(undefined)
    const repository: ProjectRepository = {
      listProjects: vi.fn().mockResolvedValue([
        {
          id: restoredDocument.id,
          name: restoredDocument.name,
          createdAt: restoredDocument.createdAt,
          updatedAt: restoredDocument.updatedAt,
          savedAt: '2026-07-16T01:00:00.000Z',
        },
      ]),
      loadActiveProject: vi.fn().mockResolvedValue({
        projectId: restoredDocument.id,
        snapshot: {
          document: restoredDocument,
          assets: [],
          savedAt: '2026-07-16T01:00:00.000Z',
        },
      }),
      loadProject: vi.fn().mockResolvedValue(null),
      saveProject,
      setActiveProject: vi.fn().mockResolvedValue(undefined),
      deleteProject: vi.fn().mockResolvedValue(undefined),
    }

    render(<App repository={repository} autosaveDelayMs={5} />)

    const projectName = await screen.findByRole('textbox', {
      name: '项目名称',
    })
    expect(projectName).toHaveValue('已恢复项目')
    expect(saveProject).not.toHaveBeenCalled()

    fireEvent.change(projectName, {
      target: { value: '自动保存项目' },
    })

    await waitFor(
      () => {
        expect(saveProject).toHaveBeenCalled()
      },
      { timeout: 2000 },
    )
    const lastSnapshot = saveProject.mock.calls.at(-1)?.[1]
    expect(lastSnapshot?.document.name).toBe('自动保存项目')
    await waitFor(() => {
      expect(screen.getAllByText(/^已保存/).length).toBeGreaterThan(0)
    })
  })

  it('undoes and redoes edits with buttons and keyboard shortcuts', async () => {
    const user = userEvent.setup()
    render(<App />)

    const projectName = screen.getByRole('textbox', { name: '项目名称' })
    const undo = screen.getByRole('button', { name: '撤销' })
    const redo = screen.getByRole('button', { name: '重做' })
    expect(undo).toBeDisabled()
    expect(redo).toBeDisabled()

    fireEvent.change(projectName, { target: { value: '历史项目' } })
    expect(undo).toBeEnabled()

    await user.click(undo)
    expect(projectName).toHaveValue('我的 ACG DNA')
    expect(redo).toBeEnabled()

    fireEvent.keyDown(window, {
      key: 'z',
      ctrlKey: true,
      shiftKey: true,
    })
    expect(projectName).toHaveValue('历史项目')

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(projectName).toHaveValue('我的 ACG DNA')

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(projectName).toHaveValue('历史项目')
  })
})
