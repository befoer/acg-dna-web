import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { createStarterGraph } from '../domain/graph'
import type {
  PersistedEditorSnapshot,
  ProjectRepository,
  ProjectSummary,
} from '../editor/persistence'
import { serializeProjectFile } from '../editor/projectFile'

function projectSnapshot(
  id: string,
  name: string,
  savedAt: string,
): PersistedEditorSnapshot {
  const document = createStarterGraph(savedAt)
  document.id = id
  document.name = name
  return {
    document,
    assets: [],
    savedAt,
  }
}

class MemoryProjectRepository implements ProjectRepository {
  readonly snapshots = new Map<string, PersistedEditorSnapshot>()
  activeProjectId: string | null

  constructor(
    snapshots: PersistedEditorSnapshot[],
    activeProjectId: string | null,
  ) {
    snapshots.forEach((snapshot) =>
      this.snapshots.set(snapshot.document.id, snapshot),
    )
    this.activeProjectId = activeProjectId
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return Array.from(this.snapshots.values())
      .map((snapshot) => ({
        id: snapshot.document.id,
        name: snapshot.document.name,
        createdAt: snapshot.document.createdAt,
        updatedAt: snapshot.document.updatedAt,
        savedAt: snapshot.savedAt,
      }))
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
  }

  async loadActiveProject() {
    if (!this.activeProjectId) return null
    const snapshot = this.snapshots.get(this.activeProjectId)
    return snapshot ? { projectId: this.activeProjectId, snapshot } : null
  }

  async loadProject(projectId: string) {
    return this.snapshots.get(projectId) ?? null
  }

  async saveProject(projectId: string, snapshot: PersistedEditorSnapshot) {
    this.snapshots.set(projectId, snapshot)
  }

  async setActiveProject(projectId: string) {
    if (!this.snapshots.has(projectId)) throw new Error('项目不存在')
    this.activeProjectId = projectId
  }

  async deleteProject(projectId: string) {
    this.snapshots.delete(projectId)
    if (this.activeProjectId === projectId) this.activeProjectId = null
  }
}

function projectFile(content: string, fileName = 'project.acgdna.json'): File {
  const file = new File([content], fileName, { type: 'application/json' })
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(content),
    })
  }
  return file
}

describe('project manager flow', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('saves the current edit before switching projects', async () => {
    const user = userEvent.setup()
    const first = projectSnapshot(
      'graph-first',
      '项目一',
      '2026-07-16T01:00:00.000Z',
    )
    const second = projectSnapshot(
      'graph-second',
      '项目二',
      '2026-07-16T02:00:00.000Z',
    )
    const repository = new MemoryProjectRepository(
      [first, second],
      first.document.id,
    )
    render(<App repository={repository} autosaveDelayMs={60_000} />)

    await user.click(screen.getByRole('button', { name: '项目' }))
    expect(screen.queryByText('项目一')).not.toBeInTheDocument()
    expect(screen.queryByText('项目二')).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /打开项目/ })[0]!)

    await waitFor(() => expect(repository.activeProjectId).toBe('graph-second'))
    expect(repository.activeProjectId).toBe('graph-second')
  })

  it('duplicates the active project and safely deletes the copy', async () => {
    const user = userEvent.setup()
    const original = projectSnapshot(
      'graph-original',
      '原项目',
      '2026-07-16T03:00:00.000Z',
    )
    const repository = new MemoryProjectRepository(
      [original],
      original.document.id,
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App repository={repository} />)

    await user.click(screen.getByRole('button', { name: '项目' }))
    await user.click(screen.getByRole('button', { name: '⧉ 复制' }))

    await waitFor(() => expect(repository.snapshots.size).toBe(2))
    expect(repository.snapshots.size).toBe(2)
    expect(repository.activeProjectId).not.toBe('graph-original')

    await user.click(screen.getByRole('button', { name: '删除当前项目' }))
    await waitFor(() => expect(repository.snapshots.size).toBe(1))
    expect(repository.snapshots.size).toBe(1)
    expect(repository.activeProjectId).toBe('graph-original')
  })

  it('creates a separate starter project from the project menu', async () => {
    const user = userEvent.setup()
    const original = projectSnapshot(
      'graph-existing',
      '已有项目',
      '2026-07-16T03:30:00.000Z',
    )
    const repository = new MemoryProjectRepository(
      [original],
      original.document.id,
    )
    render(<App repository={repository} />)

    await user.click(screen.getByRole('button', { name: '项目' }))
    await user.click(screen.getByRole('button', { name: '＋ 新建' }))

    await waitFor(() => expect(repository.snapshots.size).toBe(2))
    expect(repository.snapshots.size).toBe(2)
    expect(repository.activeProjectId).not.toBe('graph-existing')
  })

  it('imports a validated project and keeps it unchanged after a bad import', async () => {
    const user = userEvent.setup()
    const original = projectSnapshot(
      'graph-current',
      '当前项目',
      '2026-07-16T04:00:00.000Z',
    )
    const imported = projectSnapshot(
      'graph-imported-source',
      '导入项目',
      '2026-07-16T05:00:00.000Z',
    )
    const serialized = await serializeProjectFile(imported, imported.savedAt)
    const repository = new MemoryProjectRepository(
      [original],
      original.document.id,
    )
    render(<App repository={repository} />)

    await user.click(screen.getByRole('button', { name: '项目' }))
    await user.upload(
      screen.getByLabelText('选择 ACG DNA 项目文件'),
      projectFile(serialized),
    )

    await waitFor(() =>
      expect(repository.activeProjectId).not.toBe('graph-current'),
    )
    expect(repository.snapshots.size).toBe(2)
    const importedProjectId = repository.activeProjectId
    expect(importedProjectId).not.toBe('graph-imported-source')

    await user.click(screen.getByRole('button', { name: '项目' }))
    await user.upload(
      screen.getByLabelText('选择 ACG DNA 项目文件'),
      projectFile('{not-json', 'broken.acgdna.json'),
    )

    await waitFor(() =>
      expect(screen.getByLabelText('数据编辑面板')).toHaveTextContent(
        '项目文件不是有效的 JSON',
      ),
    )
    expect(repository.activeProjectId).toBe(importedProjectId)
    expect(repository.snapshots.size).toBe(2)
  })
})
