import { useEffect, useMemo, useState } from 'react'

import type { GraphCategory } from '../domain/graph'
import {
  GraphTextError,
  parseGraphStructureText,
  summarizeGraphCategories,
} from '../editor/graphText'

interface GraphTextImportDialogProps {
  onClose: () => void
  onImport: (categories: GraphCategory[], mode: 'replace' | 'append') => void
  flatTargets: GraphTextFlatTarget[]
  onImportFlat: (target: GraphTextFlatTarget, names: string[]) => void
}

export interface GraphTextFlatTarget {
  id: string
  kind: 'category' | 'attribute'
  label: string
}

function parseFlatNames(value: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const part of value.split(/[\n、，,；;/\\]+/)) {
    const name = part.trim().slice(0, 40)
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
    if (names.length >= 50) break
  }
  return names
}

function isStructuredText(value: string): boolean {
  return /(?:^\s*(?:分类|属性|子属性)\s*[：:]|[├└]─|^\s+[-*]\s+|^\s*#{1,2}\s+)/m.test(
    value,
  )
}

export function GraphTextImportDialog({
  onClose,
  onImport,
  flatTargets,
  onImportFlat,
}: GraphTextImportDialogProps) {
  const [mode, setMode] = useState<'replace' | 'append'>('append')
  const [text, setText] = useState('')
  const [flatTargetId, setFlatTargetId] = useState(
    () => flatTargets[0]?.id ?? '',
  )
  const isFlatInput = Boolean(text.trim()) && !isStructuredText(text)
  const flatNames = useMemo(() => parseFlatNames(text), [text])
  const parsed = useMemo(() => {
    if (isFlatInput) return { categories: null, error: '' }
    if (!text.trim()) return { categories: null, error: '' }
    try {
      return {
        categories: parseGraphStructureText(text),
        error: '',
      }
    } catch (error) {
      return {
        categories: null,
        error: error instanceof GraphTextError ? error.message : '文本解析失败',
      }
    }
  }, [isFlatInput, text])
  const summary = parsed.categories
    ? summarizeGraphCategories(parsed.categories)
    : null
  const flatTarget =
    flatTargets.find((target) => target.id === flatTargetId) ?? null

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className={'graph-text-backdrop'}
      role={'presentation'}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className={'graph-text-dialog'}
        role={'dialog'}
        aria-modal={true}
        aria-labelledby={'graph-text-import-title'}
      >
        <div className={'node-create-heading'}>
          <div>
            <h2 id={'graph-text-import-title'}>导入属性</h2>
          </div>
          <button
            type={'button'}
            className={'profile-icon-button'}
            aria-label={'关闭文字导入'}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {!isFlatInput ? (
          <div className={'node-create-tabs'} role={'tablist'}>
            <button
              type={'button'}
              role={'tab'}
              aria-selected={mode === 'append'}
              className={mode === 'append' ? 'is-active' : ''}
              onClick={() => setMode('append')}
            >
              追加到当前数据
            </button>
            <button
              type={'button'}
              role={'tab'}
              aria-selected={mode === 'replace'}
              className={mode === 'replace' ? 'is-active' : ''}
              onClick={() => setMode('replace')}
            >
              替换当前数据
            </button>
          </div>
        ) : null}
        <textarea
          className={'graph-text-input'}
          aria-label={'待导入三级结构'}
          value={text}
          placeholder={'每行或按分隔符输入多个属性'}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        {isFlatInput ? (
          <label className={'graph-text-flat-target'}>
            <span>添加到</span>
            <select
              aria-label={'选择添加位置'}
              value={flatTargetId}
              onChange={(event) => setFlatTargetId(event.currentTarget.value)}
            >
              {flatTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {parsed.error || summary || isFlatInput ? (
          <div
            className={'graph-text-summary' + (parsed.error ? ' is-error' : '')}
            role={'status'}
          >
            {parsed.error ? (
              parsed.error
            ) : isFlatInput ? (
              <>
                识别到 <strong>{flatNames.length}</strong> 个属性
              </>
            ) : summary ? (
              <>
                识别到 <strong>{summary.categories}</strong> 个一级属性、
                <strong>{summary.attributes}</strong> 个二级属性、
                <strong>{summary.children}</strong> 个三级属性
              </>
            ) : null}
          </div>
        ) : null}
        {mode === 'replace' ? (
          <p className={'graph-text-warning'}>
            替换会删除当前全部分类及其节点图片，但可通过撤销恢复。
          </p>
        ) : null}
        <div className={'graph-text-actions'}>
          <button
            type={'button'}
            className={'secondary-button'}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type={'button'}
            className={'primary-button'}
            disabled={
              isFlatInput
                ? flatNames.length === 0 || !flatTarget
                : !parsed.categories
            }
            onClick={() => {
              if (isFlatInput && flatTarget) {
                onImportFlat(flatTarget, flatNames)
                return
              }
              if (parsed.categories) onImport(parsed.categories, mode)
            }}
          >
            {isFlatInput
              ? '确认添加'
              : mode === 'replace'
                ? '确认替换'
                : '确认追加'}
          </button>
        </div>
      </section>
    </div>
  )
}
