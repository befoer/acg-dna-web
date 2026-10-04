import { useState, type ChangeEvent } from 'react'

import {
  createEntityId,
  type GraphProfileCustomText,
  type GraphProfileLabel,
  type GraphProfileLabelType,
  type GraphProfileSettings,
} from '../domain/graph'
import {
  getProfileSubTemplate,
  getProfileSubTemplates,
  getProfileTemplatePreviewUrl,
  isNicknameProfileSlot,
  maxProfileLabelCount,
  type ProfileSubTemplate,
} from '../domain/profileTemplates'
import { useEditor } from '../editor/editorContext'
import { HexColorField } from './HexColorField'
import { LocalImageEditor } from './LocalImageEditor'
import eyeIconUrl from '../assets/eye.svg'

function labelTypeForSlot(type: string): GraphProfileLabelType | null {
  const normalized = type.toLowerCase()
  const number = normalized.startsWith('label')
    ? Number.parseInt(normalized.slice(5), 10)
    : type.startsWith('标签')
      ? Number.parseInt(type.slice(2), 10)
      : Number.NaN
  if (number === 1) return 'location'
  if (number === 2) return 'job'
  if (number === 3) return 'mbti'
  if (number === 4) return 'expansion'
  if (
    normalized === 'location' ||
    normalized === 'job' ||
    normalized === 'mbti' ||
    normalized === 'expansion'
  ) {
    return normalized
  }
  return null
}

function orderedLabels(
  profile: GraphProfileSettings,
  template: ProfileSubTemplate,
): GraphProfileLabel[] {
  return template.labelSlots
    .filter((slot) => !isNicknameProfileSlot(slot.type))
    .map((slot) => labelTypeForSlot(slot.type))
    .filter((type): type is GraphProfileLabelType => type !== null)
    .map((type) => profile.labels.find((label) => label.type === type))
    .filter((label): label is GraphProfileLabel => Boolean(label))
}

interface VisibilityButtonProps {
  visible: boolean
  label: string
  onClick: () => void
}

function VisibilityButton({ visible, label, onClick }: VisibilityButtonProps) {
  return (
    <button
      type={'button'}
      className={'profile-icon-button' + (visible ? ' is-active' : '')}
      aria-label={label}
      aria-pressed={visible}
      onClick={onClick}
    >
      <img src={eyeIconUrl} alt={''} aria-hidden={true} />
    </button>
  )
}

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  display: string
  onChange: (value: number) => void
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
}: SliderRowProps) {
  return (
    <label className={'profile-slider-row'}>
      <span>{label}</span>
      <input
        type={'range'}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output>{display}</output>
    </label>
  )
}

interface CustomTextCardProps {
  text: GraphProfileCustomText
  expanded: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<GraphProfileCustomText>, group?: string) => void
  onDelete: () => void
}

function CustomTextCard({
  text,
  expanded,
  onSelect,
  onUpdate,
  onDelete,
}: CustomTextCardProps) {
  const supportsWeight = text.fontFamily !== 'resource-rounded'
  return (
    <article
      className={'profile-custom-text-card' + (expanded ? ' is-expanded' : '')}
    >
      <div className={'profile-custom-text-heading'}>
        <VisibilityButton
          visible={text.visible}
          label={text.visible ? '隐藏自定义文字' : '显示自定义文字'}
          onClick={() => onUpdate({ visible: !text.visible })}
        />
        <button
          type={'button'}
          className={'profile-icon-button'}
          aria-label={expanded ? '收起文字设置' : '展开文字设置'}
          aria-expanded={expanded}
          onClick={onSelect}
        >
          ≡
        </button>
        <input
          type={'text'}
          maxLength={100}
          aria-label={'自定义文字内容'}
          placeholder={'输入文字'}
          value={text.text}
          onFocus={() => {
            if (!expanded) onSelect()
          }}
          onChange={(event) =>
            onUpdate({ text: event.currentTarget.value }, 'content')
          }
        />
        <button
          type={'button'}
          className={'profile-icon-button is-danger'}
          aria-label={'删除自定义文字'}
          onClick={onDelete}
        >
          ×
        </button>
      </div>

      {expanded ? (
        <div className={'profile-custom-text-settings'}>
          <p className={'profile-drag-hint'}>
            拖动文字可调整位置，拖动四角可调整字号
          </p>
          <label className={'profile-select-row'}>
            <span>字体</span>
            <select
              aria-label={'自定义文字字体'}
              value={text.fontFamily}
              onChange={(event) =>
                onUpdate({
                  fontFamily: event.currentTarget
                    .value as GraphProfileCustomText['fontFamily'],
                })
              }
            >
              <option value={'sans'}>系统黑体</option>
              <option value={'resource-rounded'}>资源圆体 Bold</option>
            </select>
          </label>
          <SliderRow
            label={'字号'}
            value={text.fontSize}
            min={10}
            max={100}
            display={String(Math.round(text.fontSize))}
            onChange={(value) => onUpdate({ fontSize: value }, 'font-size')}
          />
          {supportsWeight ? (
            <SliderRow
              label={'粗细'}
              value={text.fontWeight}
              min={250}
              max={900}
              step={50}
              display={String(Math.round(text.fontWeight))}
              onChange={(value) =>
                onUpdate({ fontWeight: value }, 'font-weight')
              }
            />
          ) : null}
          <SliderRow
            label={'旋转'}
            value={text.rotation}
            min={-180}
            max={180}
            display={Math.round(text.rotation) + '°'}
            onChange={(value) => onUpdate({ rotation: value }, 'rotation')}
          />
          <SliderRow
            label={'宽度'}
            value={text.maxWidth * 100}
            min={10}
            max={100}
            display={Math.round(text.maxWidth * 100) + '%'}
            onChange={(value) =>
              onUpdate({ maxWidth: value / 100 }, 'max-width')
            }
          />
          <div className={'profile-color-row'}>
            <span>颜色</span>
            <HexColorField
              ariaLabel={'自定义文字颜色'}
              value={text.color}
              onChange={(color) => onUpdate({ color }, 'color')}
            />
          </div>
          <SliderRow
            label={'描边'}
            value={text.strokeWidth}
            min={0}
            max={10}
            display={String(Math.round(text.strokeWidth))}
            onChange={(value) =>
              onUpdate({ strokeWidth: value }, 'stroke-width')
            }
          />
          <div className={'profile-color-row'}>
            <span>描边色</span>
            <HexColorField
              ariaLabel={'自定义文字描边颜色'}
              value={text.strokeColor}
              onChange={(strokeColor) =>
                onUpdate({ strokeColor }, 'stroke-color')
              }
            />
          </div>
        </div>
      ) : null}
    </article>
  )
}

export function ProfilePanel() {
  const { state, dispatch, attachProfileAvatar, removeProfileAvatar } =
    useEditor()
  const profile = state.document.profile
  const supportsProfileIdentity = state.document.canvas.templateId !== 'custom'
  const avatar = profile.avatarAssetId
    ? state.assets[profile.avatarAssetId]
    : undefined
  const subTemplates = getProfileSubTemplates(state.document.canvas.templateId)
  const currentTemplate = profile.subTemplateId
    ? getProfileSubTemplate(profile.subTemplateId)
    : undefined
  const [imageEditorAssetId, setImageEditorAssetId] = useState<string | null>(
    null,
  )
  const editorAvatar = imageEditorAssetId
    ? state.assets[imageEditorAssetId]
    : undefined

  const update = (
    patch: Partial<GraphProfileSettings>,
    group?: string,
  ): void => {
    dispatch({
      type: 'profile-settings-changed',
      patch,
      ...(group ? { group } : {}),
      at: new Date().toISOString(),
    })
  }

  const handleAvatar = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) {
      void attachProfileAvatar(file).then((assetId) => {
        if (assetId) setImageEditorAssetId(assetId)
      })
    }
  }

  const selectTemplate = (template: ProfileSubTemplate): void => {
    const selecting = profile.subTemplateId !== template.id
    update({
      subTemplateId: selecting ? template.id : null,
      ...(selecting &&
      template.textSlots.length > 0 &&
      !profile.textBlockContent
        ? { textBlockContent: '请输入文本' }
        : {}),
    })
  }

  const labels = currentTemplate ? orderedLabels(profile, currentTemplate) : []
  const maximumLabels = currentTemplate
    ? maxProfileLabelCount(currentTemplate)
    : 0
  const visibleLabelCount = Math.min(profile.visibleLabelCount, maximumLabels)

  const addLabel = (): void => {
    if (visibleLabelCount >= maximumLabels) return
    const nextIndex = visibleLabelCount
    const target = labels[nextIndex]
    update({
      visibleLabelCount: nextIndex + 1,
      labels: target
        ? profile.labels.map((label) =>
            label.id === target.id ? { ...label, content: '' } : label,
          )
        : profile.labels,
    })
  }

  const deleteLabel = (index: number): void => {
    const contents = labels
      .slice(0, visibleLabelCount)
      .map((label) => label.content)
    contents.splice(index, 1)
    contents.push('')
    const replacements = new Map(
      labels.map((label, labelIndex) => [
        label.id,
        contents[labelIndex] ?? label.content,
      ]),
    )
    update({
      labels: profile.labels.map((label) => ({
        ...label,
        content: replacements.get(label.id) ?? label.content,
      })),
      visibleLabelCount: Math.max(0, visibleLabelCount - 1),
    })
  }

  const addCustomText = (): void => {
    const text: GraphProfileCustomText = {
      id: createEntityId('custom-text'),
      text: '自定义文本',
      x: 0.5,
      y: 0.2,
      fontSize: 40,
      color: '#333333',
      rotation: 0,
      fontWeight: 500,
      fontFamily: 'sans',
      maxWidth: 0.5,
      maxHeight: 0.3,
      visible: true,
      strokeWidth: 0,
      strokeColor: '#FFFFFF',
    }
    update({ customTexts: [text, ...profile.customTexts] })
    dispatch({ type: 'custom-text-selected', textId: text.id })
  }

  const updateCustomText = (
    id: string,
    patch: Partial<GraphProfileCustomText>,
    group?: string,
  ): void => {
    update(
      {
        customTexts: profile.customTexts.map((text) =>
          text.id === id ? { ...text, ...patch } : text,
        ),
      },
      group ? 'custom-text:' + id + ':' + group : undefined,
    )
  }

  return (
    <>
      <div className={'profile-panel-content'} aria-label={'资料面板'}>
        <div className={'panel-header'}>
          <div>
            <h2>资料</h2>
          </div>
        </div>

        <section className={'profile-section'} aria-label={'资料模板'}>
          <div className={'profile-section-title'}>
            <span className={'profile-section-chevron'} aria-hidden={true} />
            <h3>模板</h3>
            <small>· {subTemplates.length}</small>
          </div>
          {subTemplates.length > 0 ? (
            <div className={'profile-template-list'}>
              {subTemplates.map((template) => {
                const selected = profile.subTemplateId === template.id
                return (
                  <button
                    type={'button'}
                    key={template.id}
                    className={
                      'profile-template-card' + (selected ? ' is-selected' : '')
                    }
                    aria-pressed={selected}
                    onClick={() => selectTemplate(template)}
                  >
                    <span className={'profile-template-preview'}>
                      <img
                        src={getProfileTemplatePreviewUrl(template.id)}
                        alt={''}
                      />
                      {selected ? <b aria-hidden={true}>✓</b> : null}
                    </span>
                    <span>{template.name}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className={'profile-empty-note'}>
              经典画布没有资料子模板，请先选择“可爱日记”或“工业风”。
            </p>
          )}
        </section>

        {supportsProfileIdentity ? (
          <section className={'profile-section'} aria-label={'头像与昵称'}>
            <div className={'profile-section-title'}>
              <span className={'profile-section-chevron'} aria-hidden={true} />
              <h3>头像与昵称</h3>
            </div>
            <div className={'profile-avatar-editor'}>
              <VisibilityButton
                visible={profile.avatarVisible}
                label={profile.avatarVisible ? '隐藏头像' : '显示头像'}
                onClick={() =>
                  update({ avatarVisible: !profile.avatarVisible })
                }
              />
              <label
                className={'profile-avatar-preview'}
                title={'从本地选择头像'}
              >
                {avatar ? (
                  <img src={avatar.objectUrl} alt={''} />
                ) : (
                  <span>＋</span>
                )}
                <input
                  type={'file'}
                  accept={'image/png,image/jpeg,image/webp,image/avif'}
                  aria-label={'选择资料头像'}
                  onChange={handleAvatar}
                />
              </label>
              <div className={'profile-gender-selector'} aria-label={'性别'}>
                {[
                  ['male', '男'],
                  ['female', '女'],
                  ['none', '无'],
                ].map(([gender, label]) => (
                  <button
                    type={'button'}
                    key={gender}
                    className={profile.gender === gender ? 'is-selected' : ''}
                    aria-label={'性别：' + label}
                    aria-pressed={profile.gender === gender}
                    onClick={() =>
                      update({
                        gender: gender as GraphProfileSettings['gender'],
                      })
                    }
                  >
                    <span
                      className={'profile-gender-icon gender-' + gender}
                      aria-hidden={true}
                    />
                  </button>
                ))}
              </div>
              {avatar ? (
                <button
                  type={'button'}
                  className={'profile-remove-avatar'}
                  onClick={() => setImageEditorAssetId(avatar.id)}
                >
                  调整
                </button>
              ) : null}
              {avatar ? (
                <button
                  type={'button'}
                  className={'profile-remove-avatar'}
                  onClick={removeProfileAvatar}
                >
                  移除
                </button>
              ) : null}
            </div>
            <div className={'profile-nickname-row'}>
              <VisibilityButton
                visible={profile.nicknameVisible}
                label={profile.nicknameVisible ? '隐藏昵称' : '显示昵称'}
                onClick={() =>
                  update({ nicknameVisible: !profile.nicknameVisible })
                }
              />
              <input
                type={'text'}
                aria-label={'资料昵称'}
                maxLength={12}
                placeholder={'输入昵称'}
                value={profile.nickname}
                onChange={(event) =>
                  update({ nickname: event.currentTarget.value }, 'nickname')
                }
                onBlur={(event) => {
                  if (!event.currentTarget.value.trim()) {
                    update({ nickname: '我的昵称' })
                  }
                }}
              />
              <small>{profile.nickname.length}/12</small>
            </div>
          </section>
        ) : null}

        {currentTemplate ? (
          <section className={'profile-section'} aria-label={'资料标签'}>
            <div className={'profile-section-title'}>
              <span className={'profile-section-chevron'} aria-hidden={true} />
              <h3>标签</h3>
              <small>
                {visibleLabelCount}/{maximumLabels}
              </small>
              <button
                type={'button'}
                className={'profile-add-button'}
                aria-label={'增加资料标签'}
                disabled={visibleLabelCount >= maximumLabels}
                onClick={addLabel}
              >
                ＋
              </button>
            </div>
            <div className={'profile-label-list'}>
              {labels.slice(0, visibleLabelCount).map((label, index) => (
                <label className={'profile-label-row'} key={label.id}>
                  <span>标签 {index + 1}</span>
                  <input
                    type={'text'}
                    maxLength={8}
                    aria-label={'资料标签 ' + (index + 1)}
                    placeholder={'输入标签'}
                    value={label.content}
                    onChange={(event) =>
                      update(
                        {
                          labels: profile.labels.map((candidate) =>
                            candidate.id === label.id
                              ? {
                                  ...candidate,
                                  content: event.currentTarget.value,
                                }
                              : candidate,
                          ),
                        },
                        'label:' + label.id,
                      )
                    }
                  />
                  <small>{label.content.length}/8</small>
                  <button
                    type={'button'}
                    aria-label={'删除资料标签 ' + (index + 1)}
                    onClick={() => deleteLabel(index)}
                  >
                    ×
                  </button>
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {currentTemplate?.textSlots.length ? (
          <section className={'profile-section'} aria-label={'资料文本块'}>
            <div className={'profile-section-title'}>
              <VisibilityButton
                visible={profile.textBlockVisible}
                label={
                  profile.textBlockVisible ? '隐藏资料文本' : '显示资料文本'
                }
                onClick={() =>
                  update({ textBlockVisible: !profile.textBlockVisible })
                }
              />
              <h3>文本</h3>
            </div>
            <textarea
              aria-label={'资料文本内容'}
              maxLength={80}
              rows={5}
              placeholder={'输入文本内容'}
              value={profile.textBlockContent}
              onChange={(event) =>
                update(
                  { textBlockContent: event.currentTarget.value },
                  'text-block',
                )
              }
            />
            <small className={'profile-character-count'}>
              {profile.textBlockContent.length}/80
            </small>
          </section>
        ) : null}

        <section className={'profile-section'} aria-label={'自定义文字'}>
          <div className={'profile-section-title'}>
            <span className={'profile-section-chevron'} aria-hidden={true} />
            <h3>自定义文字</h3>
            <small>画布中可拖动</small>
          </div>
          <div className={'profile-custom-text-list'}>
            {profile.customTexts.map((text) => (
              <CustomTextCard
                key={text.id}
                text={text}
                expanded={state.editingCustomTextId === text.id}
                onSelect={() =>
                  dispatch({
                    type: 'custom-text-selected',
                    textId:
                      state.editingCustomTextId === text.id ? null : text.id,
                  })
                }
                onUpdate={(patch, group) =>
                  updateCustomText(text.id, patch, group)
                }
                onDelete={() =>
                  update({
                    customTexts: profile.customTexts.filter(
                      (candidate) => candidate.id !== text.id,
                    ),
                  })
                }
              />
            ))}
          </div>
          <button
            type={'button'}
            className={'profile-add-text-button'}
            onClick={addCustomText}
          >
            ＋ 添加文字
          </button>
        </section>
      </div>
      {editorAvatar && editorAvatar.id === profile.avatarAssetId ? (
        <LocalImageEditor
          asset={editorAvatar}
          initialTransform={profile.avatarTransform}
          cropShape={
            currentTemplate?.avatarShape === 'square' ? 'square' : 'circle'
          }
          title={'调整资料头像'}
          onCancel={() => setImageEditorAssetId(null)}
          onApply={(avatarTransform) => {
            update({ avatarTransform })
            setImageEditorAssetId(null)
          }}
        />
      ) : null}
    </>
  )
}
