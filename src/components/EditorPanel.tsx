import { useState, type ChangeEvent, type CSSProperties } from 'react'

import type { GraphCategory, GraphNodeKind } from '../domain/graph'
import {
  createAttribute,
  createCategory,
  createSubAttribute,
} from '../domain/graph'
import { useEditor } from '../editor/editorContext'
import { selectedNode } from '../editor/editorReducer'
import { GlobalLabelSettingsPanel } from './GlobalLabelSettingsPanel'

const KIND_LABELS: Record<GraphNodeKind, string> = {
  category: '分类',
  attribute: '属性',
  subAttribute: '子属性',
}

function timestamp(): string {
  return new Date().toISOString()
}

interface TreeRowProps {
  id: string
  name: string
  value: number
  hidden: boolean
  color: string
  depth: number
  selected: boolean
}

function TreeRow({
  id,
  name,
  value,
  hidden,
  color,
  depth,
  selected,
}: TreeRowProps) {
  const { dispatch } = useEditor()
  const displayName = name || '未命名'
  const normalizedValue = Math.max(1, Math.min(100, value))
  const style = {
    '--tree-depth': depth,
    '--tree-color': color,
    '--tree-progress': normalizedValue + '%',
  } as CSSProperties

  return (
    <div
      className={
        'tree-row' +
        (selected ? ' is-selected' : '') +
        (hidden ? ' is-hidden' : '')
      }
      style={style}
    >
      <div className="tree-row-main">
        <button
          type="button"
          className="tree-node-button"
          onClick={() => dispatch({ type: 'node-selected', nodeId: id })}
          aria-pressed={selected}
        >
          <span className="tree-color" style={{ backgroundColor: color }} />
          <span className="tree-name">{displayName}</span>
        </button>
        <label className="tree-weight-control">
          <span className="sr-only">{displayName} 权重</span>
          <input
            type="range"
            min="1"
            max="100"
            value={normalizedValue}
            aria-label={displayName + ' 权重'}
            onChange={(event) =>
              dispatch({
                type: 'node-updated',
                nodeId: id,
                patch: { value: Number(event.currentTarget.value) },
                at: timestamp(),
              })
            }
          />
          <output className="tree-value">{Math.round(value)}</output>
        </label>
      </div>
      <button
        type="button"
        className="tree-visibility-button"
        onClick={() =>
          dispatch({
            type: 'node-updated',
            nodeId: id,
            patch: { hidden: !hidden },
            at: timestamp(),
          })
        }
        aria-label={(hidden ? '显示' : '隐藏') + ' ' + displayName}
        title={hidden ? '显示节点' : '隐藏节点'}
      >
        {hidden ? '○' : '●'}
      </button>
    </div>
  )
}

interface GraphTreeProps {
  onOpenGlobalSettings: () => void
}

function GraphTree({ onOpenGlobalSettings }: GraphTreeProps) {
  const { state, dispatch } = useEditor()

  return (
    <section className="panel-section" aria-labelledby="structure-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">GRAPH STRUCTURE</p>
          <h3 id="structure-title">三级结构</h3>
        </div>
        <div className={'section-heading-actions'}>
          <button
            type={'button'}
            className={'compact-button'}
            onClick={onOpenGlobalSettings}
          >
            全局设置
          </button>
          <button
            type="button"
            className="compact-button"
            onClick={() =>
              dispatch({
                type: 'category-added',
                category: createCategory(state.document.categories.length),
                at: timestamp(),
              })
            }
          >
            ＋ 分类
          </button>
        </div>
      </div>

      <div className="graph-tree">
        {state.document.categories.length === 0 ? (
          <p className="empty-tree">还没有分类，先添加一个吧。</p>
        ) : null}
        {state.document.categories.map((category) => (
          <div key={category.id}>
            <TreeRow
              id={category.id}
              name={category.name}
              value={category.value}
              hidden={category.hidden}
              color={category.color}
              depth={0}
              selected={state.selectedNodeId === category.id}
            />
            <div>
              {category.attributes.map((attribute) => (
                <div key={attribute.id}>
                  <TreeRow
                    id={attribute.id}
                    name={attribute.name}
                    value={attribute.value}
                    hidden={attribute.hidden}
                    color={category.color}
                    depth={1}
                    selected={state.selectedNodeId === attribute.id}
                  />
                  <div>
                    {attribute.children.map((child) => (
                      <div key={child.id}>
                        <TreeRow
                          id={child.id}
                          name={child.name}
                          value={child.value}
                          hidden={child.hidden}
                          color={category.color}
                          depth={2}
                          selected={state.selectedNodeId === child.id}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SelectedNodeEditor() {
  const { state, dispatch, attachImage, removeImage, removeNode } = useEditor()
  const match = selectedNode(state)

  if (!match) {
    return (
      <section className="selection-empty">
        <span className="selection-empty-mark">◎</span>
        <div>
          <h3>选择一个气泡</h3>
          <p>从画布或下方结构中选择节点，再编辑名称、显隐和图片。</p>
        </div>
      </section>
    )
  }

  const { node, kind } = match
  const asset = node.imageAssetId ? state.assets[node.imageAssetId] : undefined
  const update = (patch: {
    name?: string
    value?: number
    hidden?: boolean
    color?: string
  }) =>
    dispatch({
      type: 'node-updated',
      nodeId: node.id,
      patch,
      at: timestamp(),
    })

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) void attachImage(node.id, file)
  }

  const addChild = () => {
    if (kind === 'category') {
      dispatch({
        type: 'attribute-added',
        categoryId: node.id,
        attribute: createAttribute(),
        at: timestamp(),
      })
    } else if (kind === 'attribute') {
      dispatch({
        type: 'sub-attribute-added',
        attributeId: node.id,
        child: createSubAttribute(),
        at: timestamp(),
      })
    }
  }

  return (
    <section className="selected-editor" aria-labelledby="selected-node-title">
      <div className="selection-title-row">
        <div>
          <p className="section-kicker">SELECTED · {KIND_LABELS[kind]}</p>
          <h3 id="selected-node-title">编辑节点</h3>
        </div>
        <button
          type="button"
          className={`visibility-toggle${node.hidden ? ' is-off' : ''}`}
          onClick={() => update({ hidden: !node.hidden })}
          aria-pressed={!node.hidden}
        >
          {node.hidden ? '已隐藏' : '显示中'}
        </button>
      </div>

      <label className="field-label" htmlFor="node-name">
        名称
      </label>
      <input
        id="node-name"
        className="text-input"
        value={node.name}
        maxLength={40}
        onChange={(event) => update({ name: event.currentTarget.value })}
        onBlur={(event) => {
          if (!event.currentTarget.value.trim()) update({ name: '未命名' })
        }}
      />

      {kind === 'category' ? (
        <div className="color-field">
          <label className="field-label" htmlFor="category-color">
            分类颜色
          </label>
          <input
            id="category-color"
            type="color"
            value={(node as GraphCategory).color}
            onChange={(event) => update({ color: event.currentTarget.value })}
          />
        </div>
      ) : null}

      <div className="image-field">
        <div>
          <span className="field-label">本地图片</span>
          <p>{asset ? asset.fileName : '使用居中裁切填充气泡'}</p>
        </div>
        <div className="image-actions">
          <label className="file-button">
            {asset ? '替换' : '选择图片'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              onChange={handleFile}
            />
          </label>
          {asset ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => removeImage(node.id)}
            >
              移除
            </button>
          ) : null}
        </div>
      </div>

      <div className="node-actions">
        {kind !== 'subAttribute' ? (
          <button type="button" className="secondary-button" onClick={addChild}>
            ＋ {kind === 'category' ? '添加属性' : '添加子属性'}
          </button>
        ) : null}
        <button
          type="button"
          className="danger-button"
          onClick={() => removeNode(node.id)}
        >
          删除{KIND_LABELS[kind]}
        </button>
      </div>
    </section>
  )
}

export function EditorPanel() {
  const { state, dispatch } = useEditor()
  const [showGlobalSettings, setShowGlobalSettings] = useState(false)

  if (showGlobalSettings) {
    return (
      <aside className={'editor-panel'} aria-label={'数据编辑面板'}>
        <GlobalLabelSettingsPanel onBack={() => setShowGlobalSettings(false)} />
      </aside>
    )
  }

  return (
    <aside className="editor-panel" aria-label="数据编辑面板">
      <div className="panel-header">
        <div>
          <p className="panel-eyebrow">LOCAL EDITOR</p>
          <h2>数据</h2>
        </div>
        <label className="background-control" title="画布背景色">
          <span>背景</span>
          <input
            type="color"
            value={state.document.canvas.backgroundColor}
            onChange={(event) =>
              dispatch({
                type: 'background-changed',
                color: event.currentTarget.value,
                at: timestamp(),
              })
            }
          />
        </label>
      </div>
      <p className="panel-note">
        {state.persistence.status === 'unavailable'
          ? '当前环境不支持浏览器本地保存。'
          : '项目和图片会自动保存到此浏览器。'}{' '}
        {state.statusMessage}
      </p>
      <SelectedNodeEditor />
      <GraphTree onOpenGlobalSettings={() => setShowGlobalSettings(true)} />
    </aside>
  )
}
