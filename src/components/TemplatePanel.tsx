import type { CSSProperties } from 'react'

import { GRAPH_TEMPLATES } from '../domain/templates'
import { useEditor } from '../editor/editorContext'

export function TemplatePanel() {
  const { state, dispatch } = useEditor()

  return (
    <div className={'template-panel-content'} aria-label={'模板面板'}>
      <div className={'panel-header'}>
        <div>
          <h2>模板</h2>
        </div>
      </div>

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
              </span>
              <span className={'template-selected-mark'} aria-hidden={true}>
                <span />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
