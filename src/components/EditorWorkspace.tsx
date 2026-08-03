import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import brandLogo from '../assets/brand-logo.svg'
import appearanceIcon from '../assets/editor-appearance.svg'
import dataIcon from '../assets/editor-data.svg'
import profileIcon from '../assets/editor-profile.svg'
import templateIcon from '../assets/editor-template.svg'
import textLogo from '../assets/text-logo.svg'
import { downloadGraphPng } from '../canvas/renderGraph'
import { useEditor } from '../editor/editorContext'
import { userErrorMessage } from '../errors/userErrorMessage'
import { AppearancePanel } from './AppearancePanel'
import { EditorPanel } from './EditorPanel'
import type { CanvasNodeActionRequest } from './canvasNodeActions'
import { GraphCanvas } from './GraphCanvas'
import { ProjectManager } from './ProjectManager'
import { ProfilePanel } from './ProfilePanel'
import { TemplatePanel } from './TemplatePanel'

const PREVIEW_ZOOM_MIN = 0.5
const PREVIEW_ZOOM_MAX = 2

function changePreviewZoom(current: number, delta: number): number {
  return Math.max(
    PREVIEW_ZOOM_MIN,
    Math.min(PREVIEW_ZOOM_MAX, Number((current + delta).toFixed(2))),
  )
}

type EditorPanelId = 'data' | 'template' | 'profile' | 'appearance'

const EDITOR_PANELS: ReadonlyArray<{
  id: EditorPanelId
  label: string
  icon: string
}> = [
  { id: 'template', label: '模板', icon: templateIcon },
  { id: 'data', label: '数据', icon: dataIcon },
  { id: 'profile', label: '资料', icon: profileIcon },
  { id: 'appearance', label: '外观', icon: appearanceIcon },
]

function EditorPanelIcon({ icon }: { icon: string }) {
  return (
    <span className="editor-panel-icon-frame" aria-hidden="true">
      <span
        className="editor-panel-icon"
        style={{ '--editor-panel-icon': `url("${icon}")` } as CSSProperties}
      />
    </span>
  )
}

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
        <svg
          className={'history-icon'}
          viewBox={'0 0 24 24'}
          aria-hidden={true}
        >
          <path d={'M9 7 4 12l5 5'} />
          <path d={'M5 12h9a5 5 0 0 1 5 5'} />
        </svg>
      </button>
      <button
        type={'button'}
        className={'history-button'}
        aria-label={'重做'}
        title={'重做（Ctrl/Cmd + Shift + Z / Ctrl + Y）'}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <svg
          className={'history-icon'}
          viewBox={'0 0 24 24'}
          aria-hidden={true}
        >
          <path d={'m15 7 5 5-5 5'} />
          <path d={'M19 12h-9a5 5 0 0 0-5 5'} />
        </svg>
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

function AboutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.5v5.4M12 7.6v.2" />
    </svg>
  )
}

export function EditorWorkspace() {
  const { state, dispatch, removeNode, retrySave } = useEditor()
  const [isExporting, setIsExporting] = useState(false)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [appearanceCanvasJump, setAppearanceCanvasJump] = useState(0)
  const [canvasSizeLockNotice, setCanvasSizeLockNotice] = useState(false)
  const canvasSizeLockNoticeTimeout = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const [activePanel, setActivePanel] = useState<EditorPanelId>('data')
  const [mobilePanelCollapsed, setMobilePanelCollapsed] = useState(false)
  const [showProjectLinks, setShowProjectLinks] = useState(false)
  const projectLinksRef = useRef<HTMLDivElement>(null)
  const [showCanvasDisplayMenu, setShowCanvasDisplayMenu] = useState(false)
  const canvasDisplayControlsRef = useRef<HTMLDivElement>(null)
  const [contentBoundsEditing, setContentBoundsEditing] = useState(false)
  const [canvasNodeAction, setCanvasNodeAction] =
    useState<CanvasNodeActionRequest | null>(null)
  const persistenceText = persistenceStatusText(state.persistence)
  const canUndo = state.history.past.length > 0
  const canRedo = state.history.future.length > 0
  const activePanelLabel =
    EDITOR_PANELS.find((panel) => panel.id === activePanel)?.label ?? '数据'
  const isCanvasSizeLocked = state.document.canvas.templateId !== 'custom'
  const selectPanel = (panelId: EditorPanelId): void => {
    setShowProjectLinks(false)
    setActivePanel(panelId)
    setMobilePanelCollapsed(false)
    if (panelId !== 'appearance') setContentBoundsEditing(false)
    if (panelId !== 'data') {
      dispatch({ type: 'node-selected', nodeId: null })
    }
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
        canvasJumpToken={appearanceCanvasJump}
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

  useEffect(
    () => () => {
      if (canvasSizeLockNoticeTimeout.current) {
        clearTimeout(canvasSizeLockNoticeTimeout.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!showProjectLinks) return
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
        !projectLinksRef.current?.contains(target)
      ) {
        setShowProjectLinks(false)
      }
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown)
    return () =>
      document.removeEventListener('pointerdown', handleOutsidePointerDown)
  }, [showProjectLinks])

  useEffect(() => {
    if (!showCanvasDisplayMenu) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !canvasDisplayControlsRef.current?.contains(event.target)
      ) {
        setShowCanvasDisplayMenu(false)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () =>
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [showCanvasDisplayMenu])

  const openCanvasSizeSettings = () => {
    if (!isCanvasSizeLocked) {
      setActivePanel('appearance')
      setAppearanceCanvasJump((current) => current + 1)
      return
    }
    setCanvasSizeLockNotice(true)
    if (canvasSizeLockNoticeTimeout.current) {
      clearTimeout(canvasSizeLockNoticeTimeout.current)
    }
    canvasSizeLockNoticeTimeout.current = setTimeout(() => {
      setCanvasSizeLockNotice(false)
      canvasSizeLockNoticeTimeout.current = null
    }, 2000)
  }

  const toggleCanvasDisplaySetting = (
    key:
      'showCategoryNodes' | 'showCategoryText' | 'showLabelText' | 'showImages',
  ) => {
    const labelSettings = state.document.canvas.labelSettings
    dispatch({
      type: 'label-settings-changed',
      patch: { [key]: !labelSettings[key] },
      at: new Date().toISOString(),
    })
  }

  const exportPng = async () => {
    setIsExporting(true)
    dispatch({ type: 'status-changed', message: '正在生成高清 PNG…' })
    try {
      await downloadGraphPng(state.document, state.assets)
      dispatch({ type: 'status-changed', message: 'PNG 已导出' })
    } catch (error) {
      dispatch({
        type: 'status-changed',
        message: userErrorMessage(error, 'PNG 导出失败'),
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="返回次元属性首页">
          <span className="brand-mark" aria-hidden="true">
            <img src={brandLogo} alt="" />
          </span>
          <img className="brand-copy" src={textLogo} alt="次元属性" />
        </a>

        <ProjectManager />

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
            <span>{isExporting ? '导出中…' : '导出图片'}</span>
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
                <EditorPanelIcon icon={panel.icon} />
                <small>{panel.label}</small>
              </button>
            )
          })}
          <div className="tool-project-links" ref={projectLinksRef}>
            {showProjectLinks ? (
              <div
                id="project-links-menu"
                className="tool-project-menu"
                role="menu"
                aria-label="关于"
              >
                <a href="/" role="menuitem">
                  返回主页
                </a>
                <a
                  href="https://space.bilibili.com/10761692"
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                >
                  开发者：烧猫定食
                </a>
                <a
                  href="https://github.com/befoer/acg-dna-web"
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                >
                  项目 GitHub
                </a>
                <a
                  href={
                    'https://qm.qq.com/cgi-bin/qm/qr?k=kXDxk4FG-RAlcrdV2A4eD0muTHJZMtIL&jump_from=webapi&authKey=Hf79u%2BeHTTKB1gi%2FvYHHsBRDSzAbWd389leYFKJ%2B3Q%2FhfWMtaw8N9hH3g4Ve%2B%2F9W'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                >
                  加入社群
                </a>
              </div>
            ) : null}
            <button
              type="button"
              className="tool-project-menu-trigger"
              aria-label="打开关于菜单"
              aria-expanded={showProjectLinks}
              aria-controls="project-links-menu"
              title="关于"
              onClick={() => setShowProjectLinks((current) => !current)}
            >
              <AboutIcon />
            </button>
          </div>
        </nav>

        <section
          className={
            'editor-panel-slot' + (mobilePanelCollapsed ? ' is-collapsed' : '')
          }
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
                  aria-label={panel.label}
                  className={selected ? 'is-active' : ''}
                  onClick={() => selectPanel(panel.id)}
                  key={panel.id}
                >
                  <EditorPanelIcon icon={panel.icon} />
                  <span className="mobile-panel-tab-label">{panel.label}</span>
                </button>
              )
            })}
          </div>
          {panelContent}
        </section>

        <section className="canvas-stage" aria-label="画布预览">
          <div className="canvas-stage-header">
            <div className="canvas-stage-actions">
              <div
                className="canvas-display-controls"
                ref={canvasDisplayControlsRef}
                aria-label="画布显示内容"
              >
                <button
                  type="button"
                  className="canvas-display-primary"
                  aria-pressed={
                    state.document.canvas.labelSettings.showCategoryNodes
                  }
                  onClick={() =>
                    toggleCanvasDisplaySetting('showCategoryNodes')
                  }
                >
                  分类显示
                </button>
                <button
                  type="button"
                  className="canvas-display-more-trigger"
                  aria-label="展开显示内容"
                  aria-expanded={showCanvasDisplayMenu}
                  onClick={() =>
                    setShowCanvasDisplayMenu((current) => !current)
                  }
                >
                  <svg viewBox="0 0 8 8" aria-hidden="true">
                    <path d="m1.2 2.1 2.8 2.8 2.8-2.8" />
                  </svg>
                </button>
                {showCanvasDisplayMenu ? (
                  <div className="canvas-display-more-menu" role="menu">
                    {[
                      ['showCategoryText', '分类文字'],
                      ['showLabelText', '标签文字'],
                      ['showImages', '标签图片'],
                    ].map(([key, label]) => {
                      const settingKey = key as
                        'showCategoryText' | 'showLabelText' | 'showImages'
                      const checked =
                        state.document.canvas.labelSettings[settingKey]
                      return (
                        <button
                          type="button"
                          key={settingKey}
                          role="menuitemcheckbox"
                          aria-checked={checked}
                          onClick={() => toggleCanvasDisplaySetting(settingKey)}
                        >
                          <span>{label}</span>
                          <i aria-hidden="true">{checked ? '●' : ''}</i>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
              <div className="zoom-controls" aria-label="画布缩放">
                <button
                  type="button"
                  aria-label="缩小画布"
                  disabled={previewZoom <= PREVIEW_ZOOM_MIN}
                  onClick={() =>
                    setPreviewZoom((current) =>
                      changePreviewZoom(current, -0.25),
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
                  disabled={previewZoom >= PREVIEW_ZOOM_MAX}
                  onClick={() =>
                    setPreviewZoom((current) =>
                      changePreviewZoom(current, 0.25),
                    )
                  }
                >
                  ＋
                </button>
              </div>
              <div className="canvas-size-control">
                <button
                  type="button"
                  className={
                    'canvas-size' + (isCanvasSizeLocked ? ' is-locked' : '')
                  }
                  aria-label={
                    isCanvasSizeLocked ? '画布比例已锁定' : '调整画布比例'
                  }
                  aria-describedby={
                    canvasSizeLockNotice ? 'canvas-size-lock-notice' : undefined
                  }
                  onClick={openCanvasSizeSettings}
                >
                  {state.document.canvas.width} × {state.document.canvas.height}
                </button>
                {canvasSizeLockNotice ? (
                  <span
                    id="canvas-size-lock-notice"
                    className="canvas-size-lock-notice"
                    role="status"
                  >
                    当前模板已锁定画布比例
                  </span>
                ) : null}
              </div>
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
            mobilePanelCollapsed={mobilePanelCollapsed}
            onZoom={(delta) =>
              setPreviewZoom((current) => changePreviewZoom(current, delta))
            }
            onResetView={() => setPreviewZoom(1)}
            onBlankCanvasPointerDown={() => setMobilePanelCollapsed(true)}
            showContentBounds={
              activePanel === 'appearance' && contentBoundsEditing
            }
            onNodeAction={(request) => {
              if (request.action === 'delete') {
                removeNode(request.nodeId)
                return
              }
              setActivePanel('data')
              setMobilePanelCollapsed(false)
              setCanvasNodeAction(request)
            }}
          />
        </section>
      </main>
    </div>
  )
}
