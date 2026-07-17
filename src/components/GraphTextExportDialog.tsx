import { useEffect, useState } from 'react'

import type { GraphDocument } from '../domain/graph'
import {
  exportGraphLabelText,
  exportGraphStructureText,
} from '../editor/graphText'

interface GraphTextExportDialogProps {
  document: GraphDocument
  onClose: () => void
}

function safeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ') || 'acg-dna'
  )
}

export function GraphTextExportDialog({
  document,
  onClose,
}: GraphTextExportDialogProps) {
  const [view, setView] = useState<'structure' | 'labels'>('structure')
  const [message, setMessage] = useState('')
  const structureText = exportGraphStructureText(document)
  const labelText = exportGraphLabelText(document)
  const text = view === 'structure' ? structureText : labelText

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage('已复制到剪贴板')
    } catch {
      setMessage('复制失败，请手动选择文本')
    }
  }

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = objectUrl
    link.download =
      safeFileName(document.name) +
      (view === 'structure' ? '-完整结构.txt' : '-仅标签.txt')
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    setMessage('TXT 已下载')
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
        aria-labelledby={'graph-text-export-title'}
      >
        <div className={'node-create-heading'}>
          <div>
            <p className={'section-kicker'}>PLAIN TEXT</p>
            <h2 id={'graph-text-export-title'}>导出文字</h2>
          </div>
          <button
            type={'button'}
            className={'profile-icon-button'}
            aria-label={'关闭文字导出'}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className={'node-create-tabs'} role={'tablist'}>
          <button
            type={'button'}
            role={'tab'}
            aria-selected={view === 'structure'}
            className={view === 'structure' ? 'is-active' : ''}
            onClick={() => setView('structure')}
          >
            完整结构
          </button>
          <button
            type={'button'}
            role={'tab'}
            aria-selected={view === 'labels'}
            className={view === 'labels' ? 'is-active' : ''}
            onClick={() => setView('labels')}
          >
            仅标签
          </button>
        </div>
        <textarea
          className={'graph-text-preview'}
          aria-label={view === 'structure' ? '完整结构文本' : '仅标签文本'}
          value={text}
          readOnly={true}
        />
        <div className={'graph-text-message'} aria-live={'polite'}>
          {message || '完整结构格式与 APP 导出样式一致，可再次导入 Web。'}
        </div>
        <div className={'graph-text-actions'}>
          <button type={'button'} className={'secondary-button'} onClick={copy}>
            复制
          </button>
          <button
            type={'button'}
            className={'primary-button'}
            onClick={download}
          >
            下载 TXT
          </button>
        </div>
      </section>
    </div>
  )
}
