import {
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
  decorationPresetLayerId,
  resolveDecorationLayerOrder,
  type GraphDecorationFrame,
  type GraphDecorationSettings,
} from '../domain/graph'
import { useEditor } from '../editor/editorContext'
import { ContentBoundsPanel } from './ContentBoundsPanel'

const CANVAS_PRESETS = [
  { id: 'classic', name: '经典竖版', width: 1380, height: 2000 },
  { id: 'portrait', name: '竖版 3:4', width: 1500, height: 2000 },
  { id: 'story', name: '长图 9:16', width: 1125, height: 2000 },
  { id: 'square', name: '正方形', width: 1600, height: 1600 },
  { id: 'landscape', name: '横版 4:3', width: 2000, height: 1500 },
] as const

const BACKGROUND_COLORS = [
  '#F6F2EC',
  '#FFFFFF',
  '#F4E9EF',
  '#E8F2F0',
  '#E9EDF6',
  '#25252B',
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
}

export function AppearancePanel({
  contentBoundsEditing = false,
  onContentBoundsEditingChange,
}: AppearancePanelProps = {}) {
  const { state, dispatch, attachDecorationImage, removeDecorationImage } =
    useEditor()
  const canvas = state.document.canvas
  const labels = canvas.labelSettings
  const sizeLocked = canvas.templateId !== 'custom'
  const decoration = state.document.decoration
  const [decorationFilter, setDecorationFilter] = useState<
    'all' | 'element' | 'background'
  >('all')
  const [appearanceTab, setAppearanceTab] = useState<
    'decoration' | 'layers' | 'canvas'
  >('decoration')
  const selectedDecorationImage = decoration.images.find(
    (image) => image.id === state.editingDecorationImageId,
  )
  const selectedFrame = decoration.frames.find(
    (frame) => frame.id === state.editingDecorationFrameId,
  )
  const resolvedLayerOrder = resolveDecorationLayerOrder(
    decoration,
    state.document.profile.customTexts.map((text) => text.id),
  )
  const layerDragRef = useRef<string | null>(null)
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null)

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

  const updateStroke = (
    patch: { categoryStrokeWidth?: number; labelStrokeWidth?: number },
    group: string,
  ) => {
    dispatch({
      type: 'label-settings-changed',
      patch,
      group,
      at: timestamp(),
    })
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
          <p className={'panel-eyebrow'}>CANVAS APPEARANCE</p>
          <h2>外观</h2>
        </div>
        <span className={'panel-count'}>
          {canvas.width} × {canvas.height}
        </span>
      </div>
      <p className={'panel-note'}>
        APP 装饰素材、背景图案、矩形、画布和标签范围统一在这里调整。
      </p>

      <div
        className={'appearance-tab-list'}
        role={'tablist'}
        aria-label={'外观设置分类'}
      >
        {(
          [
            ['decoration', '装饰'],
            ['layers', '图层'],
            ['canvas', '画布'],
          ] as const
        ).map(([id, label]) => (
          <button
            type={'button'}
            role={'tab'}
            aria-selected={appearanceTab === id}
            className={appearanceTab === id ? 'is-selected' : ''}
            onClick={() => {
              setAppearanceTab(id)
              if (id !== 'canvas') onContentBoundsEditingChange?.(false)
            }}
            key={id}
          >
            {label}
            {id === 'layers' ? (
              <small>{resolvedLayerOrder.length}</small>
            ) : null}
          </button>
        ))}
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
            <div className={'decoration-filter'} aria-label={'装饰筛选'}>
              {(
                [
                  ['all', '全部'],
                  ['element', '元素'],
                  ['background', '背景'],
                ] as const
              ).map(([id, label]) => (
                <button
                  type={'button'}
                  className={decorationFilter === id ? 'is-selected' : ''}
                  aria-pressed={decorationFilter === id}
                  onClick={() => setDecorationFilter(id)}
                  key={id}
                >
                  {label}
                </button>
              ))}
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
                className={decoration.pattern ? 'is-selected' : ''}
                aria-pressed={Boolean(decoration.pattern)}
                onClick={() =>
                  updateDecoration({
                    pattern: decoration.pattern
                      ? null
                      : { ...DEFAULT_DECORATION_PATTERN },
                  })
                }
              >
                <span
                  className={'decoration-pattern-preview'}
                  style={
                    decoration.pattern
                      ? {
                          backgroundColor: decoration.pattern.backgroundColor,
                          color: decoration.pattern.foregroundColor,
                        }
                      : undefined
                  }
                />
                <small>自定义图案</small>
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

          {decoration.pattern ? (
            <div className={'decoration-settings-block'}>
              <div className={'appearance-section-heading'}>
                <strong>自定义背景图案</strong>
                <label className={'profile-visibility-toggle'}>
                  <input
                    type={'checkbox'}
                    checked={decoration.pattern.visible}
                    onChange={(event) =>
                      updateDecoration({
                        pattern: {
                          ...decoration.pattern!,
                          visible: event.currentTarget.checked,
                        },
                      })
                    }
                  />
                  <span>{decoration.pattern.visible ? '显示' : '隐藏'}</span>
                </label>
              </div>
              <label className={'appearance-select'}>
                <span>图案类型</span>
                <select
                  value={decoration.pattern.type}
                  onChange={(event) =>
                    updateDecoration({
                      pattern: {
                        ...decoration.pattern!,
                        type:
                          event.currentTarget.value === 'checker'
                            ? 'checker'
                            : event.currentTarget.value === 'grid'
                              ? 'grid'
                              : 'dots',
                      },
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
                  value={decoration.pattern.size}
                  onChange={(event) =>
                    updateDecoration(
                      {
                        pattern: {
                          ...decoration.pattern!,
                          size: Number(event.currentTarget.value),
                        },
                      },
                      'pattern-size',
                    )
                  }
                />
                <output>{Math.round(decoration.pattern.size)}px</output>
              </label>
              <label className={'appearance-slider'}>
                <span>旋转</span>
                <input
                  type={'range'}
                  min={0}
                  max={180}
                  value={decoration.pattern.rotation}
                  onChange={(event) =>
                    updateDecoration(
                      {
                        pattern: {
                          ...decoration.pattern!,
                          rotation: Number(event.currentTarget.value),
                        },
                      },
                      'pattern-rotation',
                    )
                  }
                />
                <output>{Math.round(decoration.pattern.rotation)}°</output>
              </label>
              {decoration.pattern.type !== 'checker' ? (
                <label className={'appearance-slider'}>
                  <span>粗细</span>
                  <input
                    type={'range'}
                    min={10}
                    max={100}
                    value={decoration.pattern.weight * 100}
                    onChange={(event) =>
                      updateDecoration(
                        {
                          pattern: {
                            ...decoration.pattern!,
                            weight: Number(event.currentTarget.value) / 100,
                          },
                        },
                        'pattern-weight',
                      )
                    }
                  />
                  <output>
                    {Math.round(decoration.pattern.weight * 100)}%
                  </output>
                </label>
              ) : null}
              <div className={'decoration-color-row'}>
                <label>
                  <span>背景颜色</span>
                  <input
                    type={'color'}
                    value={decoration.pattern.backgroundColor}
                    onChange={(event) =>
                      updateDecoration({
                        pattern: {
                          ...decoration.pattern!,
                          backgroundColor: event.currentTarget.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <span>图案颜色</span>
                  <input
                    type={'color'}
                    value={decoration.pattern.foregroundColor}
                    onChange={(event) =>
                      updateDecoration({
                        pattern: {
                          ...decoration.pattern!,
                          foregroundColor: event.currentTarget.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
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
                <label>
                  <span>填充颜色</span>
                  <input
                    type={'color'}
                    value={selectedFrame.fillColor}
                    onChange={(event) =>
                      updateSelectedFrame({
                        fillColor: event.currentTarget.value,
                      })
                    }
                  />
                </label>
                <label>
                  <span>描边颜色</span>
                  <input
                    type={'color'}
                    value={selectedFrame.strokeColor}
                    onChange={(event) =>
                      updateSelectedFrame({
                        strokeColor: event.currentTarget.value,
                      })
                    }
                  />
                </label>
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
          hidden={appearanceTab !== 'layers'}
        >
          <div className={'appearance-section-heading'}>
            <div>
              <strong>图层</strong>
              <small>列表从上到下对应画布从前到后</small>
            </div>
            <span className={'panel-count'}>{resolvedLayerOrder.length}</span>
          </div>
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
              const selected =
                state.editingDecorationImageId !== null &&
                layerId ===
                  decorationImageLayerId(state.editingDecorationImageId)
                  ? true
                  : state.editingDecorationFrameId !== null &&
                      layerId ===
                        decorationFrameLayerId(state.editingDecorationFrameId)
                    ? true
                    : textId !== null && textId === state.editingCustomTextId
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
                    aria-label={'拖动或使用方向键排序 ' + layerName(layerId)}
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
                      (hidden ? '显示图层 ' : '隐藏图层 ') + layerName(layerId)
                    }
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleLayerVisibility(layerId)
                    }}
                  >
                    {hidden ? '○' : '●'}
                  </button>
                  <span>
                    <strong>{layerName(layerId)}</strong>
                    <small>{isData ? '数据' : textId ? '文字' : '装饰'}</small>
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
                  {decoration.templateBackgroundVisible ? '●' : '○'}
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
        </div>
      </section>

      <section
        className={'appearance-card'}
        hidden={appearanceTab !== 'canvas'}
      >
        <div className={'appearance-section-heading'}>
          <div>
            <strong>画布比例</strong>
            <small>
              {sizeLocked
                ? '当前模板已锁定画布比例'
                : '选择常用尺寸或输入自定义像素'}
            </small>
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
                disabled={sizeLocked}
                onClick={() => resizeCanvas(preset.width, preset.height)}
                key={preset.id}
              >
                <span
                  className={'canvas-preset-shape'}
                  style={{ aspectRatio: preset.width + ' / ' + preset.height }}
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
              disabled={sizeLocked}
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
              disabled={sizeLocked}
            />
          </label>
          <button
            type={'submit'}
            className={'compact-button'}
            disabled={sizeLocked}
          >
            应用
          </button>
        </form>
        <p className={'appearance-help'}>
          {sizeLocked
            ? '请在模板面板选择“自定义”后调整画布尺寸。'
            : '允许 320–4096 像素，PNG 按此尺寸导出。'}
        </p>
      </section>
      <section
        className={'appearance-card'}
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
        <div className={'appearance-section-heading'}>
          <div>
            <strong>背景颜色</strong>
            <small>{canvas.backgroundColor.toUpperCase()}</small>
          </div>
          <label className={'appearance-color-picker'}>
            <span className={'sr-only'}>自定义背景颜色</span>
            <input
              type={'color'}
              value={canvas.backgroundColor}
              onChange={(event) =>
                dispatch({
                  type: 'background-changed',
                  color: event.currentTarget.value,
                  at: timestamp(),
                })
              }
            />
          </label>
        </div>
        <div className={'background-swatch-grid'}>
          {BACKGROUND_COLORS.map((color) => (
            <button
              type={'button'}
              aria-label={'背景颜色 ' + color}
              aria-pressed={canvas.backgroundColor.toUpperCase() === color}
              className={
                canvas.backgroundColor.toUpperCase() === color
                  ? 'is-selected'
                  : ''
              }
              style={{ backgroundColor: color }}
              onClick={() =>
                dispatch({
                  type: 'background-changed',
                  color,
                  at: timestamp(),
                })
              }
              key={color}
            />
          ))}
        </div>
      </section>

      <section
        className={'appearance-card'}
        hidden={appearanceTab !== 'canvas'}
      >
        <div className={'appearance-section-heading'}>
          <div>
            <strong>基础描边</strong>
            <small>与全局标签设置同步</small>
          </div>
        </div>
        <label className={'appearance-slider'}>
          <span>分类</span>
          <input
            type={'range'}
            min={0}
            max={8}
            step={0.5}
            value={labels.categoryStrokeWidth}
            onChange={(event) =>
              updateStroke(
                { categoryStrokeWidth: Number(event.currentTarget.value) },
                'appearance-category-stroke',
              )
            }
          />
          <output>{labels.categoryStrokeWidth.toFixed(1)}</output>
        </label>
        <label className={'appearance-slider'}>
          <span>标签</span>
          <input
            type={'range'}
            min={0}
            max={8}
            step={0.5}
            value={labels.labelStrokeWidth}
            onChange={(event) =>
              updateStroke(
                { labelStrokeWidth: Number(event.currentTarget.value) },
                'appearance-label-stroke',
              )
            }
          />
          <output>{labels.labelStrokeWidth.toFixed(1)}</output>
        </label>
      </section>
    </div>
  )
}
