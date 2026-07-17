import { useEffect, useMemo, useState, type ChangeEvent } from 'react'

import type { GraphCategory } from '../domain/graph'
import {
  GraphTextError,
  parseGraphStructureText,
  summarizeGraphCategories,
} from '../editor/graphText'

interface GraphTextImportDialogProps {
  onClose: () => void
  onImport: (categories: GraphCategory[], mode: 'replace' | 'append') => void
}

const EXAMPLE_TEXT = [
  '分类：动画偏好',
  '  属性：叙事氛围',
  '    子属性：世界观',
  '    子属性：情绪余韵',
  '  属性：作画表现',
].join('\n')

export function GraphTextImportDialog({
  onClose,
  onImport,
}: GraphTextImportDialogProps) {
  const [mode, setMode] = useState<'replace' | 'append'>('append')
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')
  const parsed = useMemo(() => {
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
  }, [text])
  const summary = parsed.categories
    ? summarizeGraphCategories(parsed.categories)
    : null

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (file.size > 1_000_000) {
      setMessage('TXT 文件不能超过 1 MB')
      return
    }
    setText(await file.text())
    setMessage('已读取 ' + file.name)
  }

  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText())
      setMessage('已从剪贴板粘贴')
    } catch {
      setMessage('无法读取剪贴板，请手动粘贴')
    }
  }

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
            <p className={'section-kicker'}>LOCAL IMPORT</p>
            <h2 id={'graph-text-import-title'}>导入文字结构</h2>
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
        <div className={'graph-text-import-tools'}>
          <button
            type={'button'}
            className={'secondary-button'}
            onClick={paste}
          >
            从剪贴板粘贴
          </button>
          <label className={'file-button'}>
            读取 TXT
            <input
              type={'file'}
              accept={'.txt,text/plain'}
              onChange={(event) => void loadFile(event)}
            />
          </label>
          <button
            type={'button'}
            className={'ghost-button'}
            onClick={() => setText(EXAMPLE_TEXT)}
          >
            填入示例
          </button>
        </div>
        <textarea
          className={'graph-text-input'}
          aria-label={'待导入三级结构'}
          value={text}
          placeholder={EXAMPLE_TEXT}
          onChange={(event) => {
            setText(event.currentTarget.value)
            setMessage('')
          }}
        />
        <div
          className={'graph-text-summary' + (parsed.error ? ' is-error' : '')}
          role={'status'}
        >
          {parsed.error ? (
            parsed.error
          ) : summary ? (
            <>
              识别到 <strong>{summary.categories}</strong> 个分类、
              <strong>{summary.attributes}</strong> 个属性、
              <strong>{summary.children}</strong> 个子属性
            </>
          ) : (
            '支持 APP 树形文本，或“分类：/属性：/子属性：”三级格式。'
          )}
        </div>
        {mode === 'replace' ? (
          <p className={'graph-text-warning'}>
            替换会删除当前全部分类及其节点图片，但可通过撤销恢复。
          </p>
        ) : null}
        <div className={'graph-text-message'} aria-live={'polite'}>
          {message}
        </div>
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
            disabled={!parsed.categories}
            onClick={() => {
              if (parsed.categories) onImport(parsed.categories, mode)
            }}
          >
            {mode === 'replace' ? '确认替换' : '确认追加'}
          </button>
        </div>
      </section>
    </div>
  )
}
