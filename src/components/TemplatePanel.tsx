import type { CSSProperties } from 'react'

import { GRAPH_TEMPLATES } from '../domain/templates'
import { useEditor } from '../editor/editorContext'

export function TemplatePanel() {
  const { state, dispatch } = useEditor()

  return (
    <div className={'template-panel-content'} aria-label={'模板面板'}>
      <div className={'panel-header'}>
        <div>
          <p className={'panel-eyebrow'}>LOCAL TEMPLATES</p>
          <h2>模板</h2>
        </div>
        <span className={'panel-count'}>{GRAPH_TEMPLATES.length} 款</span>
      </div>
      <p className={'panel-note'}>
        模板只使用仓库内本地素材，并会同时设置画布尺寸、背景和默认标签范围。应用后可以撤销。
      </p>

      <div className={'template-grid'}>
        {GRAPH_TEMPLATES.map((template) => {
          const selected = state.document.canvas.templateId === template.id
          const previewStyle = {
            '--template-color': template.backgroundColor,
            ...(template.backgroundImageUrl
              ? { backgroundImage: 'url(' + template.backgroundImageUrl + ')' }
              : {}),
          } as CSSProperties
          return (
            <button
              type={'button'}
              className={'template-card' + (selected ? ' is-selected' : '')}
              aria-pressed={selected}
              onClick={() =>
                dispatch({
                  type: 'template-applied',
                  templateId: template.id,
                  at: new Date().toISOString(),
                })
              }
              key={template.id}
            >
              <span className={'template-preview'} style={previewStyle}>
                {template.backgroundImageUrl ? null : (
                  <span aria-hidden={true}>ACG DNA</span>
                )}
              </span>
              <span className={'template-card-copy'}>
                <strong>{template.name}</strong>
                <small>{template.description}</small>
              </span>
              <span className={'template-selected-mark'} aria-hidden={true}>
                {selected ? '✓' : ''}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
