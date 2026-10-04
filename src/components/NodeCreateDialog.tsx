import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type { GraphNodeKind } from '../domain/graph'

interface NodeCreateDialogProps {
  kind: GraphNodeKind
  parentName?: string
  onCancel: () => void
  onConfirm: (names: string[]) => void
}

const KIND_NAMES: Record<GraphNodeKind, string> = {
  category: '分类',
  attribute: '属性',
  subAttribute: '子属性',
}

function parseBatchNames(value: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const part of value.split(/[\n、，,；;/\\]+/)) {
    const name = part.trim().slice(0, 40)
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
    if (names.length >= 50) break
  }
  return names
}

export function NodeCreateDialog({
  kind,
  parentName,
  onCancel,
  onConfirm,
}: NodeCreateDialogProps) {
  const supportsBatch = kind !== 'category'
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [singleName, setSingleName] = useState('')
  const [batchText, setBatchText] = useState('')
  const batchNames = useMemo(() => parseBatchNames(batchText), [batchText])
  const names =
    mode === 'batch'
      ? batchNames
      : singleName.trim()
        ? [singleName.trim().slice(0, 40)]
        : []

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (names.length > 0) onConfirm(names)
  }

  return (
    <div
      className={'node-create-backdrop'}
      role={'presentation'}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <form
        className={'node-create-dialog'}
        role={'dialog'}
        aria-modal={true}
        aria-labelledby={'node-create-title'}
        onSubmit={submit}
      >
        <div className={'node-create-heading'}>
          <div>
            <p className={'section-kicker'}>LOCAL DATA</p>
            <h2 id={'node-create-title'}>添加{KIND_NAMES[kind]}</h2>
            {parentName ? <small>添加到「{parentName}」</small> : null}
          </div>
          <button
            type={'button'}
            className={'profile-icon-button'}
            aria-label={'关闭添加窗口'}
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        {supportsBatch ? (
          <div className={'node-create-tabs'} role={'tablist'}>
            <button
              type={'button'}
              role={'tab'}
              aria-selected={mode === 'single'}
              className={mode === 'single' ? 'is-active' : ''}
              onClick={() => setMode('single')}
            >
              单条添加
            </button>
            <button
              type={'button'}
              role={'tab'}
              aria-selected={mode === 'batch'}
              className={mode === 'batch' ? 'is-active' : ''}
              onClick={() => setMode('batch')}
            >
              批量添加
            </button>
          </div>
        ) : null}

        {mode === 'single' ? (
          <label className={'node-create-field'}>
            <span>{KIND_NAMES[kind]}名称</span>
            <input
              autoFocus={true}
              maxLength={40}
              value={singleName}
              placeholder={'输入名称'}
              onChange={(event) => setSingleName(event.currentTarget.value)}
            />
            <small>{singleName.length}/40</small>
          </label>
        ) : (
          <label className={'node-create-field'}>
            <span>批量名称</span>
            <textarea
              autoFocus={true}
              value={batchText}
              placeholder={'每行一个名称，也支持顿号、逗号、分号或斜杠分隔'}
              onChange={(event) => setBatchText(event.currentTarget.value)}
            />
            <small>
              已识别 {batchNames.length}/50 项，空项和本批重复名称会被忽略
            </small>
          </label>
        )}

        <div className={'node-create-actions'}>
          <button
            type={'button'}
            className={'secondary-button'}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type={'submit'}
            className={'primary-button'}
            disabled={names.length === 0}
          >
            {names.length > 1 ? '添加 ' + names.length + ' 项' : '添加'}
          </button>
        </div>
      </form>
    </div>
  )
}
