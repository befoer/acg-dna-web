import { useState, type ChangeEvent } from 'react'

import {
  DEFAULT_LABEL_SETTINGS,
  type GraphLabelSettings,
} from '../domain/graph'
import { useEditor } from '../editor/editorContext'
import { registerLocalFont } from '../fonts/fontManager'

interface GlobalLabelSettingsPanelProps {
  onBack: () => void
}

interface SliderSettingProps {
  id: string
  label: string
  value: number
  minimum: number
  maximum: number
  step: number
  display: string
  onChange: (value: number) => void
}

function SliderSetting({
  id,
  label,
  value,
  minimum,
  maximum,
  step,
  display,
  onChange,
}: SliderSettingProps) {
  return (
    <label className={'global-label-slider'} htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={'range'}
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output htmlFor={id}>{display}</output>
    </label>
  )
}

export function GlobalLabelSettingsPanel({
  onBack,
}: GlobalLabelSettingsPanelProps) {
  const { state, dispatch } = useEditor()
  const [isLoadingFont, setIsLoadingFont] = useState(false)
  const settings = state.document.canvas.labelSettings
  const update = (patch: Partial<GraphLabelSettings>, group?: string): void => {
    dispatch({
      type: 'label-settings-changed',
      patch,
      ...(group ? { group } : {}),
      at: new Date().toISOString(),
    })
  }

  const toggleOptions = [
    {
      key: 'showCategoryText' as const,
      label: '分类文字',
      checked: settings.showCategoryText,
    },
    {
      key: 'showLabelText' as const,
      label: '标签文字',
      checked: settings.showLabelText,
    },
    {
      key: 'showImages' as const,
      label: '标签图片',
      checked: settings.showImages,
    },
  ]

  const handleLocalFont = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setIsLoadingFont(true)
    dispatch({ type: 'status-changed', message: '正在载入本地字体…' })
    try {
      const font = await registerLocalFont(file)
      update({
        fontFamily: 'local',
        localFontId: font.id,
        localFontName: font.name,
      })
      dispatch({
        type: 'status-changed',
        message: font.persisted
          ? '本地字体已保存到此浏览器'
          : '字体已载入，但当前浏览器无法持久保存',
      })
    } catch (error) {
      dispatch({
        type: 'status-changed',
        message: error instanceof Error ? error.message : '本地字体加载失败',
      })
    } finally {
      setIsLoadingFont(false)
    }
  }

  return (
    <div className={'global-label-settings'} aria-label={'全局标签设置'}>
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
          <p className={'section-kicker'}>GLOBAL LABEL STYLE</p>
          <h2>全局标签设置</h2>
        </div>
        <button
          type={'button'}
          className={'compact-button'}
          onClick={() => update({ ...DEFAULT_LABEL_SETTINGS })}
        >
          重置
        </button>
      </div>
      <p className={'panel-note'}>
        设置会统一作用于三级标签，并随项目自动保存。关闭图片只影响显示，不会删除本地图片。
      </p>

      <section className={'global-settings-card'} aria-label={'标签显示'}>
        <h3>显示内容</h3>
        <div className={'global-toggle-grid'}>
          {toggleOptions.map((option) => (
            <button
              type={'button'}
              className={option.checked ? 'is-active' : ''}
              aria-pressed={option.checked}
              onClick={() => update({ [option.key]: !option.checked })}
              key={option.key}
            >
              <span aria-hidden={true}>{option.checked ? '●' : '○'}</span>
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className={'global-settings-card'} aria-label={'标签线条和填充'}>
        <h3>线条与填充</h3>
        <SliderSetting
          id={'global-category-stroke'}
          label={'分类描边'}
          value={settings.categoryStrokeWidth}
          minimum={0}
          maximum={10}
          step={0.5}
          display={settings.categoryStrokeWidth.toFixed(1)}
          onChange={(categoryStrokeWidth) =>
            update({ categoryStrokeWidth }, 'category-stroke')
          }
        />
        <SliderSetting
          id={'global-label-stroke'}
          label={'标签描边'}
          value={settings.labelStrokeWidth}
          minimum={0}
          maximum={10}
          step={0.5}
          display={settings.labelStrokeWidth.toFixed(1)}
          onChange={(labelStrokeWidth) =>
            update({ labelStrokeWidth }, 'label-stroke')
          }
        />
        <SliderSetting
          id={'global-fill-opacity'}
          label={'色块透明度'}
          value={settings.fillOpacity * 100}
          minimum={0}
          maximum={100}
          step={5}
          display={Math.round(settings.fillOpacity * 100) + '%'}
          onChange={(percentage) =>
            update({ fillOpacity: percentage / 100 }, 'fill-opacity')
          }
        />
      </section>

      <section className={'global-settings-card'} aria-label={'标签字体'}>
        <h3>字体</h3>
        <label className={'global-select-row'}>
          <span>字体</span>
          <select
            aria-label={'标签字体'}
            value={settings.fontFamily}
            onChange={(event) => {
              const value = event.currentTarget.value
              if (value === 'resource-rounded') {
                update({ fontFamily: value, fontWeight: 700 })
              } else if (value === 'alimama-fangyuan') {
                update({
                  fontFamily: value,
                  fontWeight: Math.min(700, settings.fontWeight),
                })
              } else if (value === 'local' && settings.localFontId) {
                update({ fontFamily: value })
              } else {
                update({ fontFamily: 'sans' })
              }
            }}
          >
            <option value={'sans'}>系统黑体</option>
            <option value={'resource-rounded'}>资源圆体 Bold</option>
            <option value={'alimama-fangyuan'}>阿里妈妈方圆体</option>
            {settings.localFontId ? (
              <option value={'local'}>
                本地 · {settings.localFontName ?? '已载入字体'}
              </option>
            ) : null}
          </select>
        </label>
        {settings.fontFamily === 'resource-rounded' ? (
          <p className={'global-font-note'}>资源圆体当前使用固定 Bold 字重。</p>
        ) : (
          <SliderSetting
            id={'global-font-weight'}
            label={'字重'}
            value={settings.fontWeight}
            minimum={300}
            maximum={settings.fontFamily === 'alimama-fangyuan' ? 700 : 900}
            step={100}
            display={String(settings.fontWeight)}
            onChange={(fontWeight) => update({ fontWeight }, 'font-weight')}
          />
        )}
        {settings.fontFamily === 'alimama-fangyuan' ? (
          <SliderSetting
            id={'global-font-roundness'}
            label={'圆度'}
            value={settings.fontRoundness}
            minimum={0}
            maximum={100}
            step={5}
            display={String(settings.fontRoundness) + '%'}
            onChange={(fontRoundness) =>
              update({ fontRoundness }, 'font-roundness')
            }
          />
        ) : null}
        <div className={'local-font-row'}>
          <div>
            <strong>加载本地字体</strong>
            <small>TTF、OTF、WOFF、WOFF2，最大 20 MB</small>
          </div>
          <label className={'file-button'}>
            {isLoadingFont ? '载入中…' : '选择字体'}
            <input
              type={'file'}
              accept={
                '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2'
              }
              disabled={isLoadingFont}
              onChange={(event) => void handleLocalFont(event)}
            />
          </label>
        </div>
        <p className={'global-font-note'}>
          本地字体保存在此浏览器，不上传，也不会嵌入项目导出文件；换设备后需要重新选择。
        </p>
      </section>

      <section className={'global-settings-card'} aria-label={'标签颜色设置'}>
        <h3>颜色</h3>
        <label className={'global-color-row'}>
          <span>
            <strong>统一标签颜色</strong>
            <small>关闭后继续使用各分类颜色</small>
          </span>
          <input
            type={'checkbox'}
            aria-label={'统一标签颜色'}
            checked={settings.colorOverride !== null}
            onChange={(event) =>
              update({
                colorOverride: event.currentTarget.checked
                  ? (settings.colorOverride ?? '#15B8A6')
                  : null,
              })
            }
          />
          <input
            type={'color'}
            aria-label={'标签颜色'}
            value={settings.colorOverride ?? '#15B8A6'}
            disabled={settings.colorOverride === null}
            onChange={(event) =>
              update({ colorOverride: event.currentTarget.value }, 'tag-color')
            }
          />
        </label>
        <label className={'global-color-row'}>
          <span>
            <strong>统一文字颜色</strong>
            <small>关闭后根据图片和背景自动选择</small>
          </span>
          <input
            type={'checkbox'}
            aria-label={'统一文字颜色'}
            checked={settings.textColorOverride !== null}
            onChange={(event) =>
              update({
                textColorOverride: event.currentTarget.checked
                  ? (settings.textColorOverride ?? '#242429')
                  : null,
              })
            }
          />
          <input
            type={'color'}
            aria-label={'文字颜色'}
            value={settings.textColorOverride ?? '#242429'}
            disabled={settings.textColorOverride === null}
            onChange={(event) =>
              update(
                { textColorOverride: event.currentTarget.value },
                'text-color',
              )
            }
          />
        </label>
      </section>
    </div>
  )
}
