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
            <div className={'template-option'} key={template.id}>
              <button
                type={'button'}
                className={'template-card' + (selected ? ' is-selected' : '')}
                aria-pressed={selected}
                aria-label={'应用模板：' + template.name}
                onClick={() =>
                  dispatch({
                    type: 'template-applied',
                    templateId: template.id,
                    at: new Date().toISOString(),
                  })
                }
              >
                <span
                  className={
                    'template-preview' +
                    (template.id === 'custom' ? ' is-custom' : '')
                  }
                  style={previewStyle}
                >
                  {template.id === 'custom' ? (
                    <span
                      className={'template-preview-plus'}
                      aria-hidden={true}
                    >
                      +
                    </span>
                  ) : null}
                </span>
                <span className={'template-selected-mark'} aria-hidden={true}>
                  <span />
                </span>
              </button>
              <span className={'template-card-copy'}>
                <strong>{template.name}</strong>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
