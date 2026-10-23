import { useEffect, useMemo, useRef, useState } from 'react'

import {
  createAttribute,
  createCategory,
  DEFAULT_IMAGE_TRANSFORM,
} from '../domain/graph'
import { useEditor } from '../editor/editorContext'
import {
  clearOshiImportParam,
  isAllowedOshiOrigin,
  isOshiImportRequest,
  OSHI_ALLOWED_ORIGINS,
  OSHI_IMPORTED,
  OSHI_PROTOCOL_VERSION,
  OSHI_READY,
  oshiImageFile,
  parseOshiMessage,
  type OshiCharacter,
} from '../integration/oshiImport'

const NEW_CATEGORY = '__new__'
const NEW_CATEGORY_NAME = '推日角色'
// 角色头像顶部定焦（与 Bangumi 角色图一致），避免脸被裁掉
const TOP_FOCUS = { ...DEFAULT_IMAGE_TRANSFORM, offsetY: 1 }
const timestamp = () => new Date().toISOString()
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 30))

/**
 * 接收「推日」发来的角色：确认后加到所选分类（默认新建「推日角色」），
 * 有头像的一并作为节点图片保存到本地。重名的属性会跳过。
 */
export function OshiImportDialog() {
  const { state, dispatch, attachImage } = useEditor()
  const [characters, setCharacters] = useState<OshiCharacter[] | null>(null)
  const [targetId, setTargetId] = useState(NEW_CATEGORY)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const opener = useRef<{ window: Window; origin: string } | null>(null)
  const categories = state.document.categories

  useEffect(() => {
    if (!isOshiImportRequest(window.location.search) || !window.opener) return
    const source = window.opener as Window
    const onMessage = (event: MessageEvent) => {
      if (event.source !== source || !isAllowedOshiOrigin(event.origin)) return
      const parsed = parseOshiMessage(event.data)
      if (!parsed) return
      opener.current = { window: source, origin: event.origin }
      setCharacters(parsed)
      clearOshiImportParam(window.location, window.history)
    }
    window.addEventListener('message', onMessage)
    // 不知道推日跑在哪个地址，逐个白名单地址发；地址不符的会被浏览器直接丢弃
    for (const origin of OSHI_ALLOWED_ORIGINS) {
      try {
        source.postMessage(
          { type: OSHI_READY, version: OSHI_PROTOCOL_VERSION },
          origin,
        )
      } catch {
        /* 打开者已关闭 */
      }
    }
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const existingNames = useMemo(() => {
    const category = categories.find((item) => item.id === targetId)
    return new Set(category?.attributes.map((item) => item.name) ?? [])
  }, [categories, targetId])

  useEffect(() => {
    if (!characters) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setCharacters(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [characters, busy])

  if (!characters) return null
  const pending = characters.filter((item) => !existingNames.has(item.name))
  const close = () => {
    if (!busy) setCharacters(null)
  }

  const run = async () => {
    if (!pending.length) return
    setBusy(true)
    const entries = pending.map((character) => ({
      character,
      attribute: { ...createAttribute(), name: character.name },
    }))
    if (targetId === NEW_CATEGORY) {
      dispatch({
        type: 'category-added',
        category: {
          ...createCategory(categories.length),
          name: NEW_CATEGORY_NAME,
          attributes: entries.map((entry) => entry.attribute),
        },
        at: timestamp(),
      })
    } else {
      dispatch({
        type: 'attributes-added',
        categoryId: targetId,
        attributes: entries.map((entry) => entry.attribute),
        at: timestamp(),
      })
    }
    // 导入的角色以头像为主，关掉画布的「分类显示」，避免分类大圆遮住头像
    if (state.document.canvas.labelSettings.showCategoryNodes) {
      dispatch({
        type: 'label-settings-changed',
        patch: { showCategoryNodes: false },
        at: timestamp(),
      })
    }
    // 等新节点进入编辑器状态后再逐个挂图片
    await nextFrame()
    let images = 0
    const withImages = entries.filter((entry) => entry.character.image)
    for (const [index, entry] of withImages.entries()) {
      setProgress(`正在保存头像 ${index + 1} / ${withImages.length}`)
      const file = oshiImageFile(entry.character)
      if (!file) continue
      let assetId = await attachImage(entry.attribute.id, file, TOP_FOCUS)
      if (!assetId) {
        await nextFrame()
        assetId = await attachImage(entry.attribute.id, file, TOP_FOCUS)
      }
      if (assetId) images++
    }
    const target = opener.current
    if (target && !target.window.closed) {
      target.window.postMessage(
        {
          type: OSHI_IMPORTED,
          version: OSHI_PROTOCOL_VERSION,
          count: entries.length,
        },
        target.origin,
      )
    }
    dispatch({
      type: 'status-changed',
      message: `已从推日导入 ${entries.length} 个角色，${images} 张头像`,
    })
    setBusy(false)
    setProgress('')
    setCharacters(null)
  }

  return (
    <div
      className={'graph-text-backdrop'}
      role={'presentation'}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        className={'graph-text-dialog oshi-import-dialog'}
        role={'dialog'}
        aria-modal={true}
        aria-labelledby={'oshi-import-title'}
      >
        <div className={'node-create-heading'}>
          <div>
            <h2 id={'oshi-import-title'}>从推日导入角色</h2>
          </div>
          <button
            type={'button'}
            className={'profile-icon-button'}
            aria-label={'关闭推日导入'}
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </div>
        <ul className={'oshi-import-list'} aria-label={'待导入角色'}>
          {characters.map((character) => (
            <li
              key={character.name}
              className={existingNames.has(character.name) ? 'is-skipped' : ''}
            >
              {character.image ? (
                <img
                  src={`data:${character.image.mimeType};base64,${character.image.base64}`}
                  alt={''}
                />
              ) : (
                <span className={'oshi-import-avatar'} aria-hidden={true}>
                  {character.name.slice(0, 1)}
                </span>
              )}
              <span>
                <strong>{character.name}</strong>
                <small>
                  {existingNames.has(character.name)
                    ? '已存在，跳过'
                    : character.works.join(' · ') || ' '}
                </small>
              </span>
            </li>
          ))}
        </ul>
        <label className={'graph-text-flat-target'}>
          <span>添加到</span>
          <select
            aria-label={'选择导入位置'}
            value={targetId}
            disabled={busy}
            onChange={(event) => setTargetId(event.currentTarget.value)}
          >
            <option value={NEW_CATEGORY}>
              新建分类「{NEW_CATEGORY_NAME}」
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <div className={'graph-text-summary'} role={'status'}>
          {progress || (
            <>
              将导入 <strong>{pending.length}</strong> 个角色
              {characters.length > pending.length
                ? `，${characters.length - pending.length} 个重名跳过`
                : ''}
            </>
          )}
        </div>
        <div className={'graph-text-actions'}>
          <button
            type={'button'}
            className={'secondary-button'}
            disabled={busy}
            onClick={close}
          >
            取消
          </button>
          <button
            type={'button'}
            className={'primary-button'}
            disabled={busy || pending.length === 0}
            onClick={() => void run()}
          >
            {busy ? '正在导入…' : '确认导入'}
          </button>
        </div>
      </section>
    </div>
  )
}
