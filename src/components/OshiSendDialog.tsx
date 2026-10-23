import { useEffect, useState } from 'react'

import { useEditor } from '../editor/editorContext'
import { oshiSendPayload, sendToOshi } from '../integration/oshiSend'

interface OshiSendDialogProps {
  onClose: () => void
}

/** 选一个分类，把其中的属性当作角色发到推日（推日需先在本机启动）。 */
export function OshiSendDialog({ onClose }: OshiSendDialogProps) {
  const { state, dispatch } = useEditor()
  const categories = state.document.categories.filter(
    (category) => category.attributes.length > 0,
  )
  const [categoryId, setCategoryId] = useState(
    () =>
      categories.find((category) => category.name.includes('角色'))?.id ??
      categories[0]?.id ??
      '',
  )
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const category = categories.find((item) => item.id === categoryId)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const send = () => {
    if (!category) return
    setBusy(true)
    setStatus('正在打开推日，请在推日里确认导入…')
    sendToOshi(oshiSendPayload(category, state.assets))
      .then((count) => {
        dispatch({
          type: 'status-changed',
          message: `推日已导入 ${count} 个角色`,
        })
        onClose()
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : '发送失败')
        setBusy(false)
      })
  }

  return (
    <div
      className={'graph-text-backdrop'}
      role={'presentation'}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className={'graph-text-dialog'}
        role={'dialog'}
        aria-modal={true}
        aria-labelledby={'oshi-send-title'}
      >
        <div className={'node-create-heading'}>
          <div>
            <h2 id={'oshi-send-title'}>发送到推日</h2>
          </div>
          <button
            type={'button'}
            className={'profile-icon-button'}
            aria-label={'关闭发送到推日'}
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {categories.length ? (
          <label className={'graph-text-flat-target'}>
            <span>发送分类</span>
            <select
              aria-label={'选择要发送的分类'}
              value={categoryId}
              disabled={busy}
              onChange={(event) => setCategoryId(event.currentTarget.value)}
            >
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}（{item.attributes.length}）
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div
          className={
            'graph-text-summary' + (status && !busy ? ' is-error' : '')
          }
          role={'status'}
        >
          {status ||
            (category ? (
              <>
                将把 <strong>{category.attributes.length}</strong>{' '}
                个属性作为角色发到推日。通过 Bangumi
                搜到的角色图片会带上角色编号，推日会自动补全生日和资料。请先双击「推日.exe」启动推日。
              </>
            ) : (
              '还没有带属性的分类可以发送'
            ))}
        </div>
        <div className={'graph-text-actions'}>
          <button
            type={'button'}
            className={'secondary-button'}
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type={'button'}
            className={'primary-button'}
            disabled={busy || !category}
            onClick={send}
          >
            {busy ? '等待推日确认…' : '发送'}
          </button>
        </div>
      </section>
    </div>
  )
}
