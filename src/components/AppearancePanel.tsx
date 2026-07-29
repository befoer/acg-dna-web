import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { DECORATION_PRESETS } from '../domain/decorationPresets'
import {
  DEFAULT_DECORATION_FRAME,
  DEFAULT_DECORATION_PATTERN,
  DECORATION_DATA_LAYER_ID,
  DECORATION_PATTERN_LAYER_ID,
  createEntityId,
  customTextIdFromDecorationLayer,
  decorationFrameLayerId,
  decorationImageLayerId,
  decorationPatternLayerId,
  decorationPresetLayerId,
  patternIdFromDecorationLayer,
  resolveDecorationLayerOrder,
  type GraphDecorationFrame,
  type GraphDecorationPattern,
  type GraphDecorationSettings,
} from '../domain/graph'
import { useEditor } from '../editor/editorContext'
import { ContentBoundsPanel } from './ContentBoundsPanel'
import { GlobalLabelSettingsPanel } from './GlobalLabelSettingsPanel'
import { HexColorField } from './HexColorField'
import eyeIconUrl from '../assets/eye.svg'

const CANVAS_PRESETS = [
  { id: 'classic', name: '经典竖版', width: 1380, height: 2000 },
  { id: 'portrait', name: '竖版 3:4', width: 1500, height: 2000 },
  { id: 'story', name: '长图 9:16', width: 1125, height: 2000 },
  { id: 'square', name: '正方形', width: 1600, height: 1600 },
  { id: 'landscape', name: '横版 4:3', width: 2000, height: 1500 },
] as const

function timestamp(): string {
  return new Date().toISOString()
}

function clampDimension(value: number): number {
  if (!Number.isFinite(value)) return 320
  return Math.min(4096, Math.max(320, Math.round(value)))
}

interface AppearancePanelProps {
  contentBoundsEditing?: boolean
  onContentBoundsEditingChange?: (editing: boolean) => void
  canvasJumpToken?: number
}

export function AppearancePanel({
  contentBoundsEditing = false,
  onContentBoundsEditingChange,
  canvasJumpToken = 0,
}: AppearancePanelProps = {}) {
  const { state, dispatch, attachDecorationImage, removeDecorationImage } =
    useEditor()
  const canvas = state.document.canvas
  const sizeLocked = canvas.templateId !== 'custom'
  const decoration = state.document.decoration
  // The filters remain part of the rendering data flow for future material groups.
  const [decorationFilter] = useState<'all' | 'element' | 'background'>('all')
  const [appearanceTab, setAppearanceTab] = useState<'decoration' | 'canvas'>(
    'decoration',
  )
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(
    null,
  )
  const [layersExpanded, setLayersExpanded] = useState(false)
  const selectedDecorationImage = decoration.images.find(
    (image) => image.id === state.editingDecorationImageId,
  )
  const selectedFrame = decoration.frames.find(
    (frame) => frame.id === state.editingDecorationFrameId,
  )
  const selectedPattern = decoration.patterns.find(
    (pattern) => pattern.id === selectedPatternId,
  )
  const resolvedLayerOrder = resolveDecorationLayerOrder(
    decoration,
    state.document.profile.customTexts.map((text) => text.id),
  )
  const layerDragRef = useRef<string | null>(null)
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null)

  useEffect(() => {
    if (canvasJumpToken <= 0) return
    const timer = window.setTimeout(() => setAppearanceTab('canvas'), 0)
    return () => window.clearTimeout(timer)
  }, [canvasJumpToken])

  const resizeCanvas = (width: number, height: number) => {
    dispatch({
      type: 'canvas-size-changed',
      width: clampDimension(width),
      height: clampDimension(height),
      at: timestamp(),
    })
  }

  const applyCustomSize = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    resizeCanvas(Number(formData.get('width')), Number(formData.get('height')))
  }

  const handleDecorationImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    void attachDecorationImage(file).then((imageId) => {
      if (imageId) dispatch({ type: 'decoration-image-selected', imageId })
    })
  }

  const updateDecoration = (
    patch: Partial<GraphDecorationSettings>,
    group?: string,
  ) => {
    dispatch({
      type: 'decoration-settings-changed',
      patch,
      ...(group ? { group } : {}),
      at: timestamp(),
    })
  }

  const updateSelectedPattern = (
    patch: Partial<GraphDecorationPattern>,
    group?: string,
  ) => {
    if (!selectedPattern) return
    updateDecoration(
      {
        patterns: decoration.patterns.map((pattern) =>
          pattern.id === selectedPattern.id
            ? { ...pattern, ...patch }
            : pattern,
        ),
      },
      group,
    )
  }

  const togglePreset = (
    presetId: (typeof DECORATION_PRESETS)[number]['id'],
  ) => {
    const selected = decoration.presetIds.includes(presetId)
    const layerId = decorationPresetLayerId(presetId)
    updateDecoration({
      presetIds: selected
        ? decoration.presetIds.filter((id) => id !== presetId)
        : [...decoration.presetIds, presetId],
      layerOrder: selected
        ? resolvedLayerOrder.filter((id) => id !== layerId)
        : resolvedLayerOrder,
      hiddenLayerIds: decoration.hiddenLayerIds.filter((id) => id !== layerId),
    })
  }

  const layerName = (layerId: string): string => {
    if (layerId === DECORATION_DATA_LAYER_ID) return '属性图'
    if (layerId === DECORATION_PATTERN_LAYER_ID) return '自定义图案'
    const patternId = patternIdFromDecorationLayer(layerId)
    const pattern = decoration.patterns.find(
      (candidate) => candidate.id === patternId,
    )
    if (pattern) return pattern.name
    const preset = DECORATION_PRESETS.find(
      (candidate) => decorationPresetLayerId(candidate.id) === layerId,
    )
    if (preset) return preset.name
    const frame = decoration.frames.find(
      (candidate) => decorationFrameLayerId(candidate.id) === layerId,
    )
    if (frame) return frame.name
    const image = decoration.images.find(
      (candidate) => decorationImageLayerId(candidate.id) === layerId,
    )
    if (image) return image.name
    const textId = customTextIdFromDecorationLayer(layerId)
    const text = state.document.profile.customTexts.find(
      (candidate) => candidate.id === textId,
    )
    return text ? text.text.trim() || '空白文字' : '装饰图层'
  }

  const selectLayer = (layerId: string) => {
    const image = decoration.images.find(
      (candidate) => decorationImageLayerId(candidate.id) === layerId,
    )
    if (image) {
      dispatch({ type: 'decoration-image-selected', imageId: image.id })
      return
    }
    const frame = decoration.frames.find(
      (candidate) => decorationFrameLayerId(candidate.id) === layerId,
    )
    if (frame) {
      dispatch({ type: 'decoration-frame-selected', frameId: frame.id })
      return
    }
    const textId = customTextIdFromDecorationLayer(layerId)
    if (textId) {
      dispatch({ type: 'custom-text-selected', textId })
      return
    }
    const patternId = patternIdFromDecorationLayer(layerId)
    if (
      patternId &&
      decoration.patterns.some((pattern) => pattern.id === patternId)
    ) {
      setSelectedPatternId(patternId)
      return
    }
    dispatch({ type: 'node-selected', nodeId: state.selectedNodeId })
    if (layerId === DECORATION_PATTERN_LAYER_ID) {
      setAppearanceTab('decoration')
      return
    }
    if (layerId === DECORATION_DATA_LAYER_ID) {
      return
    }
  }

  const moveLayer = (layerId: string, direction: 'up' | 'down') => {
    const index = resolvedLayerOrder.indexOf(layerId)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || target < 0 || target >= resolvedLayerOrder.length) return
    const next = [...resolvedLayerOrder]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    updateDecoration({ layerOrder: next }, 'layer-order')
  }

  const reorderLayer = (sourceId: string, targetId: string) => {
    const source = resolvedLayerOrder.indexOf(sourceId)
    const target = resolvedLayerOrder.indexOf(targetId)
    if (source < 0 || target < 0 || source === target) return
    const next = [...resolvedLayerOrder]
    next.splice(target, 0, next.splice(source, 1)[0]!)
    updateDecoration({ layerOrder: next }, 'layer-order-drag')
  }

  const dragLayerAtPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const sourceId = layerDragRef.current
    if (!sourceId) return
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-layer-id]')
    const targetId = target?.dataset.layerId
    if (targetId) reorderLayer(sourceId, targetId)
    event.preventDefault()
  }

  const finishLayerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!layerDragRef.current) return
    layerDragRef.current = null
    setDraggingLayerId(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const toggleLayerVisibility = (layerId: string) => {
    const hiddenByLayer = decoration.hiddenLayerIds.includes(layerId)
    const patternHidden =
      layerId === DECORATION_PATTERN_LAYER_ID &&
      decoration.pattern?.visible === false
    const patternId = patternIdFromDecorationLayer(layerId)
    const selectedLayerPattern = decoration.patterns.find(
      (candidate) => candidate.id === patternId,
    )
    const frame = decoration.frames.find(
      (candidate) => decorationFrameLayerId(candidate.id) === layerId,
    )
    const image = decoration.images.find(
      (candidate) => decorationImageLayerId(candidate.id) === layerId,
    )
    const textId = customTextIdFromDecorationLayer(layerId)
    const text = state.document.profile.customTexts.find(
      (candidate) => candidate.id === textId,
    )
    const hiddenByElement =
      patternHidden ||
      selectedLayerPattern?.visible === false ||
      frame?.visible === false ||
      image?.visible === false ||
      text?.visible === false
    if (hiddenByElement) {
      const hiddenLayerIds = decoration.hiddenLayerIds.filter(
        (id) => id !== layerId,
      )
      if (patternHidden && decoration.pattern) {
        updateDecoration({
          pattern: { ...decoration.pattern, visible: true },
          hiddenLayerIds,
        })
      } else if (selectedLayerPattern) {
        updateDecoration({
          patterns: decoration.patterns.map((pattern) =>
            pattern.id === selectedLayerPattern.id
              ? { ...pattern, visible: true }
              : pattern,
          ),
          hiddenLayerIds,
        })
      } else if (frame) {
        updateDecoration({
          frames: decoration.frames.map((candidate) =>
            candidate.id === frame.id
              ? { ...candidate, visible: true }
              : candidate,
          ),
          hiddenLayerIds,
        })
      } else if (image) {
        updateDecoration({
          images: decoration.images.map((candidate) =>
            candidate.id === image.id
              ? { ...candidate, visible: true }
              : candidate,
          ),
          hiddenLayerIds,
        })
      } else if (text) {
        if (hiddenByLayer) updateDecoration({ hiddenLayerIds })
        dispatch({
          type: 'profile-settings-changed',
          patch: {
            customTexts: state.document.profile.customTexts.map((candidate) =>
              candidate.id === text.id
                ? { ...candidate, visible: true }
                : candidate,
            ),
          },
          at: timestamp(),
        })
      }
      return
    }
    updateDecoration({
      hiddenLayerIds: hiddenByLayer
        ? decoration.hiddenLayerIds.filter((id) => id !== layerId)
        : [...decoration.hiddenLayerIds, layerId],
    })
  }

  const isLayerHidden = (layerId: string): boolean => {
    if (decoration.hiddenLayerIds.includes(layerId)) return true
    if (layerId === DECORATION_PATTERN_LAYER_ID) {
      return decoration.pattern?.visible === false
    }
    const patternId = patternIdFromDecorationLayer(layerId)
    const pattern = decoration.patterns.find(
      (candidate) => candidate.id === patternId,
    )
    if (pattern) return !pattern.visible
    const frame = decoration.frames.find(
      (candidate) => decorationFrameLayerId(candidate.id) === layerId,
    )
    if (frame) return !frame.visible
    const image = decoration.images.find(
      (candidate) => decorationImageLayerId(candidate.id) === layerId,
    )
    if (image) return !image.visible
    const textId = customTextIdFromDecorationLayer(layerId)
    const text = state.document.profile.customTexts.find(
      (candidate) => candidate.id === textId,
    )
    return text ? !text.visible : false
  }

  const deleteLayer = (layerId: string) => {
    if (layerId === DECORATION_DATA_LAYER_ID) return
    const commonPatch = {
      layerOrder: resolvedLayerOrder.filter((id) => id !== layerId),
      hiddenLayerIds: decoration.hiddenLayerIds.filter((id) => id !== layerId),
    }
    if (layerId === DECORATION_PATTERN_LAYER_ID) {
      updateDecoration({ ...commonPatch, pattern: null })
      return
    }
    const patternId = patternIdFromDecorationLayer(layerId)
    if (patternId) {
      updateDecoration({
        ...commonPatch,
        patterns: decoration.patterns.filter(
          (candidate) => candidate.id !== patternId,
        ),
      })
      if (selectedPatternId === patternId) setSelectedPatternId(null)
      return
    }
    const preset = DECORATION_PRESETS.find(
      (candidate) => decorationPresetLayerId(candidate.id) === layerId,
    )
    if (preset) {
      updateDecoration({
        ...commonPatch,
        presetIds: decoration.presetIds.filter((id) => id !== preset.id),
      })
      return
    }
    const frame = decoration.frames.find(
      (candidate) => decorationFrameLayerId(candidate.id) === layerId,
    )
    if (frame) {
      updateDecoration({
        ...commonPatch,
        frames: decoration.frames.filter(
          (candidate) => candidate.id !== frame.id,
        ),
      })
      if (state.editingDecorationFrameId === frame.id) {
        dispatch({ type: 'decoration-frame-selected', frameId: null })
      }
      return
    }
    const image = decoration.images.find(
      (candidate) => decorationImageLayerId(candidate.id) === layerId,
    )
    if (image) {
      removeDecorationImage(image.id)
      return
    }
    const textId = customTextIdFromDecorationLayer(layerId)
    if (textId) {
      dispatch({
        type: 'profile-settings-changed',
        patch: {
          customTexts: state.document.profile.customTexts.filter(
            (text) => text.id !== textId,
          ),
        },
        at: timestamp(),
      })
    }
  }

  const updateSelectedFrame = (
    patch: Partial<GraphDecorationFrame>,
    group?: string,
  ) => {
    if (!selectedFrame) return
    updateDecoration(
      {
        frames: decoration.frames.map((frame) =>
          frame.id === selectedFrame.id ? { ...frame, ...patch } : frame,
        ),
      },
      group,
    )
  }

  return (
    <div className={'appearance-panel-content'} aria-label={'外观面板'}>
      <div className={'panel-header'}>
        <div>
          <h2>外观</h2>
        </div>
        <div
          className={'panel-header-actions appearance-header-tabs'}
          role={'tablist'}
          aria-label={'外观设置分类'}
        >
          {(
            [
              ['decoration', '装饰'],
              ['canvas', '画布'],
            ] as const
          ).map(([id, label]) => (
            <button
              type={'button'}
              role={'tab'}
              aria-selected={appearanceTab === id}
              className={
                'ghost-button' + (appearanceTab === id ? ' is-selected' : '')
              }
              onClick={() => {
                setAppearanceTab(id)
                if (id !== 'canvas') onContentBoundsEditingChange?.(false)
              }}
              key={id}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <section
        className={'appearance-card'}
        hidden={appearanceTab === 'canvas'}
      >
        <div
          className={'appearance-tab-pane'}
          hidden={appearanceTab !== 'decoration'}
        >
          <div className={'appearance-section-heading'}>
            <div>
              <strong>装饰素材</strong>
              <small>来自 APP 创作页，可叠加使用并进入 PNG</small>
            </div>
          </div>
          <div className={'decoration-preset-grid'}>
            {decorationFilter !== 'background' ? (
              <label className={'decoration-upload-card'}>
                <span aria-hidden={true}>＋</span>
                <small>自定义图片</small>
                <input
                  type={'file'}
                  accept={'image/png,image/jpeg,image/webp,image/avif'}
                  disabled={decoration.images.length >= 20}
                  onChange={handleDecorationImageFile}
                />
              </label>
            ) : null}
            {DECORATION_PRESETS.filter(
              (preset) =>
                decorationFilter === 'all' ||
                preset.category === decorationFilter,
            ).map((preset) => {
              const selected = decoration.presetIds.includes(preset.id)
              return (
                <button
                  type={'button'}
                  className={selected ? 'is-selected' : ''}
                  aria-pressed={selected}
                  onClick={() => togglePreset(preset.id)}
                  key={preset.id}
                >
                  <span className={'decoration-preset-preview'}>
                    <img src={preset.imageUrl} alt={''} />
                    {selected ? <em>使用中</em> : null}
                  </span>
                  <small>{preset.name}</small>
                </button>
              )
            })}
            {decorationFilter !== 'element' ? (
              <button
                type={'button'}
                disabled={decoration.patterns.length >= 20}
                onClick={() => {
                  const id = createEntityId('decoration-pattern')
                  updateDecoration({
                    patterns: [
                      ...decoration.patterns,
                      {
                        id,
                        name: '图案纹理' + (decoration.patterns.length + 1),
                        ...DEFAULT_DECORATION_PATTERN,
                      },
                    ],
                  })
                  setSelectedPatternId(id)
                }}
              >
                <span className={'decoration-pattern-preview'} />
                <small>图案纹理</small>
              </button>
            ) : null}
            {decorationFilter !== 'background' ? (
              <button
                type={'button'}
                disabled={decoration.frames.length >= 20}
                onClick={() => {
                  const id = createEntityId('decoration-frame')
                  updateDecoration({
                    frames: [
                      ...decoration.frames,
                      {
                        id,
                        name: '矩形' + (decoration.frames.length + 1),
                        ...DEFAULT_DECORATION_FRAME,
                      },
                    ],
                  })
                  dispatch({ type: 'decoration-frame-selected', frameId: id })
                }}
              >
                <span className={'decoration-frame-preview'} />
                <small>创建矩形</small>
              </button>
            ) : null}
          </div>

          {decoration.frames.length > 0 && decorationFilter !== 'background' ? (
            <div className={'decoration-frame-list'} aria-label={'自定义矩形'}>
              {decoration.frames.map((frame) => (
                <button
                  type={'button'}
                  className={
                    selectedFrame?.id === frame.id ? 'is-selected' : ''
                  }
                  aria-pressed={selectedFrame?.id === frame.id}
                  onClick={() =>
                    dispatch({
                      type: 'decoration-frame-selected',
                      frameId: frame.id,
                    })
                  }
                  key={frame.id}
                >
                  <span
                    style={{
                      backgroundColor: frame.fillColor,
                      borderColor: frame.strokeColor,
                      borderWidth: Math.min(4, frame.strokeWidth) + 'px',
                      borderRadius: Math.min(14, frame.cornerRadius) + 'px',
                    }}
                  />
                  <strong>{frame.name}</strong>
                  <small>{frame.visible ? '显示中' : '已隐藏'}</small>
                </button>
              ))}
            </div>
          ) : null}

          {decoration.patterns.length > 0 ? (
            <div className={'decoration-frame-list'} aria-label={'图案纹理'}>
              {decoration.patterns.map((pattern) => (
                <button
                  type={'button'}
                  className={
                    selectedPattern?.id === pattern.id ? 'is-selected' : ''
                  }
                  aria-pressed={selectedPattern?.id === pattern.id}
                  onClick={() => setSelectedPatternId(pattern.id)}
                  key={pattern.id}
                >
                  <span
                    className={'decoration-pattern-preview'}
                    style={{
                      backgroundColor: pattern.backgroundColor,
                      color: pattern.foregroundColor,
                    }}
                  />
                  <strong>{pattern.name}</strong>
                  <small>{pattern.visible ? '显示中' : '已隐藏'}</small>
                </button>
              ))}
            </div>
          ) : null}

          {decoration.images.length > 0 && decorationFilter !== 'background' ? (
            <div
              className={'decoration-image-list'}
              aria-label={'自定义装饰图片'}
            >
              {decoration.images.map((image) => {
                const asset = state.assets[image.assetId]
                const selected = selectedDecorationImage?.id === image.id
                return (
                  <button
                    type={'button'}
                    className={selected ? 'is-selected' : ''}
                    aria-pressed={selected}
                    onClick={() =>
                      dispatch({
                        type: 'decoration-image-selected',
                        imageId: image.id,
                      })
                    }
                    key={image.id}
                  >
                    {asset ? <img src={asset.objectUrl} alt={''} /> : null}
                    <span>
                      <strong>{image.name}</strong>
                      <small>{image.visible ? '显示中' : '已隐藏'}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}

          {selectedDecorationImage ? (
            <div className={'decoration-settings-block'}>
              <div className={'appearance-section-heading'}>
                <div>
                  <strong>调整自定义图片</strong>
                  <small>{selectedDecorationImage.name}</small>
                </div>
                <label className={'profile-visibility-toggle'}>
                  <input
                    type={'checkbox'}
                    checked={selectedDecorationImage.visible}
                    onChange={(event) =>
                      dispatch({
                        type: 'decoration-image-changed',
                        imageId: selectedDecorationImage.id,
                        patch: { visible: event.currentTarget.checked },
                        at: timestamp(),
                      })
                    }
                  />
                  <span>
                    {selectedDecorationImage.visible ? '显示' : '隐藏'}
                  </span>
                </label>
              </div>
              <p className={'appearance-help'}>
                单指拖动定位，右下角手柄缩放、顶部手柄旋转；移动端也可双指同时平移、缩放和旋转。
              </p>
              {(
                [
                  ['旋转', 'rotation', -180, 180, '°'],
                  ['透明度', 'opacity', 0, 100, '%'],
                ] as const
              ).map(([label, key, minimum, maximum, suffix]) => {
                const normalized = key === 'opacity'
                const value = selectedDecorationImage[key]
                return (
                  <label className={'appearance-slider'} key={key}>
                    <span>{label}</span>
                    <input
                      type={'range'}
                      min={minimum}
                      max={maximum}
                      value={normalized ? value * 100 : value}
                      onChange={(event) =>
                        dispatch({
                          type: 'decoration-image-changed',
                          imageId: selectedDecorationImage.id,
                          patch: {
                            [key]: normalized
                              ? Number(event.currentTarget.value) / 100
                              : Number(event.currentTarget.value),
                          },
                          group: key,
                          at: timestamp(),
                        })
                      }
                    />
                    <output>
                      {Math.round(normalized ? value * 100 : value)}
                      {suffix}
                    </output>
                  </label>
                )
              })}
              <button
                type={'button'}
                className={'danger-button'}
                onClick={() => {
                  deleteLayer(
                    decorationImageLayerId(selectedDecorationImage.id),
                  )
                }}
              >
                删除这张装饰图片
              </button>
            </div>
          ) : null}

          {selectedPattern ? (
            <div className={'decoration-settings-block'}>
              <div className={'appearance-section-heading'}>
                <div>
                  <strong>图案纹理</strong>
                  <small>{selectedPattern.name}</small>
                </div>
                <label className={'profile-visibility-toggle'}>
                  <input
                    type={'checkbox'}
                    checked={selectedPattern.visible}
                    onChange={(event) =>
                      updateSelectedPattern({
                        visible: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>{selectedPattern.visible ? '显示' : '隐藏'}</span>
                </label>
              </div>
              <label className={'appearance-select'}>
                <span>图案类型</span>
                <select
                  value={selectedPattern.type}
                  onChange={(event) =>
                    updateSelectedPattern({
                      type:
                        event.currentTarget.value === 'checker'
                          ? 'checker'
                          : event.currentTarget.value === 'grid'
                            ? 'grid'
                            : 'dots',
                    })
                  }
                >
                  <option value={'checker'}>棋盘格</option>
                  <option value={'dots'}>圆点</option>
                  <option value={'grid'}>网格</option>
                </select>
              </label>
              <label className={'appearance-slider'}>
                <span>大小</span>
                <input
                  type={'range'}
                  min={10}
                  max={100}
                  value={selectedPattern.size}
                  onChange={(event) =>
                    updateSelectedPattern(
                      { size: Number(event.currentTarget.value) },
                      'pattern-size',
                    )
                  }
                />
                <output>{Math.round(selectedPattern.size)}px</output>
              </label>
              <label className={'appearance-slider'}>
                <span>旋转</span>
                <input
                  type={'range'}
                  min={0}
                  max={180}
                  value={selectedPattern.rotation}
                  onChange={(event) =>
                    updateSelectedPattern(
                      { rotation: Number(event.currentTarget.value) },
                      'pattern-rotation',
                    )
                  }
                />
                <output>{Math.round(selectedPattern.rotation)}°</output>
              </label>
              {selectedPattern.type !== 'checker' ? (
                <label className={'appearance-slider'}>
                  <span>粗细</span>
                  <input
                    type={'range'}
                    min={10}
                    max={100}
                    value={selectedPattern.weight * 100}
                    onChange={(event) =>
                      updateSelectedPattern(
                        { weight: Number(event.currentTarget.value) / 100 },
                        'pattern-weight',
                      )
                    }
                  />
                  <output>{Math.round(selectedPattern.weight * 100)}%</output>
                </label>
              ) : null}
              <div className={'decoration-color-row'}>
                <div className={'decoration-color-entry'}>
                  <span>背景颜色</span>
                  <HexColorField
                    ariaLabel={'图案背景颜色'}
                    value={selectedPattern.backgroundColor}
                    onChange={(backgroundColor) =>
                      updateSelectedPattern({
                        backgroundColor,
                      })
                    }
                  />
                </div>
                <div className={'decoration-color-entry'}>
                  <span>图案颜色</span>
                  <HexColorField
                    ariaLabel={'图案颜色'}
                    value={selectedPattern.foregroundColor}
                    onChange={(foregroundColor) =>
                      updateSelectedPattern({
                        foregroundColor,
                      })
                    }
                  />
                </div>
              </div>
              <button
                type={'button'}
                className={'danger-button'}
                onClick={() =>
                  deleteLayer(decorationPatternLayerId(selectedPattern.id))
                }
              >
                删除这个图案纹理
              </button>
            </div>
          ) : null}

          {selectedFrame ? (
            <div className={'decoration-settings-block'}>
              <div className={'appearance-section-heading'}>
                <div>
                  <strong>自定义矩形</strong>
                  <small>{selectedFrame.name}</small>
                </div>
                <label className={'profile-visibility-toggle'}>
                  <input
                    type={'checkbox'}
                    checked={selectedFrame.visible}
                    onChange={(event) =>
                      updateSelectedFrame({
                        visible: event.currentTarget.checked,
                      })
                    }
                  />
                  <span>{selectedFrame.visible ? '显示' : '隐藏'}</span>
                </label>
              </div>
              {(
                [
                  ['宽度', 'width', 10, 100, '%'],
                  ['高度', 'height', 10, 100, '%'],
                  ['X 位置', 'x', 0, 100, '%'],
                  ['Y 位置', 'y', 0, 100, '%'],
                  ['圆角', 'cornerRadius', 0, 100, ''],
                  ['描边', 'strokeWidth', 0, 20, ''],
                  ['旋转', 'rotation', -90, 90, '°'],
                ] as const
              ).map(([label, key, minimum, maximum, suffix]) => {
                const normalized =
                  key === 'width' ||
                  key === 'height' ||
                  key === 'x' ||
                  key === 'y'
                const value = selectedFrame[key]
                return (
                  <label className={'appearance-slider'} key={key}>
                    <span>{label}</span>
                    <input
                      type={'range'}
                      min={minimum}
                      max={maximum}
                      value={normalized ? value * 100 : value}
                      onChange={(event) =>
                        updateSelectedFrame(
                          {
                            [key]: normalized
                              ? Number(event.currentTarget.value) / 100
                              : Number(event.currentTarget.value),
                          },
                          'frame-' + key,
                        )
                      }
                    />
                    <output>
                      {Math.round(normalized ? value * 100 : value)}
                      {suffix}
                    </output>
                  </label>
                )
              })}
              <div className={'decoration-color-row'}>
                <div className={'decoration-color-entry'}>
                  <span>填充颜色</span>
                  <HexColorField
                    ariaLabel={'矩形填充颜色'}
                    value={selectedFrame.fillColor}
                    onChange={(fillColor) =>
                      updateSelectedFrame({
                        fillColor,
                      })
                    }
                  />
                </div>
                <div className={'decoration-color-entry'}>
                  <span>描边颜色</span>
                  <HexColorField
                    ariaLabel={'矩形描边颜色'}
                    value={selectedFrame.strokeColor}
                    onChange={(strokeColor) =>
                      updateSelectedFrame({
                        strokeColor,
                      })
                    }
                  />
                </div>
              </div>
              <button
                type={'button'}
                className={'danger-button'}
                onClick={() => {
                  deleteLayer(decorationFrameLayerId(selectedFrame.id))
                }}
              >
                删除这个矩形
              </button>
            </div>
          ) : null}
        </div>
        <div
          className={'decoration-layer-manager'}
          hidden={appearanceTab !== 'decoration'}
        >
          <div className={'appearance-section-heading'}>
            <div>
              <strong>图层</strong>
              <small>列表从上到下对应画布从前到后</small>
            </div>
            <div className={'layer-heading-actions'}>
              <button
                type={'button'}
                className={'layer-collapse-button'}
                aria-expanded={layersExpanded}
                aria-label={layersExpanded ? '收起图层' : '展开图层'}
                onClick={() => setLayersExpanded((expanded) => !expanded)}
              />
            </div>
          </div>
          {layersExpanded ? (
            <>
              {selectedDecorationImage || selectedFrame ? (
                <button
                  type={'button'}
                  className={'layer-edit-selection-button'}
                  onClick={() => setAppearanceTab('decoration')}
                >
                  <span>
                    <strong>
                      {selectedDecorationImage?.name ?? selectedFrame?.name}
                    </strong>
                    <small>已在画布同步选中</small>
                  </span>
                  <em>调整参数 →</em>
                </button>
              ) : state.editingCustomTextId ? (
                <p className={'layer-selection-note'}>
                  已选中文字图层；文字内容和字体参数继续在“资料”中调整。
                </p>
              ) : (
                <p className={'layer-selection-note'}>
                  点击图层可同步选择画布元素，按住 ≡ 可拖拽排序。
                </p>
              )}
              <div
                className={'decoration-layer-list'}
                onPointerMove={dragLayerAtPointer}
                onPointerUp={finishLayerDrag}
                onPointerCancel={finishLayerDrag}
              >
                {resolvedLayerOrder.map((layerId, index) => {
                  const hidden = isLayerHidden(layerId)
                  const isData = layerId === DECORATION_DATA_LAYER_ID
                  const textId = customTextIdFromDecorationLayer(layerId)
                  const patternId = patternIdFromDecorationLayer(layerId)
                  const selected =
                    state.editingDecorationImageId !== null &&
                    layerId ===
                      decorationImageLayerId(state.editingDecorationImageId)
                      ? true
                      : state.editingDecorationFrameId !== null &&
                          layerId ===
                            decorationFrameLayerId(
                              state.editingDecorationFrameId,
                            )
                        ? true
                        : patternId !== null && patternId === selectedPatternId
                          ? true
                          : textId !== null &&
                            textId === state.editingCustomTextId
                  return (
                    <div
                      className={
                        (hidden ? 'is-hidden ' : '') +
                        (selected ? 'is-selected ' : '') +
                        (draggingLayerId === layerId ? 'is-dragging' : '')
                      }
                      data-layer-id={layerId}
                      onClick={() => selectLayer(layerId)}
                      key={layerId}
                    >
                      <button
                        type={'button'}
                        className={'layer-drag-handle'}
                        aria-label={
                          '拖动或使用方向键排序 ' + layerName(layerId)
                        }
                        onKeyDown={(event) => {
                          if (
                            event.key !== 'ArrowUp' &&
                            event.key !== 'ArrowDown'
                          ) {
                            return
                          }
                          event.preventDefault()
                          event.stopPropagation()
                          moveLayer(
                            layerId,
                            event.key === 'ArrowUp' ? 'up' : 'down',
                          )
                        }}
                        onPointerDown={(event) => {
                          layerDragRef.current = layerId
                          setDraggingLayerId(layerId)
                          event.currentTarget.setPointerCapture(event.pointerId)
                          event.stopPropagation()
                        }}
                      >
                        ≡
                      </button>
                      <button
                        type={'button'}
                        className={'layer-visibility-button'}
                        aria-label={
                          (hidden ? '显示图层 ' : '隐藏图层 ') +
                          layerName(layerId)
                        }
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleLayerVisibility(layerId)
                        }}
                      >
                        <img src={eyeIconUrl} alt={''} aria-hidden={true} />
                      </button>
                      <span>
                        <strong>{layerName(layerId)}</strong>
                        <small>
                          {isData ? '数据' : textId ? '文字' : '装饰'}
                        </small>
                      </span>
                      <button
                        type={'button'}
                        aria-label={'上移图层 ' + layerName(layerId)}
                        disabled={index === 0}
                        onClick={(event) => {
                          event.stopPropagation()
                          moveLayer(layerId, 'up')
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type={'button'}
                        aria-label={'下移图层 ' + layerName(layerId)}
                        disabled={index === resolvedLayerOrder.length - 1}
                        onClick={(event) => {
                          event.stopPropagation()
                          moveLayer(layerId, 'down')
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type={'button'}
                        aria-label={'删除图层 ' + layerName(layerId)}
                        disabled={isData}
                        onClick={(event) => {
                          event.stopPropagation()
                          deleteLayer(layerId)
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
                {canvas.templateId !== 'custom' ? (
                  <div
                    className={
                      decoration.templateBackgroundVisible ? '' : 'is-hidden'
                    }
                  >
                    <button type={'button'} disabled={true} aria-hidden={true}>
                      ≡
                    </button>
                    <button
                      type={'button'}
                      className={'layer-visibility-button'}
                      aria-label={'切换模板背景'}
                      onClick={() =>
                        updateDecoration({
                          templateBackgroundVisible:
                            !decoration.templateBackgroundVisible,
                        })
                      }
                    >
                      <img src={eyeIconUrl} alt={''} aria-hidden={true} />
                    </button>
                    <span>
                      <strong>模板背景</strong>
                      <small>固定底层</small>
                    </span>
                    <button type={'button'} disabled={true}>
                      ↑
                    </button>
                    <button type={'button'} disabled={true}>
                      ↓
                    </button>
                    <button type={'button'} disabled={true}>
                      ×
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </section>

      {!sizeLocked ? (
        <section
          className={'appearance-card'}
          hidden={appearanceTab !== 'canvas'}
        >
          <div className={'appearance-section-heading'}>
            <div>
              <strong>画布比例</strong>
              <small>选择常用尺寸或输入自定义像素</small>
            </div>
          </div>
          <div className={'canvas-preset-grid'}>
            {CANVAS_PRESETS.map((preset) => {
              const selected =
                canvas.width === preset.width && canvas.height === preset.height
              return (
                <button
                  type={'button'}
                  className={selected ? 'is-selected' : ''}
                  aria-pressed={selected}
                  onClick={() => resizeCanvas(preset.width, preset.height)}
                  key={preset.id}
                >
                  <span
                    className={'canvas-preset-shape'}
                    style={{
                      aspectRatio: preset.width + ' / ' + preset.height,
                    }}
                  />
                  <strong>{preset.name}</strong>
                  <small>
                    {preset.width} × {preset.height}
                  </small>
                </button>
              )
            })}
          </div>
          <form
            className={'canvas-custom-size'}
            onSubmit={applyCustomSize}
            key={canvas.width + ':' + canvas.height}
          >
            <label>
              <span>宽度</span>
              <input
                type={'number'}
                min={320}
                max={4096}
                inputMode={'numeric'}
                name={'width'}
                defaultValue={canvas.width}
              />
            </label>
            <span aria-hidden={true}>×</span>
            <label>
              <span>高度</span>
              <input
                type={'number'}
                min={320}
                max={4096}
                inputMode={'numeric'}
                name={'height'}
                defaultValue={canvas.height}
              />
            </label>
            <button
              type={'submit'}
              className={'compact-button is-rectangular-control'}
            >
              应用
            </button>
          </form>
          <p className={'appearance-help'}>
            允许 320–4096 像素，PNG 按此尺寸导出。
          </p>
        </section>
      ) : null}
      <section
        className={'appearance-card appearance-bounds-card'}
        hidden={appearanceTab !== 'canvas'}
      >
        <ContentBoundsPanel
          embedded={true}
          editing={contentBoundsEditing}
          onEditingChange={onContentBoundsEditingChange}
        />
      </section>

      <section
        className={'appearance-card'}
        hidden={appearanceTab !== 'canvas'}
      >
        <GlobalLabelSettingsPanel embedded={true} />
      </section>

      {!sizeLocked ? (
        <section
          className={'appearance-card'}
          hidden={appearanceTab !== 'canvas'}
        >
          <div className={'appearance-section-heading'}>
            <div>
              <strong>背景颜色</strong>
              <small>{canvas.backgroundColor.toUpperCase()}</small>
            </div>
            <HexColorField
              className={'appearance-color-picker'}
              ariaLabel={'自定义背景颜色'}
              value={canvas.backgroundColor}
              onChange={(color) =>
                dispatch({
                  type: 'background-changed',
                  color,
                  at: timestamp(),
                })
              }
            />
          </div>
        </section>
      ) : null}
    </div>
  )
}
