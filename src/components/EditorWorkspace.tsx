import { useEffect, useState } from 'react'

import { downloadGraphPng } from '../canvas/renderGraph'
import { useEditor } from '../editor/editorContext'
import { AppearancePanel } from './AppearancePanel'
import { EditorPanel } from './EditorPanel'
import type { CanvasNodeActionRequest } from './canvasNodeActions'
import { GraphCanvas } from './GraphCanvas'
import { ProjectManager } from './ProjectManager'
import { ProfilePanel } from './ProfilePanel'
import { TemplatePanel } from './TemplatePanel'

type EditorPanelId = 'data' | 'template' | 'profile' | 'appearance'

const EDITOR_PANELS: ReadonlyArray<{
  id: EditorPanelId
  label: string
  icon: string
}> = [
  { id: 'template', label: '模板', icon: '▦' },
  { id: 'data', label: '数据', icon: '⌘' },
  { id: 'profile', label: '资料', icon: '◉' },
  { id: 'appearance', label: '外观', icon: '◐' },
]

function persistenceStatusText(
  persistence: ReturnType<typeof useEditor>['state']['persistence'],
): string {
  switch (persistence.status) {
    case 'restoring':
      return '正在恢复本地项目…'
    case 'dirty':
      return '有未保存更改'
    case 'saving':
      return '正在保存…'
    case 'saved': {
      const savedAt = persistence.lastSavedAt
        ? new Intl.DateTimeFormat('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }).format(new Date(persistence.lastSavedAt))
        : ''
      return savedAt ? `已保存 ${savedAt}` : '已保存'
    }
    case 'error':
      return `保存失败：${persistence.errorMessage ?? '未知错误'}`
    case 'unavailable':
      return '仅保存在当前标签页'
  }
}

interface HistoryControlsProps {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

function HistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: HistoryControlsProps) {
  return (
    <div className={'history-controls'} aria-label={'编辑历史'}>
      <button
        type={'button'}
        className={'history-button'}
        aria-label={'撤销'}
        title={'撤销（Ctrl/Cmd + Z）'}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <span aria-hidden={true}>↶</span>
      </button>
      <button
        type={'button'}
        className={'history-button'}
        aria-label={'重做'}
        title={'重做（Ctrl/Cmd + Shift + Z / Ctrl + Y）'}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <span aria-hidden={true}>↷</span>
      </button>
    </div>
  )
}

interface PersistenceStatusProps {
  className: string
  text: string
  failed: boolean
  onRetry: () => void
}

function PersistenceStatus({
  className,
  text,
  failed,
  onRetry,
}: PersistenceStatusProps) {
  const content = (
    <>
      <span className="status-dot" />
      <span className="persistence-status-text">{text}</span>
      {failed ? <em>重试</em> : null}
    </>
  )
  return failed ? (
    <button
      type="button"
      className={className + ' persistence-retry'}
      aria-label="保存失败，点击重试保存"
      onClick={onRetry}
    >
      {content}
    </button>
  ) : (
    <span className={className} role="status">
      {content}
    </span>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />
    </svg>
  )
}

export function EditorWorkspace() {
  const { state, dispatch, removeNode, retrySave } = useEditor()
  const [isExporting, setIsExporting] = useState(false)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [activePanel, setActivePanel] = useState<EditorPanelId>('data')
  const [contentBoundsEditing, setContentBoundsEditing] = useState(false)
  const [canvasNodeAction, setCanvasNodeAction] =
    useState<CanvasNodeActionRequest | null>(null)
  const persistenceText = persistenceStatusText(state.persistence)
  const canUndo = state.history.past.length > 0
  const canRedo = state.history.future.length > 0
  const activePanelLabel =
    EDITOR_PANELS.find((panel) => panel.id === activePanel)?.label ?? '数据'
  const selectPanel = (panelId: EditorPanelId): void => {
    setActivePanel(panelId)
    if (panelId !== 'appearance') setContentBoundsEditing(false)
  }

  const panelContent =
    activePanel === 'template' ? (
      <TemplatePanel />
    ) : activePanel === 'profile' ? (
      <ProfilePanel />
    ) : activePanel === 'appearance' ? (
      <AppearancePanel
        contentBoundsEditing={contentBoundsEditing}
        onContentBoundsEditingChange={setContentBoundsEditing}
      />
    ) : (
      <EditorPanel
        canvasNodeAction={canvasNodeAction}
        onCanvasNodeActionHandled={() => setCanvasNodeAction(null)}
      />
    )

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (!event.ctrlKey && !event.metaKey)) return
      const key = event.key.toLowerCase()
      const wantsUndo = key === 'z' && !event.shiftKey
      const wantsRedo = key === 'y' || (key === 'z' && event.shiftKey)
      if (wantsUndo && canUndo) {
        event.preventDefault()
        dispatch({ type: 'undo', at: new Date().toISOString() })
      } else if (wantsRedo && canRedo) {
        event.preventDefault()
        dispatch({ type: 'redo', at: new Date().toISOString() })
      }
    }

    window.addEventListener('keydown', handleHistoryShortcut)
    return () => window.removeEventListener('keydown', handleHistoryShortcut)
  }, [canRedo, canUndo, dispatch])

  const exportPng = async () => {
    setIsExporting(true)
    dispatch({ type: 'status-changed', message: '正在生成高清 PNG…' })
    try {
      await downloadGraphPng(state.document, state.assets)
      dispatch({ type: 'status-changed', message: 'PNG 已导出' })
    } catch (error) {
      dispatch({
        type: 'status-changed',
        message: error instanceof Error ? error.message : '导出失败',
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#main-editor"
          aria-label="ACG DNA Web 编辑器"
        >
          <span className="brand-mark">AC</span>
          <span className="brand-copy">
            <strong>ACG DNA</strong>
            <small>WEB EDITOR</small>
          </span>
        </a>

        <ProjectManager />

        <label className="project-name-field">
          <span className="sr-only">项目名称</span>
          <input
            value={state.document.name}
            maxLength={48}
            onChange={(event) =>
              dispatch({
                type: 'document-renamed',
                name: event.currentTarget.value,
                at: new Date().toISOString(),
              })
            }
            onBlur={(event) => {
              if (!event.currentTarget.value.trim()) {
                dispatch({
                  type: 'document-renamed',
                  name: '未命名属性图',
                  at: new Date().toISOString(),
                })
              }
            }}
          />
        </label>

        <HistoryControls
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() =>
            dispatch({ type: 'undo', at: new Date().toISOString() })
          }
          onRedo={() =>
            dispatch({ type: 'redo', at: new Date().toISOString() })
          }
        />

        <div className="topbar-actions">
          <PersistenceStatus
            className="session-status"
            text={persistenceText}
            failed={state.persistence.status === 'error'}
            onRetry={() => void retrySave()}
          />
          <button
            type="button"
            className="export-button"
            disabled={isExporting}
            onClick={() => void exportPng()}
          >
            <DownloadIcon />
            <span>{isExporting ? '导出中…' : '导出 PNG'}</span>
          </button>
        </div>
      </header>

      <main className="workspace" id="main-editor">
        <nav className="tool-rail" aria-label="编辑器工具">
          {EDITOR_PANELS.map((panel) => {
            const selected = activePanel === panel.id
            return (
              <button
                type={'button'}
                className={'tool-button' + (selected ? ' is-active' : '')}
                aria-pressed={selected}
                onClick={() => selectPanel(panel.id)}
                key={panel.id}
              >
                <span aria-hidden={true}>{panel.icon}</span>
                <small>{panel.label}</small>
              </button>
            )
          })}
        </nav>

        <section
          className={'editor-panel-slot'}
          aria-label={activePanelLabel + '功能面板'}
        >
          <div
            className={'mobile-panel-tabs'}
            role={'tablist'}
            aria-label={'编辑面板'}
          >
            {EDITOR_PANELS.map((panel) => {
              const selected = activePanel === panel.id
              return (
                <button
                  type={'button'}
                  role={'tab'}
                  aria-selected={selected}
                  className={selected ? 'is-active' : ''}
                  onClick={() => selectPanel(panel.id)}
                  key={panel.id}
                >
                  {panel.label}
                </button>
              )
            })}
          </div>
          {panelContent}
        </section>

        <section className="canvas-stage" aria-labelledby="preview-title">
          <div className="canvas-stage-header">
            <div>
              <span className="live-badge">
                <span /> LIVE
              </span>
              <h1 id="preview-title">画布预览</h1>
            </div>
            <div className="canvas-stage-actions">
              <label className="layout-control">
                <span>布局</span>
                <select
                  aria-label="布局方式"
                  value={state.document.canvas.layoutMode}
                  onChange={(event) =>
                    dispatch({
                      type: 'layout-mode-changed',
                      mode:
                        event.currentTarget.value === 'gravity'
                          ? 'gravity'
                          : 'packing',
                      at: new Date().toISOString(),
                    })
                  }
                >
                  <option value="packing">基础聚合</option>
                  <option value="gravity">重力碰撞</option>
                </select>
              </label>
              <div className="zoom-controls" aria-label="画布缩放">
                <button
                  type="button"
                  aria-label="缩小画布"
                  disabled={previewZoom <= 0.5}
                  onClick={() =>
                    setPreviewZoom((current) =>
                      Math.max(0.5, Number((current - 0.25).toFixed(2))),
                    )
                  }
                >
                  −
                </button>
                <button
                  type="button"
                  className="zoom-value"
                  aria-label="适应画布"
                  title="恢复完整适应"
                  onClick={() => setPreviewZoom(1)}
                >
                  {Math.round(previewZoom * 100)}%
                </button>
                <button
                  type="button"
                  aria-label="放大画布"
                  disabled={previewZoom >= 2}
                  onClick={() =>
                    setPreviewZoom((current) =>
                      Math.min(2, Number((current + 0.25).toFixed(2))),
                    )
                  }
                >
                  ＋
                </button>
              </div>
              <span className="canvas-size">
                {state.document.canvas.width} × {state.document.canvas.height}
              </span>
            </div>
            <PersistenceStatus
              className="mobile-status"
              text={persistenceText}
              failed={state.persistence.status === 'error'}
              onRetry={() => void retrySave()}
            />
          </div>
          <GraphCanvas
            zoom={previewZoom}
            showContentBounds={
              activePanel === 'appearance' && contentBoundsEditing
            }
            onNodeAction={(request) => {
              if (request.action === 'delete') {
                removeNode(request.nodeId)
                return
              }
              setActivePanel('data')
              setCanvasNodeAction(request)
            }}
          />
          <p className="canvas-hint">
            {contentBoundsEditing
              ? '拖动虚线框内部移动范围 · 拖四角或边框调整大小'
              : '点击气泡打开快捷操作 · 点击装饰图片后可拖动和缩放'}
          </p>
        </section>
      </main>
    </div>
  )
}
