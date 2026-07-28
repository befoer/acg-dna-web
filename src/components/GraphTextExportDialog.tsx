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

export function GraphTextExportDialog({
  document,
  onClose,
}: GraphTextExportDialogProps) {
  const [copied, setCopied] = useState<'structure' | 'labels' | null>(null)
  const structureText = exportGraphStructureText(document)
  const labelText = exportGraphLabelText(document)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const copy = async (kind: 'structure' | 'labels', text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
    } catch {
      setCopied(null)
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
        aria-labelledby={'graph-text-export-title'}
      >
        <div className={'node-create-heading'}>
          <div>
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
        <div className={'graph-text-export-grid'}>
          <section className={'graph-text-export-column'}>
            <h3>完整结构</h3>
            <textarea
              className={'graph-text-preview'}
              aria-label={'完整结构文本'}
              value={structureText}
              readOnly={true}
            />
            <button
              type={'button'}
              className={'secondary-button'}
              onClick={() => void copy('structure', structureText)}
            >
              {copied === 'structure' ? '已复制' : '复制完整结构'}
            </button>
          </section>
          <section className={'graph-text-export-column'}>
            <h3>仅标签</h3>
            <textarea
              className={'graph-text-preview'}
              aria-label={'仅标签文本'}
              value={labelText}
              readOnly={true}
            />
            <button
              type={'button'}
              className={'secondary-button'}
              onClick={() => void copy('labels', labelText)}
            >
              {copied === 'labels' ? '已复制' : '复制仅标签'}
            </button>
          </section>
        </div>
      </section>
    </div>
  )
}
