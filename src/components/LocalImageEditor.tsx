import { useEffect, useRef, useState } from 'react'

import {
  drawTransformedImageCover,
  panImageTransform,
  zoomImageTransform,
} from '../canvas/imageTransform'
import {
  DEFAULT_IMAGE_TRANSFORM,
  type GraphImageTransform,
} from '../domain/graph'
import type { LocalImageAsset } from '../editor/assets'
import {
  OnlineImageSearchError,
  searchOnlineImages,
  type OnlineImageSearchResult,
} from '../search/onlineImageSearch'

interface LocalImageEditorProps {
  asset: LocalImageAsset
  initialTransform?: GraphImageTransform
  cropShape: 'circle' | 'square'
  cropAspectRatio?: number
  title: string
  onlineImageSeed?: OnlineImageSearchResult
  onSelectOnlineImage?: (result: OnlineImageSearchResult) => Promise<boolean>
  onSearch?: () => void
  onCancel: () => void
  onApply: (transform: GraphImageTransform) => void
}

interface PointerPosition {
  x: number
  y: number
}

interface ImageGesture {
  centerX: number
  centerY: number
  distance: number
  transform: GraphImageTransform
  viewportSize: number
}

interface ResizeGesture {
  startX: number
  startY: number
  transform: GraphImageTransform
  corner: ResizeCorner
}

type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export function LocalImageEditor({
  asset,
  initialTransform,
  cropShape,
  cropAspectRatio = 1,
  title,
  onlineImageSeed,
  onSelectOnlineImage,
  onSearch,
  onCancel,
  onApply,
}: LocalImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [transform, setTransform] = useState<GraphImageTransform>(() => ({
    ...DEFAULT_IMAGE_TRANSFORM,
    ...initialTransform,
  }))
  const transformRef = useRef(transform)
  const pointersRef = useRef(new Map<number, PointerPosition>())
  const gestureRef = useRef<ImageGesture | null>(null)
  const resizeGestureRef = useRef<ResizeGesture | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [anilistCandidates, setAniListCandidates] = useState<
    OnlineImageSearchResult[]
  >([])
  const [anilistMessage, setAniListMessage] = useState(
    '正在按日文原名搜索 AniList 头像…',
  )
  const [selectingAniListId, setSelectingAniListId] = useState<string | null>(
    null,
  )
  const supportsAniListCandidates =
    onlineImageSeed?.kind === 'character' || onlineImageSeed?.kind === 'anime'
  const onlineImageCandidates = onlineImageSeed
    ? [onlineImageSeed, ...anilistCandidates]
    : anilistCandidates
  const previewAspectRatio = Math.max(0.5, Math.min(2, cropAspectRatio))
  const previewPixelWidth = 720
  const previewPixelHeight = Math.round(previewPixelWidth / previewAspectRatio)

  const commitTransform = (
    next:
      | GraphImageTransform
      | ((current: GraphImageTransform) => GraphImageTransform),
  ) => {
    setTransform((current) => {
      const value = typeof next === 'function' ? next(current) : next
      transformRef.current = value
      return value
    })
  }

  useEffect(() => {
    if (
      !onlineImageSeed ||
      onlineImageSeed.provider !== 'bangumi' ||
      !supportsAniListCandidates ||
      !onSelectOnlineImage
    ) {
      return
    }
    const controller = new AbortController()
    const queryName = onlineImageSeed.nativeName ?? onlineImageSeed.name
    void searchOnlineImages(queryName, onlineImageSeed.kind, {
      provider: 'anilist',
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return
        setAniListCandidates(response.results)
        setAniListMessage('')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setAniListCandidates([])
        setAniListMessage(
          error instanceof OnlineImageSearchError
            ? error.message
            : 'AniList 搜索失败，可继续使用当前 Bangumi 图片。',
        )
      })
    return () => controller.abort()
  }, [onlineImageSeed, onSelectOnlineImage, supportsAniListCandidates])

  const createGesture = (): ImageGesture | null => {
    const canvas = canvasRef.current
    const points = [...pointersRef.current.values()]
    if (!canvas || points.length === 0) return null
    const rect = canvas.getBoundingClientRect()
    const first = points[0]!
    const second = points[1]
    return {
      centerX: second ? (first.x + second.x) / 2 : first.x,
      centerY: second ? (first.y + second.y) / 2 : first.y,
      distance: second ? Math.hypot(second.x - first.x, second.y - first.y) : 0,
      transform: transformRef.current,
      viewportSize: Math.max(1, rect.width),
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const logicalWidth = 360
    const logicalHeight = logicalWidth / previewAspectRatio
    const scale = canvas.width / logicalWidth
    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.clearRect(0, 0, logicalWidth, logicalHeight)
    context.fillStyle = '#18181D'
    context.fillRect(0, 0, logicalWidth, logicalHeight)

    const checkerSize = 18
    for (let y = 0; y < logicalHeight; y += checkerSize) {
      for (let x = 0; x < logicalWidth; x += checkerSize) {
        if ((x / checkerSize + y / checkerSize) % 2 === 0) {
          context.fillStyle = '#202027'
          context.fillRect(x, y, checkerSize, checkerSize)
        }
      }
    }

    const inset = 0
    const cropWidth = logicalWidth - inset * 2
    const cropHeight = logicalHeight - inset * 2
    const cropSize = Math.min(cropWidth, cropHeight)
    const cropX = cropShape === 'circle' ? (logicalWidth - cropSize) / 2 : inset
    const cropY =
      cropShape === 'circle' ? (logicalHeight - cropSize) / 2 : inset
    const imageWidth = cropShape === 'circle' ? cropSize : cropWidth
    const imageHeight = cropShape === 'circle' ? cropSize : cropHeight
    drawTransformedImageCover(
      context,
      asset.image,
      cropX,
      cropY,
      imageWidth,
      imageHeight,
      transform,
    )

    context.save()
    context.fillStyle = 'rgba(0, 0, 0, 0.52)'
    context.beginPath()
    context.rect(0, 0, logicalWidth, logicalHeight)
    if (cropShape === 'circle') {
      context.arc(
        logicalWidth / 2,
        logicalHeight / 2,
        cropSize / 2,
        0,
        Math.PI * 2,
        true,
      )
    } else {
      context.rect(inset, inset, cropWidth, cropHeight)
    }
    context.fill('evenodd')
    context.restore()

    context.beginPath()
    if (cropShape === 'circle') {
      context.arc(
        logicalWidth / 2,
        logicalHeight / 2,
        cropSize / 2,
        0,
        Math.PI * 2,
      )
    } else {
      context.rect(inset, inset, cropWidth, cropHeight)
    }
    context.lineWidth = 3
    context.strokeStyle = '#15B8A6'
    context.stroke()
  }, [asset.image, cropShape, previewAspectRatio, transform])

  const defaultTransform =
    asset.source?.provider === 'bangumi' &&
    ['character', 'singer'].includes(onlineImageSeed?.kind ?? '')
      ? { ...DEFAULT_IMAGE_TRANSFORM, offsetY: 1 }
      : DEFAULT_IMAGE_TRANSFORM
  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    gestureRef.current = createGesture()
    setIsDragging(pointersRef.current.size > 0)
  }

  const startResize = (
    corner: ResizeCorner,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation()
    resizeGestureRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      transform: transformRef.current,
      corner,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const moveResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = resizeGestureRef.current
    if (!gesture) return
    event.stopPropagation()
    const deltaX = event.clientX - gesture.startX
    const deltaY = event.clientY - gesture.startY
    const outwardDelta =
      gesture.corner === 'top-left'
        ? (-deltaX - deltaY) / 2
        : gesture.corner === 'top-right'
          ? (deltaX - deltaY) / 2
          : gesture.corner === 'bottom-left'
            ? (-deltaX + deltaY) / 2
            : (deltaX + deltaY) / 2
    commitTransform(
      zoomImageTransform(gesture.transform, Math.exp(outwardDelta / 120)),
    )
  }

  const finishResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    resizeGestureRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const resizeCorners: ResizeCorner[] = [
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ]

  return (
    <div
      className={'image-editor-backdrop'}
      role={'presentation'}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <section
        className={'image-editor-dialog'}
        role={'dialog'}
        aria-modal={true}
        aria-labelledby={'image-editor-title'}
      >
        <div className={'image-editor-heading'}>
          <div>
            <h2 id={'image-editor-title'}>{title}</h2>
          </div>
          <div className={'image-editor-heading-actions'}>
            {onSearch ? (
              <button
                type={'button'}
                className={'ghost-button'}
                onClick={onSearch}
              >
                搜索图片
              </button>
            ) : null}
            <button
              type={'button'}
              className={'profile-icon-button'}
              aria-label={'关闭图片编辑器'}
              onClick={onCancel}
            >
              ×
            </button>
          </div>
        </div>

        <div className={'image-editor-layout'}>
          <div className={'image-editor-preview'}>
            <div className={'image-editor-canvas-shell'}>
              <canvas
                ref={canvasRef}
                width={previewPixelWidth}
                height={previewPixelHeight}
                aria-label={'图片裁切预览'}
                className={isDragging ? 'is-dragging' : undefined}
                onPointerDown={(event) => {
                  pointersRef.current.set(event.pointerId, {
                    x: event.clientX,
                    y: event.clientY,
                  })
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                  gestureRef.current = createGesture()
                  setIsDragging(true)
                }}
                onPointerMove={(event) => {
                  if (!pointersRef.current.has(event.pointerId)) return
                  pointersRef.current.set(event.pointerId, {
                    x: event.clientX,
                    y: event.clientY,
                  })
                  const gesture = gestureRef.current
                  const points = [...pointersRef.current.values()]
                  if (!gesture || points.length === 0) return
                  const first = points[0]!
                  const second = points[1]
                  const centerX = second ? (first.x + second.x) / 2 : first.x
                  const centerY = second ? (first.y + second.y) / 2 : first.y
                  let next = gesture.transform
                  if (second && gesture.distance > 0) {
                    const distance = Math.hypot(
                      second.x - first.x,
                      second.y - first.y,
                    )
                    next = zoomImageTransform(next, distance / gesture.distance)
                  }
                  next = panImageTransform(
                    next,
                    centerX - gesture.centerX,
                    centerY - gesture.centerY,
                    gesture.viewportSize,
                  )
                  commitTransform(next)
                }}
                onPointerUp={finishPointer}
                onPointerCancel={finishPointer}
              />
              {resizeCorners.map((corner) => (
                <button
                  type={'button'}
                  className={'image-editor-resize-handle ' + corner}
                  aria-label={'拖拽缩放图片（' + corner + '）'}
                  key={corner}
                  onPointerDown={(event) => startResize(corner, event)}
                  onPointerMove={moveResize}
                  onPointerUp={finishResize}
                  onPointerCancel={finishResize}
                />
              ))}
            </div>
            <p className={'image-editor-gesture-hint'}>
              拖动图片定位 · 双指或四角手柄缩放
            </p>
            <small>{asset.fileName}</small>
          </div>
          <div className={'image-editor-controls'}>
            {onlineImageSeed?.provider === 'bangumi' &&
            supportsAniListCandidates &&
            onSelectOnlineImage ? (
              <section className={'image-editor-online-candidates'}>
                <div className={'image-editor-online-heading'}>
                  <strong>图片候选</strong>
                  {anilistMessage ? <small>{anilistMessage}</small> : null}
                </div>
                {onlineImageCandidates.length > 0 ? (
                  <div className={'image-editor-online-grid'}>
                    {onlineImageCandidates.map((candidate) => {
                      const candidateId =
                        candidate.provider + ':' + candidate.externalId
                      const selected =
                        asset.source?.provider === candidate.provider &&
                        asset.source.externalId === candidate.externalId
                      return (
                        <button
                          type={'button'}
                          className={
                            'image-editor-online-candidate' +
                            ' is-' +
                            candidate.provider +
                            ' is-' +
                            candidate.kind +
                            (selected ? ' is-selected' : '')
                          }
                          key={candidateId}
                          disabled={selectingAniListId !== null}
                          onClick={() => {
                            setSelectingAniListId(candidateId)
                            void onSelectOnlineImage(candidate).finally(() =>
                              setSelectingAniListId(null),
                            )
                          }}
                        >
                          <img
                            crossOrigin={'anonymous'}
                            src={candidate.thumbnailUrl}
                            alt={''}
                            loading={'lazy'}
                          />
                          <em>
                            {candidate.provider === 'bangumi'
                              ? 'Bangumi'
                              : 'AniList'}
                          </em>
                          <span>{candidate.name}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </section>
            ) : null}
            <p>
              拖动图片定位，拖动四角缩放。被遮罩区域仍会压暗显示，方便判断人物位置。
            </p>
          </div>
        </div>

        <div className={'image-editor-actions'}>
          <button
            type={'button'}
            className={'ghost-button'}
            onClick={() => commitTransform({ ...defaultTransform })}
          >
            重置
          </button>
          <span />
          <button
            type={'button'}
            className={'secondary-button'}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type={'button'}
            className={'primary-button'}
            onClick={() => onApply(transform)}
          >
            应用
          </button>
        </div>
      </section>
    </div>
  )
}
