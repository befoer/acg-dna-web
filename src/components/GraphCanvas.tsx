import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { createGraphLayout, renderGraph } from '../canvas/renderGraph'
import { loadTemplateBackground } from '../canvas/templateBackground'
import { useEditor } from '../editor/editorContext'
import { ensureGraphFontLoaded } from '../fonts/fontManager'
import type { BasicLayoutResult } from '../layout/basicLayout'
import { findLayoutNodeAtPoint } from './canvasHitTest'
import { computeFitScale } from './canvasScale'

const CANVAS_GUTTER = 18

interface GraphCanvasProps {
  zoom: number
  showContentBounds?: boolean
}

export function GraphCanvas({
  zoom,
  showContentBounds = false,
}: GraphCanvasProps) {
  const { state, dispatch } = useEditor()
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<BasicLayoutResult | null>(null)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [loadedTemplate, setLoadedTemplate] = useState<{
    templateId: string
    image: HTMLImageElement | null
  } | null>(null)
  const [fontRevision, setFontRevision] = useState(0)
  const {
    categories,
    canvas: {
      width,
      height,
      layoutMode,
      templateId,
      contentBounds,
      labelSettings,
    },
    id,
    schemaVersion,
  } = state.document
  const layoutDocument = useMemo(
    () => ({
      schemaVersion,
      id,
      name: '',
      createdAt: '',
      updatedAt: '',
      canvas: {
        width,
        height,
        backgroundColor: '#000000',
        layoutMode,
        templateId,
        contentBounds,
        labelSettings,
      },
      categories,
    }),
    [
      categories,
      contentBounds,
      height,
      id,
      layoutMode,
      labelSettings,
      schemaVersion,
      templateId,
      width,
    ],
  )
  const layout = useMemo(
    () => createGraphLayout(layoutDocument),
    [layoutDocument],
  )
  const templateBackground =
    loadedTemplate?.templateId === templateId ? loadedTemplate.image : null

  useEffect(() => {
    let cancelled = false
    void loadTemplateBackground(templateId).then(
      (image) => {
        if (!cancelled) setLoadedTemplate({ templateId, image })
      },
      () => {
        if (!cancelled) {
          setLoadedTemplate({ templateId, image: null })
          dispatch({
            type: 'status-changed',
            message: '模板背景加载失败',
          })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [dispatch, templateId])

  useEffect(() => {
    let cancelled = false
    void ensureGraphFontLoaded(state.document.canvas.labelSettings).then(
      () => {
        if (!cancelled) setFontRevision((current) => current + 1)
      },
      (error) => {
        if (!cancelled) {
          dispatch({
            type: 'status-changed',
            message:
              error instanceof Error
                ? error.message
                : '字体加载失败，已使用系统字体',
          })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [dispatch, state.document.canvas.labelSettings])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    if (fontRevision < 0) return

    renderGraph(context, state.document, state.assets, {
      selectedNodeId: state.selectedNodeId,
      layout,
      templateBackground,
      showContentBounds,
    })
    layoutRef.current = layout
  }, [
    layout,
    fontRevision,
    showContentBounds,
    state.assets,
    state.document,
    state.selectedNodeId,
    templateBackground,
  ])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const measure = () => {
      const bounds = frame.getBoundingClientRect()
      const width = frame.clientWidth || bounds.width
      const height = frame.clientHeight || bounds.height
      setFrameSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      )
    }

    measure()
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure)
      observer.observe(frame)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const fitScale = computeFitScale(
    Math.max(0, frameSize.width - CANVAS_GUTTER * 2),
    Math.max(0, frameSize.height - CANVAS_GUTTER * 2),
    state.document.canvas.width,
    state.document.canvas.height,
  )
  const displayScale = fitScale * Math.max(0.5, Math.min(2, zoom))
  const displayWidth = state.document.canvas.width * displayScale
  const displayHeight = state.document.canvas.height * displayScale
  const canvasStyle: CSSProperties = {
    width: displayWidth,
    height: displayHeight,
    visibility:
      frameSize.width > 0 && frameSize.height > 0 ? 'visible' : 'hidden',
  }
  const surfaceStyle: CSSProperties = {
    width: Math.max(frameSize.width, displayWidth + CANVAS_GUTTER * 2),
    height: Math.max(frameSize.height, displayHeight + CANVAS_GUTTER * 2),
  }

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    frame.scrollLeft = Math.max(0, (frame.scrollWidth - frame.clientWidth) / 2)
    frame.scrollTop = Math.max(0, (frame.scrollHeight - frame.clientHeight) / 2)
  }, [displayHeight, displayWidth])

  const selectAtPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const currentLayout = layoutRef.current
    if (!canvas || !currentLayout) return
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const pointerX =
      ((event.clientX - bounds.left) / bounds.width) * canvas.width
    const pointerY =
      ((event.clientY - bounds.top) / bounds.height) * canvas.height
    const content = state.document.canvas.contentBounds
    const centerX =
      ((content.left + content.right) / 2) * state.document.canvas.width
    const centerY =
      ((content.top + content.bottom) / 2) * state.document.canvas.height
    const angle = (-content.rotation * Math.PI) / 180
    const deltaX = pointerX - centerX
    const deltaY = pointerY - centerY
    const x = centerX + deltaX * Math.cos(angle) - deltaY * Math.sin(angle)
    const y = centerY + deltaX * Math.sin(angle) + deltaY * Math.cos(angle)
    const minimumHitRadius =
      22 * Math.max(canvas.width / bounds.width, canvas.height / bounds.height)
    const node = findLayoutNodeAtPoint(
      currentLayout.flatNodes,
      x,
      y,
      minimumHitRadius,
    )
    dispatch({ type: 'node-selected', nodeId: node?.id ?? null })
  }

  return (
    <div className="canvas-frame" ref={frameRef}>
      <div className="canvas-surface" style={surfaceStyle}>
        <canvas
          ref={canvasRef}
          className="graph-canvas"
          style={canvasStyle}
          width={state.document.canvas.width}
          height={state.document.canvas.height}
          role="img"
          aria-label={`${state.document.name} 的属性图预览；点击气泡可选择节点`}
          onPointerDown={selectAtPointer}
        />
      </div>
    </div>
  )
}
