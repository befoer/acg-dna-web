import type {
  GraphCategory,
  GraphCategoryAppearance,
  GraphCategoryFontFamily,
  GraphImageMask,
} from '../domain/graph'
import { findGraphNode, resolveCategoryAppearance } from '../domain/graph'
import { useEditor } from '../editor/editorContext'

interface CategoryAppearancePanelProps {
  categoryId: string
  onBack: () => void
}

interface CategorySliderProps {
  label: string
  value: number
  minimum: number
  maximum: number
  step: number
  display: string
  onChange: (value: number) => void
}

function CategorySlider({
  label,
  value,
  minimum,
  maximum,
  step,
  display,
  onChange,
}: CategorySliderProps) {
  return (
    <label className={'global-slider-row'}>
      <span>{label}</span>
      <input
        type={'range'}
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output>{display}</output>
    </label>
  )
}

export function CategoryAppearancePanel({
  categoryId,
  onBack,
}: CategoryAppearancePanelProps) {
  const { state, dispatch } = useEditor()
  const match = findGraphNode(state.document, categoryId)
  if (match?.kind !== 'category') {
    return (
      <div className={'global-label-settings'}>
        <button type={'button'} className={'compact-button'} onClick={onBack}>
          返回数据
        </button>
      </div>
    )
  }
  const category = match.node as GraphCategory
  const globalSettings = state.document.canvas.labelSettings
  const settings = resolveCategoryAppearance(category, globalSettings)
  const hasOverride = Boolean(category.appearance)
  const update = (patch: GraphCategoryAppearance, group?: string): void => {
    dispatch({
      type: 'category-appearance-changed',
      categoryId,
      patch,
      ...(group ? { group } : {}),
      at: new Date().toISOString(),
    })
  }
  const updateCategoryColor = (color: string): void => {
    dispatch({
      type: 'node-updated',
      nodeId: categoryId,
      patch: { color },
      at: new Date().toISOString(),
    })
  }
  const toggleOptions = [
    {
      key: 'showCategoryImage' as const,
      label: '分类图片',
      checked: settings.showCategoryImage,
      disabled: !globalSettings.showImages,
    },
    {
      key: 'showLabelImages' as const,
      label: '标签图片',
      checked: settings.showLabelImages,
      disabled: !globalSettings.showImages,
    },
    {
      key: 'showCategoryText' as const,
      label: '分类文字',
      checked: settings.showCategoryText,
      disabled: false,
    },
    {
      key: 'showLabelText' as const,
      label: '标签文字',
      checked: settings.showLabelText,
      disabled: false,
    },
  ]

  return (
    <div className={'global-label-settings'} aria-label={'分类独立设置'}>
      <div className={'global-settings-header'}>
        <button
          type={'button'}
          className={'global-settings-back'}
          aria-label={'返回数据编辑'}
          onClick={onBack}
        >
          ←
        </button>
        <div>
          <p className={'section-kicker'}>CATEGORY STYLE</p>
          <h2>{category.name || '未命名分类'}</h2>
        </div>
        <button
          type={'button'}
          className={'compact-button'}
          disabled={!hasOverride}
          onClick={() =>
            dispatch({
              type: 'category-appearance-reset',
              categoryId,
              at: new Date().toISOString(),
            })
          }
        >
          跟随全局
        </button>
      </div>
      <p className={'panel-note'}>
        只影响当前分类及其内部标签。未单独修改的项目继续跟随全局标签设置。
      </p>

      <section className={'global-settings-card'}>
        <h3>显示内容</h3>
        <div className={'global-toggle-grid'}>
          {toggleOptions.map((option) => (
            <button
              type={'button'}
              className={option.checked ? 'is-active' : ''}
              aria-pressed={option.checked}
              disabled={option.disabled}
              onClick={() => update({ [option.key]: !option.checked })}
              key={option.key}
            >
              <span aria-hidden={true}>{option.checked ? '●' : '○'}</span>
              {option.label}
            </button>
          ))}
        </div>
        {!globalSettings.showImages ? (
          <p className={'global-font-note'}>
            全局“标签图片”已关闭，分类图片设置暂时不可用。
          </p>
        ) : null}
      </section>

      <section className={'global-settings-card'}>
        <h3>布局与线条</h3>
        <CategorySlider
          label={'填充比例'}
          value={settings.fillFactor * 100}
          minimum={50}
          maximum={150}
          step={5}
          display={Math.round(settings.fillFactor * 100) + '%'}
          onChange={(value) =>
            update({ fillFactor: value / 100 }, 'fill-factor')
          }
        />
        <CategorySlider
          label={'分类描边'}
          value={settings.categoryStrokeWidth}
          minimum={0}
          maximum={10}
          step={0.5}
          display={settings.categoryStrokeWidth.toFixed(1)}
          onChange={(value) =>
            update({ categoryStrokeWidth: value }, 'category-stroke')
          }
        />
        <CategorySlider
          label={'标签描边'}
          value={settings.labelStrokeWidth}
          minimum={0}
          maximum={10}
          step={0.5}
          display={settings.labelStrokeWidth.toFixed(1)}
          onChange={(value) =>
            update({ labelStrokeWidth: value }, 'label-stroke')
          }
        />
      </section>

      <section className={'global-settings-card'}>
        <h3>字体</h3>
        <label className={'global-select-row'}>
          <span>字体</span>
          <select
            aria-label={'分类字体'}
            value={category.appearance?.fontFamily ?? 'inherit'}
            onChange={(event) => {
              const selected = event.currentTarget.value
              if (selected === 'inherit') {
                update({ fontFamily: undefined })
                return
              }
              const value = selected as GraphCategoryFontFamily
              update({
                fontFamily: value,
                ...(value === 'resource-rounded' ? { fontWeight: 700 } : {}),
                ...(value === 'alimama-fangyuan' && settings.fontWeight > 700
                  ? { fontWeight: 700 }
                  : {}),
              })
            }}
          >
            <option value={'inherit'}>跟随全局</option>
            <option value={'sans'}>系统黑体</option>
            <option value={'resource-rounded'}>资源圆体 Bold</option>
            <option value={'alimama-fangyuan'}>阿里妈妈方圆体</option>
          </select>
        </label>
        {settings.fontFamily === 'resource-rounded' ? (
          <p className={'global-font-note'}>资源圆体使用固定 Bold 字重。</p>
        ) : (
          <CategorySlider
            label={'字重'}
            value={settings.fontWeight}
            minimum={300}
            maximum={settings.fontFamily === 'alimama-fangyuan' ? 700 : 900}
            step={100}
            display={String(settings.fontWeight)}
            onChange={(value) => update({ fontWeight: value }, 'font-weight')}
          />
        )}
        {settings.fontFamily === 'alimama-fangyuan' ? (
          <CategorySlider
            label={'圆度'}
            value={settings.fontRoundness}
            minimum={0}
            maximum={100}
            step={5}
            display={Math.round(settings.fontRoundness) + '%'}
            onChange={(value) =>
              update({ fontRoundness: value }, 'font-roundness')
            }
          />
        ) : null}
      </section>

      <section className={'global-settings-card'}>
        <h3>颜色</h3>
        <label className={'global-color-row'}>
          <span>
            <strong>分类与标签颜色</strong>
            <small>{category.color.toUpperCase()}</small>
          </span>
          <span />
          <input
            type={'color'}
            aria-label={'分类与标签颜色'}
            value={category.color}
            onChange={(event) => updateCategoryColor(event.currentTarget.value)}
          />
        </label>
        <label className={'global-color-row'}>
          <span>
            <strong>独立文字颜色</strong>
            <small>关闭后跟随全局或自动选择</small>
          </span>
          <input
            type={'checkbox'}
            aria-label={'独立文字颜色'}
            checked={category.appearance?.textColorOverride !== undefined}
            onChange={(event) =>
              update({
                textColorOverride: event.currentTarget.checked
                  ? (settings.textColorOverride ?? '#242429')
                  : undefined,
              })
            }
          />
          <input
            type={'color'}
            aria-label={'分类文字颜色'}
            value={settings.textColorOverride ?? '#242429'}
            disabled={category.appearance?.textColorOverride === undefined}
            onChange={(event) =>
              update(
                { textColorOverride: event.currentTarget.value },
                'text-color',
              )
            }
          />
        </label>
      </section>

      <section className={'global-settings-card'}>
        <h3>图片遮罩</h3>
        <label className={'global-select-row'}>
          <span>颜色</span>
          <select
            aria-label={'图片遮罩颜色'}
            value={settings.imageMask}
            onChange={(event) =>
              update({ imageMask: event.currentTarget.value as GraphImageMask })
            }
          >
            <option value={'none'}>无遮罩</option>
            <option value={'black'}>黑色</option>
            <option value={'white'}>白色</option>
            <option value={'category'}>分类色</option>
          </select>
        </label>
        {settings.imageMask !== 'none' ? (
          <CategorySlider
            label={'透明度'}
            value={settings.imageMaskOpacity * 100}
            minimum={0}
            maximum={100}
            step={5}
            display={Math.round(settings.imageMaskOpacity * 100) + '%'}
            onChange={(value) =>
              update({ imageMaskOpacity: value / 100 }, 'mask-opacity')
            }
          />
        ) : null}
      </section>
    </div>
  )
}
