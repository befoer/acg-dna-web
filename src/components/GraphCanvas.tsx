import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { createGraphLayout, renderGraph } from '../canvas/renderGraph'
import {
  createProfileCustomTextRegions,
  drawProfileTemplate,
  hitTestProfileCustomText,
  type ProfileCustomTextRegion,
} from '../canvas/profileRenderer'
import {
  loadProfileTemplateAssets,
  type ProfileTemplateAssetMap,
} from '../canvas/profileTemplateAssets'
import { loadTemplateBackground } from '../canvas/templateBackground'
import { useEditor } from '../editor/editorContext'
import {
  ensureGraphFontLoaded,
  ensureProfileFontsLoaded,
} from '../fonts/fontManager'
import type { BasicLayoutResult } from '../layout/basicLayout'
import { findLayoutNodeAtPoint } from './canvasHitTest'
import { computeFitScale } from './canvasScale'
import { GraphLabelOverlay } from './GraphLabelOverlay'
import { ProfileTextOverlay } from './ProfileTextOverlay'

const CANVAS_GUTTER = 18
const EMPTY_PROFILE_TEMPLATE_ASSETS: ProfileTemplateAssetMap = {}

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
  const profileCanvasRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<BasicLayoutResult | null>(null)
  const customTextRegionsRef = useRef<ProfileCustomTextRegion[]>([])
  const customTextDragRef = useRef<{
    id: string
    pointerX: number
    pointerY: number
    startX: number
    startY: number
  } | null>(null)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [loadedTemplate, setLoadedTemplate] = useState<{
    templateId: string
    image: HTMLImageElement | null
  } | null>(null)
  const [loadedProfileTemplate, setLoadedProfileTemplate] = useState<{
    key: string
    assets: ProfileTemplateAssetMap
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
    profile,
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
      profile,
      categories,
    }),
    [
      categories,
      contentBounds,
      height,
      id,
      layoutMode,
      labelSettings,
      profile,
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
  const profileTemplateKey =
    (profile.subTemplateId ?? '') + ':' + profile.gender
  const profileTemplateAssets =
    loadedProfileTemplate?.key === profileTemplateKey
      ? loadedProfileTemplate.assets
      : EMPTY_PROFILE_TEMPLATE_ASSETS
  const usesAlimama = labelSettings.fontFamily === 'alimama-fangyuan'
  const usesProfileAlimama = profile.customTexts.some(
    (text) => text.visible && text.fontFamily === 'alimama-fangyuan',
  )
  const usesVariableTextOverlay = usesAlimama || usesProfileAlimama

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
    void loadProfileTemplateAssets(profile.subTemplateId, profile.gender).then(
      (assets) => {
        if (!cancelled) {
          setLoadedProfileTemplate({ key: profileTemplateKey, assets })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [profile.gender, profile.subTemplateId, profileTemplateKey])

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      ensureGraphFontLoaded(state.document.canvas.labelSettings),
      ensureProfileFontsLoaded(state.document.profile),
    ]).then(
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
  }, [dispatch, state.document.canvas.labelSettings, state.document.profile])

  useEffect(() => {
    const canvas = canvasRef.current
    const profileCanvas = profileCanvasRef.current
    const context = canvas?.getContext('2d')
    const profileContext = profileCanvas?.getContext('2d')
    if (!canvas || !context) return
    if (fontRevision < 0) return

    renderGraph(context, state.document, state.assets, {
      selectedNodeId: state.selectedNodeId,
      layout,
      templateBackground,
      profileTemplateAssets,
      selectedCustomTextId: state.editingCustomTextId,
      showContentBounds,
      drawNodeText: !usesAlimama,
      drawProfileTemplate: !usesVariableTextOverlay,
    })
    if (profileCanvas && profileContext) {
      profileContext.clearRect(0, 0, profileCanvas.width, profileCanvas.height)
      if (usesVariableTextOverlay) {
        drawProfileTemplate(
          profileContext,
          state.document,
          state.assets,
          profileTemplateAssets,
        )
      }
    }
    layoutRef.current = layout
    customTextRegionsRef.current = createProfileCustomTextRegions(
      context,
      state.document,
    )
  }, [
    layout,
    fontRevision,
    showContentBounds,
    state.assets,
    state.document,
    state.editingCustomTextId,
    state.selectedNodeId,
    profileTemplateAssets,
    templateBackground,
    usesAlimama,
    usesVariableTextOverlay,
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

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return null
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
      bounds,
    }
  }

  const selectAtPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const currentLayout = layoutRef.current
    const point = canvasPoint(event)
    if (!canvas || !currentLayout || !point) return
    const customTextId = hitTestProfileCustomText(
      customTextRegionsRef.current,
      point.x,
      point.y,
    )
    if (customTextId) {
      const customText = state.document.profile.customTexts.find(
        (text) => text.id === customTextId,
      )
      if (!customText) return
      dispatch({ type: 'custom-text-selected', textId: customTextId })
      customTextDragRef.current = {
        id: customTextId,
        pointerX: point.x,
        pointerY: point.y,
        startX: customText.x,
        startY: customText.y,
      }
      canvas.setPointerCapture(event.pointerId)
      event.preventDefault()
      return
    }
    const content = state.document.canvas.contentBounds
    const centerX =
      ((content.left + content.right) / 2) * state.document.canvas.width
    const centerY =
      ((content.top + content.bottom) / 2) * state.document.canvas.height
    const angle = (-content.rotation * Math.PI) / 180
    const deltaX = point.x - centerX
    const deltaY = point.y - centerY
    const x = centerX + deltaX * Math.cos(angle) - deltaY * Math.sin(angle)
    const y = centerY + deltaX * Math.sin(angle) + deltaY * Math.cos(angle)
    const minimumHitRadius =
      22 *
      Math.max(
        canvas.width / point.bounds.width,
        canvas.height / point.bounds.height,
      )
    const node = findLayoutNodeAtPoint(
      currentLayout.flatNodes,
      x,
      y,
      minimumHitRadius,
    )
    dispatch({ type: 'node-selected', nodeId: node?.id ?? null })
  }

  const dragCustomText = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = customTextDragRef.current
    const point = canvasPoint(event)
    if (!drag || !point) return
    const nextX = Math.max(
      0,
      Math.min(
        1,
        drag.startX + (point.x - drag.pointerX) / state.document.canvas.width,
      ),
    )
    const nextY = Math.max(
      0,
      Math.min(
        1,
        drag.startY + (point.y - drag.pointerY) / state.document.canvas.height,
      ),
    )
    dispatch({
      type: 'profile-settings-changed',
      patch: {
        customTexts: state.document.profile.customTexts.map((text) =>
          text.id === drag.id ? { ...text, x: nextX, y: nextY } : text,
        ),
      },
      group: 'custom-text-position:' + drag.id,
      at: new Date().toISOString(),
    })
    event.preventDefault()
  }

  const finishCustomTextDrag = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (!customTextDragRef.current) return
    customTextDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
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
          onPointerMove={dragCustomText}
          onPointerUp={finishCustomTextDrag}
          onPointerCancel={finishCustomTextDrag}
        />
        <canvas
          ref={profileCanvasRef}
          className={'graph-profile-overlay'}
          style={canvasStyle}
          width={state.document.canvas.width}
          height={state.document.canvas.height}
          aria-hidden={true}
        />
        {usesAlimama ? (
          <GraphLabelOverlay
            document={state.document}
            layout={layout}
            assets={state.assets}
            style={canvasStyle}
          />
        ) : null}
        {usesProfileAlimama ? (
          <ProfileTextOverlay document={state.document} style={canvasStyle} />
        ) : null}
      </div>
    </div>
  )
}
