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

interface LocalImageEditorProps {
  asset: LocalImageAsset
  initialTransform?: GraphImageTransform
  cropShape: 'circle' | 'square'
  cropAspectRatio?: number
  title: string
  onCancel: () => void
  onApply: (transform: GraphImageTransform) => void
}

interface ImageTransformSliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  display: string
  onChange: (value: number) => void
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
}

function ImageTransformSlider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
}: ImageTransformSliderProps) {
  return (
    <label className={'image-editor-slider'}>
      <span>{label}</span>
      <input
        type={'range'}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output>{display}</output>
    </label>
  )
}

export function LocalImageEditor({
  asset,
  initialTransform,
  cropShape,
  cropAspectRatio = 1,
  title,
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
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setTransform((current) => {
        const value = zoomImageTransform(
          current,
          Math.exp(-event.deltaY * 0.0015),
        )
        transformRef.current = value
        return value
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

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

    const inset = 18
    const cropWidth = logicalWidth - inset * 2
    const cropHeight = logicalHeight - inset * 2
    const cropSize = Math.min(cropWidth, cropHeight)
    context.save()
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
    context.clip()
    drawTransformedImageCover(
      context,
      asset.image,
      inset,
      inset,
      cropWidth,
      cropHeight,
      transform,
    )
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

  const update = (patch: Partial<GraphImageTransform>) => {
    commitTransform((current) => ({ ...current, ...patch }))
  }
  const rotate = (delta: number) => {
    const rotation = transform.rotation + delta
    update({
      rotation:
        rotation > 180
          ? rotation - 360
          : rotation < -180
            ? rotation + 360
            : rotation,
    })
  }

  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    gestureRef.current = createGesture()
    setIsDragging(pointersRef.current.size > 0)
  }

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
            <p>LOCAL IMAGE</p>
            <h2 id={'image-editor-title'}>{title}</h2>
          </div>
          <button
            type={'button'}
            className={'profile-icon-button'}
            aria-label={'关闭图片编辑器'}
            onClick={onCancel}
          >
            ×
          </button>
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
              <button
                type={'button'}
                className={'image-editor-resize-handle'}
                aria-label={'拖拽缩放图片'}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  resizeGestureRef.current = {
                    startX: event.clientX,
                    startY: event.clientY,
                    transform: transformRef.current,
                  }
                  event.currentTarget.setPointerCapture?.(event.pointerId)
                }}
                onPointerMove={(event) => {
                  const gesture = resizeGestureRef.current
                  if (!gesture) return
                  event.stopPropagation()
                  const outwardDelta =
                    (event.clientX -
                      gesture.startX +
                      event.clientY -
                      gesture.startY) /
                    2
                  commitTransform(
                    zoomImageTransform(
                      gesture.transform,
                      Math.exp(outwardDelta / 120),
                    ),
                  )
                }}
                onPointerUp={(event) => {
                  event.stopPropagation()
                  resizeGestureRef.current = null
                  if (
                    event.currentTarget.hasPointerCapture?.(event.pointerId)
                  ) {
                    event.currentTarget.releasePointerCapture(event.pointerId)
                  }
                }}
                onPointerCancel={() => {
                  resizeGestureRef.current = null
                }}
              >
                ↘
              </button>
            </div>
            <p className={'image-editor-gesture-hint'}>
              拖动图片定位 · 滚轮/双指或右下角手柄缩放
            </p>
            <small>{asset.fileName}</small>
          </div>
          <div className={'image-editor-controls'}>
            <ImageTransformSlider
              label={'缩放'}
              value={transform.zoom * 100}
              min={100}
              max={400}
              display={Math.round(transform.zoom * 100) + '%'}
              onChange={(value) => update({ zoom: value / 100 })}
            />
            <ImageTransformSlider
              label={'水平位置'}
              value={transform.offsetX * 100}
              min={-100}
              max={100}
              display={Math.round(transform.offsetX * 100) + '%'}
              onChange={(value) => update({ offsetX: value / 100 })}
            />
            <ImageTransformSlider
              label={'垂直位置'}
              value={transform.offsetY * 100}
              min={-100}
              max={100}
              display={Math.round(transform.offsetY * 100) + '%'}
              onChange={(value) => update({ offsetY: value / 100 })}
            />
            <ImageTransformSlider
              label={'旋转'}
              value={transform.rotation}
              min={-180}
              max={180}
              display={Math.round(transform.rotation) + '°'}
              onChange={(value) => update({ rotation: value })}
            />
            <div className={'image-editor-rotation-actions'}>
              <button type={'button'} onClick={() => rotate(-90)}>
                ↶ 左转 90°
              </button>
              <button type={'button'} onClick={() => rotate(90)}>
                ↷ 右转 90°
              </button>
            </div>
            <p>
              调整只保存裁切参数，原始图片仍保留在当前浏览器中，可以随时再次编辑。
            </p>
          </div>
        </div>

        <div className={'image-editor-actions'}>
          <button
            type={'button'}
            className={'ghost-button'}
            onClick={() => commitTransform({ ...DEFAULT_IMAGE_TRANSFORM })}
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
