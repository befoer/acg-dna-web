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
import { createGraphLayout } from './canvas/renderGraph'
import { createStarterGraph } from './domain/graph'
import type { ProjectRepository } from './editor/persistence'

describe('local editor flow', () => {
  const renderLegacyEditorFixture = () =>
    render(<App initialDocument={createStarterGraph()} />)

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
    renderLegacyEditorFixture()

    const nameInput = screen.getByLabelText('名称')
    expect(nameInput).toHaveValue('叙事氛围')

    await user.clear(nameInput)
    await user.type(nameInput, '赛博叙事')
    expect(screen.getByText('赛博叙事')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '＋ 添加子属性' }))
    expect(
      screen.getByRole('dialog', { name: '添加子属性' }),
    ).toBeInTheDocument()
    const childName = screen.getByRole('textbox', {
      name: /子属性名称/,
    })
    await user.type(childName, '镜头语言')
    await user.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getByLabelText('名称')).toHaveValue('镜头语言')
  })

  it('opens contextual actions around the selected canvas node', async () => {
    const user = userEvent.setup()
    renderLegacyEditorFixture()

    expect(
      screen.queryByRole('toolbar', { name: '属性圈操作' }),
    ).not.toBeInTheDocument()
    const graph = createStarterGraph()
    const target = createGraphLayout(graph).flatNodes.find(
      (node) => node.name === '叙事氛围',
    )
    expect(target).toBeDefined()
    const canvas = screen.getByRole('img', { name: /属性图预览/ })
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: graph.canvas.width,
      bottom: graph.canvas.height,
      width: graph.canvas.width,
      height: graph.canvas.height,
      toJSON: () => ({}),
    })
    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      clientX: target?.x,
      clientY: (target?.y ?? 0) - (target?.radius ?? 0) * 0.55,
    })

    const actions = await screen.findByRole('toolbar', {
      name: '属性圈操作',
    })
    await user.click(
      within(actions).getByRole('button', { name: '调整标签图片' }),
    )
    expect(
      await screen.findByRole('dialog', { name: '在线选择图片' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭' }))

    fireEvent.pointerDown(canvas, {
      pointerId: 2,
      clientX: target?.x,
      clientY: (target?.y ?? 0) - (target?.radius ?? 0) * 0.55,
    })
    const childActions = await screen.findByRole('toolbar', {
      name: '属性圈操作',
    })
    await user.click(
      within(childActions).getByRole('button', { name: '添加子标签' }),
    )
    expect(
      await screen.findByRole('dialog', { name: '添加子属性' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))

    fireEvent.pointerDown(canvas, {
      pointerId: 3,
      clientX: target?.x,
      clientY: (target?.y ?? 0) - (target?.radius ?? 0) * 0.55,
    })
    const deleteActions = await screen.findByRole('toolbar', {
      name: '属性圈操作',
    })
    await user.click(
      within(deleteActions).getByRole('button', { name: '删除标签' }),
    )
    await waitFor(() =>
      expect(screen.getByLabelText('名称')).not.toHaveValue('叙事氛围'),
    )
  })

  it('switches layout and changes only the preview zoom', async () => {
    const user = userEvent.setup()
    renderLegacyEditorFixture()

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
    renderLegacyEditorFixture()

    const toolRail = screen.getByRole('navigation', {
      name: '编辑器工具',
    })
    await user.click(within(toolRail).getByRole('button', { name: /模板/ }))
    expect(screen.getByLabelText('模板面板')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /可爱日记/ }))
    const canvas = screen.getByRole('img', { name: /属性图预览/ })
    expect(canvas).toHaveAttribute('width', '1280')
    expect(canvas).toHaveAttribute('height', '1847')

    await user.click(within(toolRail).getByRole('button', { name: /外观/ }))
    await user.click(screen.getByRole('tab', { name: '画布' }))
    const editBounds = screen.getByRole('button', { name: '显示调整框' })
    expect(editBounds).toHaveAttribute('aria-pressed', 'false')
    await user.click(editBounds)
    expect(screen.getByRole('button', { name: '隐藏调整框' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('tab', { name: '装饰' }))
    await user.click(screen.getByRole('tab', { name: '画布' }))
    expect(screen.getByRole('button', { name: '显示调整框' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    const width = screen.getByRole('slider', { name: '宽度' })
    expect(width).toHaveValue('87')
    fireEvent.change(width, { target: { value: '60' } })
    expect(width).toHaveValue('60')
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  it('switches the compact appearance sections without adding main tools', async () => {
    const user = userEvent.setup()
    renderLegacyEditorFixture()

    const toolRail = screen.getByRole('navigation', {
      name: '编辑器工具',
    })
    await user.click(within(toolRail).getByRole('button', { name: /外观/ }))

    expect(screen.getByRole('tab', { name: '装饰' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.click(screen.getByRole('tab', { name: /图层/ }))
    expect(screen.getByText('列表从上到下对应画布从前到后')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: '画布' }))
    expect(screen.getByText('画布比例')).toBeVisible()
    expect(within(toolRail).getAllByRole('button')).toHaveLength(4)
    expect(
      within(screen.getByRole('tablist', { name: '编辑面板' })).getAllByRole(
        'tab',
      ),
    ).toHaveLength(4)
  })

  it('shows the effective custom text visibility in the shared layer list', async () => {
    const user = userEvent.setup()
    renderLegacyEditorFixture()
    const toolRail = screen.getByRole('navigation', {
      name: '编辑器工具',
    })

    await user.click(within(toolRail).getByRole('button', { name: /资料/ }))
    await user.click(screen.getByRole('button', { name: '＋ 添加文字' }))
    await user.click(screen.getByRole('button', { name: '隐藏自定义文字' }))
    await user.click(within(toolRail).getByRole('button', { name: /外观/ }))
    await user.click(screen.getByRole('tab', { name: /图层/ }))

    const textLayer = screen
      .getByText('自定义文本')
      .closest<HTMLElement>('[data-layer-id]')
    expect(textLayer).toHaveClass('is-hidden')
    await user.click(
      screen.getByRole('button', { name: '显示图层 自定义文本' }),
    )
    expect(textLayer).not.toHaveClass('is-hidden')
  })

  it('edits the shared APP profile panel with local-only data', async () => {
    const user = userEvent.setup()
    renderLegacyEditorFixture()

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
    renderLegacyEditorFixture()

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

  it('collapses and expands category data without deleting it', async () => {
    const user = userEvent.setup()
    renderLegacyEditorFixture()

    await user.click(screen.getByRole('button', { name: '折叠 动画偏好' }))
    expect(screen.queryByText('叙事氛围')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '展开 动画偏好' }))
    expect(screen.getByText('叙事氛围')).toBeInTheDocument()
  })

  it('imports and previews APP-compatible text data', async () => {
    const user = userEvent.setup()
    renderLegacyEditorFixture()

    await user.click(screen.getByRole('button', { name: '导入文字' }))
    expect(
      screen.getByRole('dialog', { name: '导入文字结构' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '填入示例' }))
    expect(screen.getByText(/识别到/)).toHaveTextContent(
      '1 个分类、2 个属性、2 个子属性',
    )
    await user.click(screen.getByRole('button', { name: '确认追加' }))
    expect(screen.getByLabelText('数据编辑面板')).toHaveTextContent(
      '已追加1 个文本分类',
    )

    await user.click(screen.getByRole('button', { name: '导出文字' }))
    expect(screen.getByRole('dialog', { name: '导出文字' })).toBeInTheDocument()
    expect(
      (screen.getByLabelText('完整结构文本') as HTMLTextAreaElement).value,
    ).toContain('动画偏好')
    await user.click(screen.getByRole('tab', { name: '仅标签' }))
    expect(
      (screen.getByLabelText('仅标签文本') as HTMLTextAreaElement).value,
    ).toContain('叙事氛围')
  })

  it('edits and resets global label settings from the data panel', async () => {
    const user = userEvent.setup()
    renderLegacyEditorFixture()

    await user.click(screen.getByRole('button', { name: '全局设置' }))
    expect(screen.getByLabelText('全局标签设置')).toBeInTheDocument()

    const categoryDisplay = screen.getByRole('button', {
      name: '分类显示',
    })
    expect(categoryDisplay).toHaveAttribute('aria-pressed', 'true')
    await user.click(categoryDisplay)
    expect(categoryDisplay).toHaveAttribute('aria-pressed', 'false')

    const fontFamily = screen.getByRole('combobox', { name: '标签字体' })
    expect(
      within(fontFamily).getByRole('option', { name: '系统黑体' }),
    ).toBeInTheDocument()
    expect(
      within(fontFamily).getByRole('option', {
        name: '资源圆体 Bold',
      }),
    ).toBeInTheDocument()
    await user.selectOptions(fontFamily, 'resource-rounded')
    expect(screen.getByText(/固定 Bold 字重/)).toBeInTheDocument()
    expect(
      screen.queryByRole('slider', { name: '字重' }),
    ).not.toBeInTheDocument()
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
    renderLegacyEditorFixture()

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

  it('automatically removes exact duplicate projects after restore', async () => {
    const oldDocument = createStarterGraph('2026-07-17T01:00:00.000Z')
    oldDocument.id = 'graph-old-duplicate'
    const activeDocument = createStarterGraph('2026-07-17T02:00:00.000Z')
    activeDocument.id = 'graph-active-copy'
    const summaries = [
      {
        id: activeDocument.id,
        name: activeDocument.name,
        createdAt: activeDocument.createdAt,
        updatedAt: activeDocument.updatedAt,
        savedAt: '2026-07-17T02:00:00.000Z',
      },
      {
        id: oldDocument.id,
        name: oldDocument.name,
        createdAt: oldDocument.createdAt,
        updatedAt: oldDocument.updatedAt,
        savedAt: '2026-07-17T01:00:00.000Z',
      },
    ]
    const deleteProject = vi.fn().mockResolvedValue(undefined)
    const repository: ProjectRepository = {
      listProjects: vi.fn().mockResolvedValue(summaries),
      loadActiveProject: vi.fn().mockResolvedValue({
        projectId: activeDocument.id,
        snapshot: {
          document: activeDocument,
          assets: [],
          savedAt: '2026-07-17T02:00:00.000Z',
        },
      }),
      loadProject: vi.fn().mockImplementation(async (projectId: string) => ({
        document:
          projectId === activeDocument.id ? activeDocument : oldDocument,
        assets: [],
        savedAt:
          projectId === activeDocument.id
            ? '2026-07-17T02:00:00.000Z'
            : '2026-07-17T01:00:00.000Z',
      })),
      saveProject: vi.fn().mockResolvedValue(undefined),
      setActiveProject: vi.fn().mockResolvedValue(undefined),
      deleteProject,
    }

    render(<App repository={repository} autosaveDelayMs={5} />)

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith(oldDocument.id)
    })
    expect(deleteProject).not.toHaveBeenCalledWith(activeDocument.id)
  })

  it('retries a failed local save from the visible status control', async () => {
    const restoredDocument = createStarterGraph('2026-07-16T00:00:00.000Z')
    const saveProject = vi
      .fn()
      .mockRejectedValueOnce(new Error('模拟保存失败'))
      .mockResolvedValue(undefined)
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
    fireEvent.change(projectName, { target: { value: '等待重试' } })

    const retryButtons = await screen.findAllByRole('button', {
      name: '保存失败，点击重试保存',
    })
    fireEvent.click(retryButtons[0]!)

    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: '保存失败，点击重试保存',
        }),
      ).not.toBeInTheDocument()
    })
  })

  it('undoes and redoes edits with buttons and keyboard shortcuts', async () => {
    const user = userEvent.setup()
    renderLegacyEditorFixture()

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
