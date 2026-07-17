import type { GraphContentBounds } from '../domain/graph'
import { getGraphTemplate } from '../domain/templates'
import { useEditor } from '../editor/editorContext'

interface BoundsControlProps {
  id: string
  label: string
  value: number
  minimum: number
  maximum: number
  suffix: string
  onChange: (value: number) => void
}

function BoundsControl({
  id,
  label,
  value,
  minimum,
  maximum,
  suffix,
  onChange,
}: BoundsControlProps) {
  return (
    <label className={'bounds-control'} htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={'range'}
        min={minimum}
        max={maximum}
        step={1}
        value={Math.round(value)}
        aria-label={label}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output htmlFor={id}>
        {Math.round(value)}
        {suffix}
      </output>
    </label>
  )
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function rounded(value: number): number {
  return Number(value.toFixed(4))
}

export function ContentBoundsPanel({
  embedded = false,
  editing = false,
  onEditingChange,
}: {
  embedded?: boolean
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
} = {}) {
  const { state, dispatch } = useEditor()
  const bounds = state.document.canvas.contentBounds
  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top
  const template = getGraphTemplate(state.document.canvas.templateId)
  const update = (nextBounds: GraphContentBounds, group?: string): void => {
    dispatch({
      type: 'content-bounds-changed',
      bounds: nextBounds,
      ...(group ? { group } : {}),
      at: new Date().toISOString(),
    })
  }

  return (
    <div className={'bounds-panel-content'} aria-label={'标签范围面板'}>
      <div className={embedded ? 'appearance-section-heading' : 'panel-header'}>
        <div>
          {embedded ? null : <p className={'panel-eyebrow'}>CONTENT BOUNDS</p>}
          {embedded ? <strong>标签范围</strong> : <h2>标签范围</h2>}
          {embedded ? <small>控制整组气泡的位置、大小和旋转</small> : null}
        </div>
        <div className={'bounds-heading-actions'}>
          {onEditingChange ? (
            <button
              type={'button'}
              className={'compact-button' + (editing ? ' is-active' : '')}
              aria-pressed={editing}
              onClick={() => onEditingChange(!editing)}
            >
              {editing ? '隐藏调整框' : '显示调整框'}
            </button>
          ) : null}
          <button
            type={'button'}
            className={'compact-button'}
            onClick={() => update({ ...template.contentBounds })}
          >
            重置
          </button>
        </div>
      </div>
      <p className={'panel-note'}>
        控制整组气泡的位置、大小和旋转。显示调整框后可拖动框内移动整体、拖四角改变宽高、拖边框单独调整一边；青色边框不会导出。
      </p>

      <section className={'bounds-card'} aria-label={'标签范围参数'}>
        <BoundsControl
          id={'bounds-width'}
          label={'宽度'}
          value={width * 100}
          minimum={20}
          maximum={100}
          suffix={'%'}
          onChange={(percentage) => {
            const nextWidth = percentage / 100
            const center = bounds.left + width / 2
            const left = clamp(center - nextWidth / 2, 0, 1 - nextWidth)
            update(
              {
                ...bounds,
                left: rounded(left),
                right: rounded(left + nextWidth),
              },
              'width',
            )
          }}
        />
        <BoundsControl
          id={'bounds-height'}
          label={'高度'}
          value={height * 100}
          minimum={20}
          maximum={100}
          suffix={'%'}
          onChange={(percentage) => {
            const nextHeight = percentage / 100
            const center = bounds.top + height / 2
            const top = clamp(center - nextHeight / 2, 0, 1 - nextHeight)
            update(
              {
                ...bounds,
                top: rounded(top),
                bottom: rounded(top + nextHeight),
              },
              'height',
            )
          }}
        />
        <BoundsControl
          id={'bounds-x'}
          label={'X 位置'}
          value={bounds.left * 100}
          minimum={0}
          maximum={(1 - width) * 100}
          suffix={'%'}
          onChange={(percentage) => {
            const left = percentage / 100
            update(
              {
                ...bounds,
                left: rounded(left),
                right: rounded(left + width),
              },
              'x',
            )
          }}
        />
        <BoundsControl
          id={'bounds-y'}
          label={'Y 位置'}
          value={bounds.top * 100}
          minimum={0}
          maximum={(1 - height) * 100}
          suffix={'%'}
          onChange={(percentage) => {
            const top = percentage / 100
            update(
              {
                ...bounds,
                top: rounded(top),
                bottom: rounded(top + height),
              },
              'y',
            )
          }}
        />
        <BoundsControl
          id={'bounds-rotation'}
          label={'旋转'}
          value={bounds.rotation}
          minimum={-180}
          maximum={180}
          suffix={'°'}
          onChange={(rotation) => update({ ...bounds, rotation }, 'rotation')}
        />
      </section>

      <div className={'bounds-summary'}>
        <span>当前模板</span>
        <strong>{template.name}</strong>
        <small>
          X {Math.round(bounds.left * 100)} · Y {Math.round(bounds.top * 100)} ·
          W {Math.round(width * 100)} · H {Math.round(height * 100)} · R{' '}
          {Math.round(bounds.rotation)}°
        </small>
      </div>
    </div>
  )
}
