import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { createGraphLayout, renderGraph } from '../canvas/renderGraph'
import { nudgeCanvasPosition } from '../canvas/canvasNudge'
import {
  hitTestContentBounds,
  transformContentBounds,
  type ContentBoundsDragHandle,
} from '../canvas/contentBoundsInteraction'
import {
  transformDecorationGesture,
  type DecorationGestureStart,
  type GesturePoint,
} from '../canvas/decorationGesture'
import {
  createProfileCustomTextRegions,
  hitTestProfileCustomText,
  isProfileCustomTextResizeHandleHit,
  type ProfileCustomTextRegion,
} from '../canvas/profileRenderer'
import {
  loadProfileTemplateAssets,
  type ProfileTemplateAssetMap,
} from '../canvas/profileTemplateAssets'
import { loadTemplateBackground } from '../canvas/templateBackground'
import {
  createDecorationImageRegions,
  createDecorationFrameRegions,
  hitTestDecorationImage,
  hitTestDecorationFrame,
  isDecorationFrameResizeHandleHit,
  isDecorationResizeHandleHit,
  isDecorationRotationHandleHit,
  loadDecorationPresetAssets,
  type DecorationImageRegion,
  type DecorationFrameRegion,
  type DecorationPresetAssetMap,
} from '../canvas/decorationRenderer'
import { useEditor } from '../editor/editorContext'
import { userErrorMessage } from '../errors/userErrorMessage'
import imageIconUrl from '../assets/image.svg'
import {
  computeCanvasNodeActionGeometry,
  type CanvasNodeActionRequest,
} from './canvasNodeActions'
import {
  DECORATION_DATA_LAYER_ID,
  customTextIdFromDecorationLayer,
  decorationFrameLayerId,
  decorationImageLayerId,
  resolveCategoryAppearance,
  resolveDecorationLayerOrder,
  type GraphContentBounds,
} from '../domain/graph'
import {
  ensureGraphFontLoaded,
  ensureProfileFontsLoaded,
} from '../fonts/fontManager'
import type { BasicLayoutResult } from '../layout/basicLayout'
import { findLayoutNodeAtPoint } from './canvasHitTest'
import { computeFitScale } from './canvasScale'

const CANVAS_GUTTER = 18
const EMPTY_PROFILE_TEMPLATE_ASSETS: ProfileTemplateAssetMap = {}
const EMPTY_DECORATION_PRESET_ASSETS: DecorationPresetAssetMap = {}

interface GraphCanvasProps {
  zoom: number
  onZoom?: (delta: number) => void
  onResetView?: () => void
  onBlankCanvasPointerDown?: () => void
  mobilePanelCollapsed?: boolean
  showContentBounds?: boolean
  onNodeAction?: (request: CanvasNodeActionRequest) => void
}

export function GraphCanvas({
  zoom,
  onZoom,
  onResetView,
  onBlankCanvasPointerDown,
  mobilePanelCollapsed = false,
  showContentBounds = false,
  onNodeAction,
}: GraphCanvasProps) {
  const { state, dispatch } = useEditor()
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef<BasicLayoutResult | null>(null)
  const customTextRegionsRef = useRef<ProfileCustomTextRegion[]>([])
  const decorationImageRegionsRef = useRef<DecorationImageRegion[]>([])
  const decorationFrameRegionsRef = useRef<DecorationFrameRegion[]>([])
  const activePointersRef = useRef(new Map<number, GesturePoint>())
  const contentBoundsDragRef = useRef<{
    handle: ContentBoundsDragHandle
    pointerX: number
    pointerY: number
    startBounds: GraphContentBounds
    groupAt: string
  } | null>(null)
  const customTextDragRef = useRef<{
    id: string
    mode: 'move' | 'resize'
    pointerX: number
    pointerY: number
    startX: number
    startY: number
    startFontSize: number
    centerX: number
    centerY: number
    rotation: number
    startDistance: number
  } | null>(null)
  const decorationImageDragRef = useRef<{
    id: string
    mode: 'move' | 'resize' | 'rotate' | 'gesture'
    pointerX: number
    pointerY: number
    startX: number
    startY: number
    startSize: number
    startDistance: number
    startRotation: number
    startAngle: number
    groupAt: string
    gesturePointerIds?: readonly [number, number]
    gestureStart?: DecorationGestureStart
  } | null>(null)
  const decorationFrameDragRef = useRef<{
    id: string
    mode: 'move' | 'resize'
    pointerX: number
    pointerY: number
    startX: number
    startY: number
    rotation: number
  } | null>(null)
  const blankCanvasPanRef = useRef<{
    pointerId: number
    pointerX: number
    pointerY: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 })
  const [isBlankCanvasPanning, setIsBlankCanvasPanning] = useState(false)
  const [nodeActionMenuId, setNodeActionMenuId] = useState<string | null>(null)
  const [loadedTemplate, setLoadedTemplate] = useState<{
    templateId: string
    image: HTMLImageElement | null
  } | null>(null)
  const [loadedProfileTemplate, setLoadedProfileTemplate] = useState<{
    key: string
    assets: ProfileTemplateAssetMap
  } | null>(null)
  const [decorationPresetAssets, setDecorationPresetAssets] =
    useState<DecorationPresetAssetMap>(EMPTY_DECORATION_PRESET_ASSETS)
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
    decoration,
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
      decoration,
      categories,
    }),
    [
      categories,
      contentBounds,
      decoration,
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
  const categoryLabelSettings = useMemo(
    () =>
      categories.map((category) =>
        resolveCategoryAppearance(category, labelSettings),
      ),
    [categories, labelSettings],
  )
  useEffect(() => {
    if (!showContentBounds) contentBoundsDragRef.current = null
  }, [showContentBounds])

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
    void loadDecorationPresetAssets().then(
      (assets) => {
        if (!cancelled) setDecorationPresetAssets(assets)
      },
      () => {
        if (!cancelled) {
          dispatch({
            type: 'status-changed',
            message: '装饰素材加载失败',
          })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [dispatch])

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
      ...categoryLabelSettings.map((settings) =>
        ensureGraphFontLoaded(settings),
      ),
      ensureProfileFontsLoaded(state.document.profile),
    ]).then(
      () => {
        if (!cancelled) setFontRevision((current) => current + 1)
      },
      (error) => {
        if (!cancelled) {
          dispatch({
            type: 'status-changed',
            message: userErrorMessage(error, '字体加载失败，已使用系统字体'),
          })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [categoryLabelSettings, dispatch, state.document.profile])

  useEffect(() => {
    layoutRef.current = layout
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    if (fontRevision < 0) return

    renderGraph(context, state.document, state.assets, {
      selectedNodeId: state.selectedNodeId,
      layout,
      templateBackground,
      profileTemplateAssets,
      decorationPresetAssets,
      selectedCustomTextId: state.editingCustomTextId,
      selectedDecorationImageId: state.editingDecorationImageId,
      selectedDecorationFrameId: state.editingDecorationFrameId,
      showContentBounds,
      drawNodeText: true,
    })
    customTextRegionsRef.current = createProfileCustomTextRegions(
      context,
      state.document,
    )
    decorationImageRegionsRef.current = createDecorationImageRegions(
      state.document,
      state.assets,
    )
    decorationFrameRegionsRef.current = createDecorationFrameRegions(
      state.document,
    )
  }, [
    layout,
    fontRevision,
    showContentBounds,
    state.assets,
    state.document,
    state.editingCustomTextId,
    state.editingDecorationImageId,
    state.editingDecorationFrameId,
    state.selectedNodeId,
    profileTemplateAssets,
    decorationPresetAssets,
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

  const isMobileCanvasWorkspace = window.innerWidth < 900
  const horizontalGutter =
    isMobileCanvasWorkspace && mobilePanelCollapsed ? 0 : CANVAS_GUTTER
  const verticalGutter =
    isMobileCanvasWorkspace && !mobilePanelCollapsed ? 0 : CANVAS_GUTTER
  const fitScale = computeFitScale(
    Math.max(0, frameSize.width - horizontalGutter * 2),
    Math.max(0, frameSize.height - verticalGutter * 2),
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
    width: Math.max(frameSize.width, displayWidth + horizontalGutter * 2),
    height: Math.max(frameSize.height, displayHeight + verticalGutter * 2),
  }
  const selectedLayoutNode =
    nodeActionMenuId && state.selectedNodeId === nodeActionMenuId
      ? layout.flatNodes.find((node) => node.id === nodeActionMenuId)
      : undefined
  const nodeActionGeometry = computeCanvasNodeActionGeometry(
    selectedLayoutNode ? selectedLayoutNode.radius * displayScale : 0,
  )
  const nodeActionMenuStyle = selectedLayoutNode
    ? ({
        left: selectedLayoutNode.x * displayScale,
        top: selectedLayoutNode.y * displayScale,
      } as CSSProperties)
    : undefined
  const nodeActionButtonStyle = (angleDegrees: number): CSSProperties => {
    const angle = (angleDegrees * Math.PI) / 180
    return {
      transform:
        'translate(-50%, -50%) translate(' +
        Math.cos(angle) * nodeActionGeometry.distance +
        'px, ' +
        Math.sin(angle) * nodeActionGeometry.distance +
        'px)',
    }
  }
  const hidesChildAction = selectedLayoutNode?.kind === 'subAttribute'
  const imageActionAngle = hidesChildAction
    ? (nodeActionGeometry.angles[0] + nodeActionGeometry.angles[1]) / 2
    : nodeActionGeometry.angles[0]
  const deleteActionAngle = hidesChildAction
    ? (nodeActionGeometry.angles[1] + nodeActionGeometry.angles[2]) / 2
    : nodeActionGeometry.angles[2]
  const showNodeActionMenu =
    Boolean(selectedLayoutNode) &&
    !showContentBounds &&
    !state.editingDecorationImageId &&
    !state.editingDecorationFrameId &&
    !state.editingCustomTextId

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
    setNodeActionMenuId(null)
    activePointersRef.current.set(event.pointerId, {
      x: point.x,
      y: point.y,
    })
    const selectedDecorationRegion = decorationImageRegionsRef.current.find(
      (region) => region.id === state.editingDecorationImageId,
    )
    const handleTolerance =
      18 *
      Math.max(
        canvas.width / point.bounds.width,
        canvas.height / point.bounds.height,
      )
    if (showContentBounds) {
      const boundsHandle = hitTestContentBounds(
        state.document.canvas.contentBounds,
        state.document.canvas.width,
        state.document.canvas.height,
        point.x,
        point.y,
        handleTolerance,
      )
      if (boundsHandle !== 'none') {
        contentBoundsDragRef.current = {
          handle: boundsHandle,
          pointerX: point.x,
          pointerY: point.y,
          startBounds: { ...state.document.canvas.contentBounds },
          groupAt: new Date().toISOString(),
        }
        canvas.setPointerCapture(event.pointerId)
        event.preventDefault()
        return
      }
    }
    const beginImageDrag = (
      imageId: string,
      mode: 'move' | 'resize' | 'rotate',
      region: DecorationImageRegion,
    ) => {
      const image = state.document.decoration.images.find(
        (candidate) => candidate.id === imageId,
      )
      if (!image) return false
      dispatch({ type: 'decoration-image-selected', imageId })
      decorationImageDragRef.current = {
        id: image.id,
        mode,
        pointerX: point.x,
        pointerY: point.y,
        startX: image.x,
        startY: image.y,
        startSize: image.size,
        startDistance: Math.max(
          1,
          Math.hypot(point.x - region.centerX, point.y - region.centerY),
        ),
        startRotation: image.rotation,
        startAngle: Math.atan2(
          point.y - region.centerY,
          point.x - region.centerX,
        ),
        groupAt: new Date().toISOString(),
      }
      canvas.setPointerCapture(event.pointerId)
      event.preventDefault()
      return true
    }
    const beginCustomTextDrag = (
      customTextId: string,
      mode: 'move' | 'resize',
      region: ProfileCustomTextRegion,
    ) => {
      const customText = state.document.profile.customTexts.find(
        (text) => text.id === customTextId,
      )
      if (!customText) return false
      const padding = 6 * (state.document.canvas.height / 800)
      dispatch({ type: 'custom-text-selected', textId: customTextId })
      customTextDragRef.current = {
        id: customTextId,
        mode,
        pointerX: point.x,
        pointerY: point.y,
        startX: customText.x,
        startY: customText.y,
        startFontSize: customText.fontSize,
        centerX: region.left + region.width / 2,
        centerY: region.top + region.height / 2,
        rotation: region.rotation,
        startDistance: Math.max(
          1,
          Math.hypot(region.width / 2 + padding, region.height / 2 + padding),
        ),
      }
      canvas.setPointerCapture(event.pointerId)
      event.preventDefault()
      return true
    }
    if (
      !showContentBounds &&
      selectedDecorationRegion &&
      activePointersRef.current.size >= 2
    ) {
      const pointerIds = [...activePointersRef.current.keys()].slice(-2) as [
        number,
        number,
      ]
      const first = activePointersRef.current.get(pointerIds[0])
      const second = activePointersRef.current.get(pointerIds[1])
      const image = state.document.decoration.images.find(
        (candidate) => candidate.id === selectedDecorationRegion.id,
      )
      if (first && second && image) {
        decorationImageDragRef.current = {
          id: image.id,
          mode: 'gesture',
          pointerX: point.x,
          pointerY: point.y,
          startX: image.x,
          startY: image.y,
          startSize: image.size,
          startDistance: 1,
          startRotation: image.rotation,
          startAngle: 0,
          groupAt: new Date().toISOString(),
          gesturePointerIds: pointerIds,
          gestureStart: { first: { ...first }, second: { ...second } },
        }
        canvas.setPointerCapture(event.pointerId)
        event.preventDefault()
        return
      }
    }
    const beginFrameDrag = (frameId: string, mode: 'move' | 'resize') => {
      const frame = state.document.decoration.frames.find(
        (candidate) => candidate.id === frameId,
      )
      if (!frame) return false
      dispatch({ type: 'decoration-frame-selected', frameId })
      decorationFrameDragRef.current = {
        id: frame.id,
        mode,
        pointerX: point.x,
        pointerY: point.y,
        startX: frame.x,
        startY: frame.y,
        rotation: frame.rotation,
      }
      canvas.setPointerCapture(event.pointerId)
      event.preventDefault()
      return true
    }
    if (
      selectedDecorationRegion &&
      isDecorationRotationHandleHit(
        selectedDecorationRegion,
        point.x,
        point.y,
        handleTolerance,
        Math.max(32 * (state.document.canvas.height / 800), 34),
      ) &&
      beginImageDrag(
        selectedDecorationRegion.id,
        'rotate',
        selectedDecorationRegion,
      )
    ) {
      return
    }
    if (
      selectedDecorationRegion &&
      isDecorationResizeHandleHit(
        selectedDecorationRegion,
        point.x,
        point.y,
        handleTolerance,
      )
    ) {
      beginImageDrag(
        selectedDecorationRegion.id,
        'resize',
        selectedDecorationRegion,
      )
      return
    }
    const selectedFrameRegion = decorationFrameRegionsRef.current.find(
      (region) => region.id === state.editingDecorationFrameId,
    )
    if (
      selectedFrameRegion &&
      isDecorationFrameResizeHandleHit(
        selectedFrameRegion,
        point.x,
        point.y,
        handleTolerance,
      )
    ) {
      beginFrameDrag(selectedFrameRegion.id, 'resize')
      return
    }
    const selectedCustomTextRegion = customTextRegionsRef.current.find(
      (region) => region.id === state.editingCustomTextId,
    )
    if (
      selectedCustomTextRegion &&
      isProfileCustomTextResizeHandleHit(
        selectedCustomTextRegion,
        point.x,
        point.y,
        handleTolerance,
        6 * (state.document.canvas.height / 800),
      )
    ) {
      beginCustomTextDrag(
        selectedCustomTextRegion.id,
        'resize',
        selectedCustomTextRegion,
      )
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
    const layerOrder = resolveDecorationLayerOrder(
      state.document.decoration,
      state.document.profile.customTexts.map((text) => text.id),
    )
    for (const layerId of layerOrder) {
      if (state.document.decoration.hiddenLayerIds.includes(layerId)) continue
      const imageId = state.document.decoration.images.find(
        (image) => decorationImageLayerId(image.id) === layerId,
      )?.id
      if (
        imageId &&
        hitTestDecorationImage(
          decorationImageRegionsRef.current,
          point.x,
          point.y,
          [imageId],
        )
      ) {
        const region = decorationImageRegionsRef.current.find(
          (candidate) => candidate.id === imageId,
        )
        if (region) beginImageDrag(imageId, 'move', region)
        return
      }
      const frameId = state.document.decoration.frames.find(
        (frame) => decorationFrameLayerId(frame.id) === layerId,
      )?.id
      if (
        frameId &&
        hitTestDecorationFrame(
          decorationFrameRegionsRef.current,
          point.x,
          point.y,
          [frameId],
        )
      ) {
        beginFrameDrag(frameId, 'move')
        return
      }
      const customTextId = customTextIdFromDecorationLayer(layerId)
      if (
        customTextId &&
        hitTestProfileCustomText(
          customTextRegionsRef.current,
          point.x,
          point.y,
          [customTextId],
        )
      ) {
        const region = customTextRegionsRef.current.find(
          (candidate) => candidate.id === customTextId,
        )
        if (region) beginCustomTextDrag(customTextId, 'move', region)
        return
      }
      if (layerId === DECORATION_DATA_LAYER_ID && node) {
        activePointersRef.current.delete(event.pointerId)
        dispatch({ type: 'node-selected', nodeId: node.id })
        setNodeActionMenuId(node.id)
        return
      }
    }
    activePointersRef.current.delete(event.pointerId)
    dispatch({ type: 'node-selected', nodeId: null })
  }

  const dragCanvasElement = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const contentBoundsDrag = contentBoundsDragRef.current
    const decorationPoint = canvasPoint(event)
    if (decorationPoint && activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, {
        x: decorationPoint.x,
        y: decorationPoint.y,
      })
    }
    if (contentBoundsDrag && decorationPoint) {
      dispatch({
        type: 'content-bounds-changed',
        bounds: transformContentBounds(
          contentBoundsDrag.startBounds,
          contentBoundsDrag.handle,
          state.document.canvas.width,
          state.document.canvas.height,
          decorationPoint.x - contentBoundsDrag.pointerX,
          decorationPoint.y - contentBoundsDrag.pointerY,
        ),
        group: 'canvas-' + contentBoundsDrag.handle,
        at: contentBoundsDrag.groupAt,
      })
      event.preventDefault()
      return
    }
    const decorationDrag = decorationImageDragRef.current
    if (decorationDrag && decorationPoint) {
      if (
        decorationDrag.mode === 'gesture' &&
        decorationDrag.gesturePointerIds &&
        decorationDrag.gestureStart
      ) {
        const first = activePointersRef.current.get(
          decorationDrag.gesturePointerIds[0],
        )
        const second = activePointersRef.current.get(
          decorationDrag.gesturePointerIds[1],
        )
        if (first && second) {
          dispatch({
            type: 'decoration-image-changed',
            imageId: decorationDrag.id,
            patch: transformDecorationGesture(
              {
                x: decorationDrag.startX,
                y: decorationDrag.startY,
                size: decorationDrag.startSize,
                rotation: decorationDrag.startRotation,
              },
              decorationDrag.gestureStart,
              { first, second },
              state.document.canvas.width,
              state.document.canvas.height,
            ),
            group: 'canvas-gesture',
            at: decorationDrag.groupAt,
          })
        }
      } else if (decorationDrag.mode === 'move') {
        dispatch({
          type: 'decoration-image-changed',
          imageId: decorationDrag.id,
          patch: {
            x: Math.max(
              0,
              Math.min(
                1,
                decorationDrag.startX +
                  (decorationPoint.x - decorationDrag.pointerX) /
                    state.document.canvas.width,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                1,
                decorationDrag.startY +
                  (decorationPoint.y - decorationDrag.pointerY) /
                    state.document.canvas.height,
              ),
            ),
          },
          group: 'canvas-position',
          at: decorationDrag.groupAt,
        })
      } else if (decorationDrag.mode === 'resize') {
        const centerX = decorationDrag.startX * state.document.canvas.width
        const centerY = decorationDrag.startY * state.document.canvas.height
        const distance = Math.hypot(
          decorationPoint.x - centerX,
          decorationPoint.y - centerY,
        )
        dispatch({
          type: 'decoration-image-changed',
          imageId: decorationDrag.id,
          patch: {
            size: Math.max(
              0.05,
              Math.min(
                1.5,
                decorationDrag.startSize *
                  (distance / decorationDrag.startDistance),
              ),
            ),
          },
          group: 'canvas-size',
          at: decorationDrag.groupAt,
        })
      } else {
        const centerX = decorationDrag.startX * state.document.canvas.width
        const centerY = decorationDrag.startY * state.document.canvas.height
        const currentAngle = Math.atan2(
          decorationPoint.y - centerY,
          decorationPoint.x - centerX,
        )
        let rotation =
          decorationDrag.startRotation +
          ((currentAngle - decorationDrag.startAngle) * 180) / Math.PI
        rotation = ((rotation + 180) % 360) - 180
        dispatch({
          type: 'decoration-image-changed',
          imageId: decorationDrag.id,
          patch: { rotation },
          group: 'canvas-rotation',
          at: decorationDrag.groupAt,
        })
      }
      event.preventDefault()
      return
    }
    const frameDrag = decorationFrameDragRef.current
    if (frameDrag && decorationPoint) {
      const frames = state.document.decoration.frames.map((frame) => {
        if (frame.id !== frameDrag.id) return frame
        if (frameDrag.mode === 'move') {
          return {
            ...frame,
            x: Math.max(
              0,
              Math.min(
                1,
                frameDrag.startX +
                  (decorationPoint.x - frameDrag.pointerX) /
                    state.document.canvas.width,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                1,
                frameDrag.startY +
                  (decorationPoint.y - frameDrag.pointerY) /
                    state.document.canvas.height,
              ),
            ),
          }
        }
        const centerX = frameDrag.startX * state.document.canvas.width
        const centerY = frameDrag.startY * state.document.canvas.height
        const angle = (-frameDrag.rotation * Math.PI) / 180
        const deltaX = decorationPoint.x - centerX
        const deltaY = decorationPoint.y - centerY
        const localX = deltaX * Math.cos(angle) - deltaY * Math.sin(angle)
        const localY = deltaX * Math.sin(angle) + deltaY * Math.cos(angle)
        return {
          ...frame,
          width: Math.max(
            0.1,
            Math.min(1, (Math.abs(localX) * 2) / state.document.canvas.width),
          ),
          height: Math.max(
            0.1,
            Math.min(1, (Math.abs(localY) * 2) / state.document.canvas.height),
          ),
        }
      })
      dispatch({
        type: 'decoration-settings-changed',
        patch: { frames },
        group:
          frameDrag.mode === 'move'
            ? 'frame-canvas-position:' + frameDrag.id
            : 'frame-canvas-size:' + frameDrag.id,
        at: new Date().toISOString(),
      })
      event.preventDefault()
      return
    }
    const drag = customTextDragRef.current
    const point = canvasPoint(event)
    if (!drag || !point) return
    if (drag.mode === 'resize') {
      const angle = (-drag.rotation * Math.PI) / 180
      const deltaX = point.x - drag.centerX
      const deltaY = point.y - drag.centerY
      const localX = deltaX * Math.cos(angle) - deltaY * Math.sin(angle)
      const localY = deltaX * Math.sin(angle) + deltaY * Math.cos(angle)
      const fontSize = Math.max(
        10,
        Math.min(
          100,
          drag.startFontSize *
            (Math.hypot(localX, localY) / drag.startDistance),
        ),
      )
      dispatch({
        type: 'profile-settings-changed',
        patch: {
          customTexts: state.document.profile.customTexts.map((text) =>
            text.id === drag.id ? { ...text, fontSize } : text,
          ),
        },
        group: 'custom-text-font-size:' + drag.id,
        at: new Date().toISOString(),
      })
      event.preventDefault()
      return
    }
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

  const finishCanvasElementDrag = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    activePointersRef.current.delete(event.pointerId)
    if (
      !customTextDragRef.current &&
      !decorationImageDragRef.current &&
      !decorationFrameDragRef.current &&
      !contentBoundsDragRef.current
    ) {
      return
    }
    customTextDragRef.current = null
    decorationImageDragRef.current = null
    decorationFrameDragRef.current = null
    contentBoundsDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const nudgeSelectedElement = (
    event: React.KeyboardEvent<HTMLCanvasElement>,
  ) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const direction = (
      {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      } as Record<string, readonly [number, number]>
    )[event.key]
    if (!direction) return

    const image = state.document.decoration.images.find(
      (candidate) => candidate.id === state.editingDecorationImageId,
    )
    const frame = state.document.decoration.frames.find(
      (candidate) => candidate.id === state.editingDecorationFrameId,
    )
    const customText = state.document.profile.customTexts.find(
      (candidate) => candidate.id === state.editingCustomTextId,
    )
    if (!image && !frame && !customText) return

    const distance = event.shiftKey ? 10 : 1
    const deltaX = direction[0] * distance
    const deltaY = direction[1] * distance
    const at = new Date().toISOString()
    event.preventDefault()

    if (image) {
      dispatch({
        type: 'decoration-image-changed',
        imageId: image.id,
        patch: nudgeCanvasPosition(
          image,
          deltaX,
          deltaY,
          state.document.canvas.width,
          state.document.canvas.height,
        ),
        group: 'keyboard-position',
        at,
      })
      return
    }

    if (frame) {
      const position = nudgeCanvasPosition(
        frame,
        deltaX,
        deltaY,
        state.document.canvas.width,
        state.document.canvas.height,
      )
      dispatch({
        type: 'decoration-settings-changed',
        patch: {
          frames: state.document.decoration.frames.map((candidate) =>
            candidate.id === frame.id
              ? { ...candidate, ...position }
              : candidate,
          ),
        },
        group: 'frame-keyboard-position:' + frame.id,
        at,
      })
      return
    }

    if (customText) {
      const position = nudgeCanvasPosition(
        customText,
        deltaX,
        deltaY,
        state.document.canvas.width,
        state.document.canvas.height,
      )
      dispatch({
        type: 'profile-settings-changed',
        patch: {
          customTexts: state.document.profile.customTexts.map((candidate) =>
            candidate.id === customText.id
              ? { ...candidate, ...position }
              : candidate,
          ),
        },
        group: 'custom-text-keyboard-position:' + customText.id,
        at,
      })
    }
  }

  const isDesktopCanvasWorkspace = () => window.innerWidth >= 900

  const zoomCanvasWithWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (
      !onZoom ||
      event.ctrlKey ||
      event.deltaY === 0 ||
      !isDesktopCanvasWorkspace()
    ) {
      return
    }
    event.preventDefault()
    onZoom(event.deltaY < 0 ? 0.1 : -0.1)
  }

  const startBlankCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      !isDesktopCanvasWorkspace() &&
      event.button === 0 &&
      event.target === event.currentTarget
    ) {
      onBlankCanvasPointerDown?.()
      return
    }
    if (
      !isDesktopCanvasWorkspace() ||
      event.button !== 0 ||
      event.target !== event.currentTarget
    ) {
      return
    }
    blankCanvasPanRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: canvasPan.x,
      offsetY: canvasPan.y,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsBlankCanvasPanning(true)
    event.preventDefault()
  }

  const moveBlankCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = blankCanvasPanRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    setCanvasPan({
      x: pan.offsetX + event.clientX - pan.pointerX,
      y: pan.offsetY + event.clientY - pan.pointerY,
    })
    event.preventDefault()
  }

  const finishBlankCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = blankCanvasPanRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    blankCanvasPanRef.current = null
    setIsBlankCanvasPanning(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const resetBlankCanvasView = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDesktopCanvasWorkspace() || event.target !== event.currentTarget)
      return
    blankCanvasPanRef.current = null
    setIsBlankCanvasPanning(false)
    setCanvasPan({ x: 0, y: 0 })
    onResetView?.()
  }

  return (
    <div className="canvas-frame" ref={frameRef} onWheel={zoomCanvasWithWheel}>
      <div
        className={
          'canvas-surface' + (isBlankCanvasPanning ? ' is-panning' : '')
        }
        style={surfaceStyle}
        onPointerDown={startBlankCanvasPan}
        onPointerMove={moveBlankCanvasPan}
        onPointerUp={finishBlankCanvasPan}
        onPointerCancel={finishBlankCanvasPan}
        onDoubleClick={resetBlankCanvasView}
      >
        <div
          className="canvas-node-layer"
          style={{
            width: displayWidth,
            height: displayHeight,
            transform: `translate(${canvasPan.x}px, ${canvasPan.y}px)`,
          }}
        >
          <canvas
            ref={canvasRef}
            className={
              'graph-canvas' +
              (state.editingDecorationImageId || state.editingDecorationFrameId
                ? ' is-editing-decoration'
                : '') +
              (showContentBounds ? ' is-editing-bounds' : '')
            }
            style={canvasStyle}
            width={state.document.canvas.width}
            height={state.document.canvas.height}
            role="img"
            tabIndex={0}
            aria-label={`${state.document.name} 的属性图预览；点击元素可选择，方向键可微调选中的装饰元素`}
            onKeyDown={nudgeSelectedElement}
            onPointerDown={selectAtPointer}
            onPointerMove={dragCanvasElement}
            onPointerUp={finishCanvasElementDrag}
            onPointerCancel={finishCanvasElementDrag}
          />
          {showNodeActionMenu && selectedLayoutNode && onNodeAction ? (
            <div
              className="canvas-node-action-menu"
              style={nodeActionMenuStyle}
              role="toolbar"
              aria-label="属性圈操作"
            >
              <button
                type="button"
                className="canvas-node-action is-image"
                style={nodeActionButtonStyle(imageActionAngle)}
                aria-label="调整标签图片"
                title="调整标签图片"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setNodeActionMenuId(null)
                  onNodeAction({
                    nodeId: selectedLayoutNode.id,
                    action: 'image',
                  })
                }}
              >
                <img
                  className="canvas-node-action-icon"
                  src={imageIconUrl}
                  alt=""
                  aria-hidden="true"
                />
              </button>
              {!hidesChildAction ? (
                <button
                  type="button"
                  className="canvas-node-action is-child"
                  style={nodeActionButtonStyle(nodeActionGeometry.angles[1])}
                  aria-label="添加子标签"
                  title="添加子标签"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setNodeActionMenuId(null)
                    onNodeAction({
                      nodeId: selectedLayoutNode.id,
                      action: 'child',
                    })
                  }}
                >
                  <span aria-hidden="true">+</span>
                </button>
              ) : null}
              <button
                type="button"
                className="canvas-node-action is-delete"
                style={nodeActionButtonStyle(deleteActionAngle)}
                aria-label="删除标签"
                title="删除标签"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setNodeActionMenuId(null)
                  onNodeAction({
                    nodeId: selectedLayoutNode.id,
                    action: 'delete',
                  })
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
