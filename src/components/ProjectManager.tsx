import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from 'react'

import { useEditor } from '../editor/editorContext'

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function projectTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function ProjectManager() {
  const {
    state,
    projects,
    activeProjectId,
    projectActionPending,
    createProject,
    switchProject,
    duplicateProject,
    deleteProject,
    importProject,
    exportProject,
  } = useEditor()
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const storageAvailable = state.persistence.status !== 'unavailable'

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    await importProject(file)
    setOpen(false)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const projectFile = await exportProject()
      downloadBlob(projectFile.blob, projectFile.fileName)
      setOpen(false)
    } catch {
      // The Provider has already surfaced the export error in the status area.
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (!activeProjectId) return
    const activeName = state.document.name.trim() || '未命名属性图'
    if (!window.confirm('确定删除“' + activeName + '”吗？此操作不可撤销。')) {
      return
    }
    await deleteProject(activeProjectId)
    setOpen(false)
  }

  return (
    <div className={'project-manager'} ref={containerRef}>
      <button
        type={'button'}
        className={'project-manager-trigger'}
        aria-haspopup={'dialog'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden={true}>▦</span>
        <span className={'project-manager-trigger-label'}>项目</span>
      </button>

      {open ? (
        <section
          className={'project-popover'}
          role={'dialog'}
          aria-label={'项目管理'}
        >
          <div className={'project-popover-header'}>
            <div>
              <strong>本地项目</strong>
              <small>{projects.length} 个项目 · 自动保存</small>
            </div>
            <button
              type={'button'}
              className={'project-popover-close'}
              aria-label={'关闭项目管理'}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <ul className={'project-list'}>
            {projects.map((project) => {
              const active = project.id === activeProjectId
              const name = active
                ? state.document.name || '未命名属性图'
                : project.name
              return (
                <li key={project.id}>
                  <button
                    type={'button'}
                    className={
                      'project-list-item' + (active ? ' is-active' : '')
                    }
                    aria-current={active ? 'page' : undefined}
                    disabled={projectActionPending}
                    onClick={() => void switchProject(project.id)}
                  >
                    <span className={'project-list-mark'} aria-hidden={true}>
                      {active ? '●' : '○'}
                    </span>
                    <span className={'project-list-copy'}>
                      <strong>{name}</strong>
                      <small>{projectTime(project.updatedAt)}</small>
                    </span>
                    {active ? <em>当前</em> : null}
                  </button>
                </li>
              )
            })}
          </ul>

          <div className={'project-action-grid'}>
            <button
              type={'button'}
              disabled={!storageAvailable || projectActionPending}
              onClick={() => void createProject()}
            >
              ＋ 新建
            </button>
            <button
              type={'button'}
              disabled={!storageAvailable || projectActionPending}
              onClick={() => void duplicateProject()}
            >
              ⧉ 复制
            </button>
            <button
              type={'button'}
              disabled={!storageAvailable || projectActionPending}
              onClick={() => importInputRef.current?.click()}
            >
              ⇧ 导入
            </button>
            <button
              type={'button'}
              disabled={exporting || projectActionPending}
              onClick={() => void handleExport()}
            >
              {exporting ? '导出中…' : '⇩ 导出'}
            </button>
          </div>

          <input
            ref={importInputRef}
            className={'sr-only'}
            type={'file'}
            aria-label={'选择 ACG DNA 项目文件'}
            accept={'.json,application/json'}
            onChange={(event) => void handleImport(event)}
          />

          <button
            type={'button'}
            className={'project-delete-button'}
            disabled={!storageAvailable || projectActionPending}
            onClick={(event) => void handleDelete(event)}
          >
            删除当前项目
          </button>
          <p className={'project-popover-note'}>项目名称可直接在顶栏编辑。</p>
        </section>
      ) : null}
    </div>
  )
}
