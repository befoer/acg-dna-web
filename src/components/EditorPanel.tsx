import { useState, type ChangeEvent, type CSSProperties } from 'react'

import type {
  GraphCategory,
  GraphImageTransform,
  GraphNodeKind,
} from '../domain/graph'
import {
  createAttribute,
  createCategory,
  createSubAttribute,
  findGraphNode,
} from '../domain/graph'
import { useEditor } from '../editor/editorContext'
import { selectedNode } from '../editor/editorReducer'
import { GlobalLabelSettingsPanel } from './GlobalLabelSettingsPanel'
import { CategoryAppearancePanel } from './CategoryAppearancePanel'
import { GraphTextExportDialog } from './GraphTextExportDialog'
import { GraphTextImportDialog } from './GraphTextImportDialog'
import { LocalImageEditor } from './LocalImageEditor'
import { ImageSearchDialog } from './ImageSearchDialog'
import { NodeCreateDialog } from './NodeCreateDialog'

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
  expandable?: boolean
  expanded?: boolean
  onToggleExpanded?: () => void
}

function TreeRow({
  id,
  name,
  value,
  hidden,
  color,
  depth,
  selected,
  expandable = false,
  expanded = true,
  onToggleExpanded,
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
      <div className={'tree-row-actions'}>
        {expandable ? (
          <button
            type={'button'}
            className={'tree-expand-button'}
            aria-label={(expanded ? '折叠 ' : '展开 ') + displayName}
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          >
            {expanded ? '⌄' : '›'}
          </button>
        ) : null}
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
    </div>
  )
}

interface GraphTreeProps {
  onOpenGlobalSettings: () => void
}

function GraphTree({ onOpenGlobalSettings }: GraphTreeProps) {
  const { state, dispatch } = useEditor()
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [showTextImport, setShowTextImport] = useState(false)
  const [showTextExport, setShowTextExport] = useState(false)

  const selectedMatch = state.selectedNodeId
    ? findGraphNode(state.document, state.selectedNodeId)
    : undefined

  const toggleExpanded = (nodeId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  return (
    <>
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
              onClick={() => setShowCategoryDialog(true)}
            >
              ＋ 分类
            </button>
          </div>
        </div>
        <div className={'data-transfer-actions'}>
          <button
            type={'button'}
            className={'ghost-button'}
            onClick={() => setShowTextImport(true)}
          >
            导入文字
          </button>
          <button
            type={'button'}
            className={'ghost-button'}
            onClick={() => setShowTextExport(true)}
          >
            导出文字
          </button>
        </div>

        <div className="graph-tree">
          {state.document.categories.length === 0 ? (
            <p className="empty-tree">还没有分类，先添加一个吧。</p>
          ) : null}
          {state.document.categories.map((category) => {
            const categoryExpanded =
              !collapsedIds.has(category.id) ||
              (selectedMatch?.categoryId === category.id &&
                selectedMatch.node.id !== category.id)
            return (
              <div key={category.id}>
                <TreeRow
                  id={category.id}
                  name={category.name}
                  value={category.value}
                  hidden={category.hidden}
                  color={category.color}
                  depth={0}
                  selected={state.selectedNodeId === category.id}
                  expandable={category.attributes.length > 0}
                  expanded={categoryExpanded}
                  onToggleExpanded={() => {
                    if (categoryExpanded) {
                      dispatch({
                        type: 'node-selected',
                        nodeId: category.id,
                      })
                    }
                    toggleExpanded(category.id)
                  }}
                />
                {categoryExpanded ? (
                  <div>
                    {category.attributes.map((attribute) => (
                      <div key={attribute.id}>
                        {(() => {
                          const attributeExpanded =
                            !collapsedIds.has(attribute.id) ||
                            selectedMatch?.parentId === attribute.id
                          return (
                            <>
                              <TreeRow
                                id={attribute.id}
                                name={attribute.name}
                                value={attribute.value}
                                hidden={attribute.hidden}
                                color={category.color}
                                depth={1}
                                selected={state.selectedNodeId === attribute.id}
                                expandable={attribute.children.length > 0}
                                expanded={attributeExpanded}
                                onToggleExpanded={() => {
                                  if (attributeExpanded) {
                                    dispatch({
                                      type: 'node-selected',
                                      nodeId: attribute.id,
                                    })
                                  }
                                  toggleExpanded(attribute.id)
                                }}
                              />
                              {attributeExpanded ? (
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
                                        selected={
                                          state.selectedNodeId === child.id
                                        }
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          )
                        })()}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>
      {showCategoryDialog ? (
        <NodeCreateDialog
          kind={'category'}
          onCancel={() => setShowCategoryDialog(false)}
          onConfirm={(names) => {
            const category = {
              ...createCategory(state.document.categories.length),
              name: names[0] ?? '新分类',
            }
            dispatch({
              type: 'category-added',
              category,
              at: timestamp(),
            })
            setShowCategoryDialog(false)
          }}
        />
      ) : null}
      {showTextImport ? (
        <GraphTextImportDialog
          onClose={() => setShowTextImport(false)}
          onImport={(categories, mode) => {
            dispatch({
              type: 'graph-text-imported',
              categories,
              mode,
              at: timestamp(),
            })
            setShowTextImport(false)
          }}
        />
      ) : null}
      {showTextExport ? (
        <GraphTextExportDialog
          document={state.document}
          onClose={() => setShowTextExport(false)}
        />
      ) : null}
    </>
  )
}

interface SelectedNodeEditorProps {
  onOpenCategoryAppearance: (categoryId: string) => void
}

function SelectedNodeEditor({
  onOpenCategoryAppearance,
}: SelectedNodeEditorProps) {
  const {
    state,
    dispatch,
    attachImage,
    attachOnlineImage,
    removeImage,
    removeNode,
  } = useEditor()
  const match = selectedNode(state)
  const asset = match?.node.imageAssetId
    ? state.assets[match.node.imageAssetId]
    : undefined
  const [imageEditorAssetId, setImageEditorAssetId] = useState<string | null>(
    null,
  )
  const [showChildDialog, setShowChildDialog] = useState(false)
  const [showImageSearch, setShowImageSearch] = useState(false)
  const editorAsset = imageEditorAssetId
    ? state.assets[imageEditorAssetId]
    : undefined

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
  const category = state.document.categories.find(
    (item) => item.id === match.categoryId,
  )
  const siblingIds =
    kind === 'category'
      ? state.document.categories.map((item) => item.id)
      : kind === 'attribute'
        ? (category?.attributes.map((item) => item.id) ?? [])
        : (category?.attributes
            .find((item) => item.id === match.parentId)
            ?.children.map((item) => item.id) ?? [])
  const nodeIndex = siblingIds.indexOf(node.id)
  const update = (patch: {
    name?: string
    value?: number
    hidden?: boolean
    color?: string
    imageTransform?: GraphImageTransform
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
    if (file) {
      void attachImage(node.id, file).then((assetId) => {
        if (assetId) setImageEditorAssetId(assetId)
      })
    }
  }

  const addChildren = (names: string[]) => {
    if (kind === 'category') {
      dispatch({
        type: 'attributes-added',
        categoryId: node.id,
        attributes: names.map((name) => ({ ...createAttribute(), name })),
        at: timestamp(),
      })
    } else if (kind === 'attribute') {
      dispatch({
        type: 'sub-attributes-added',
        attributeId: node.id,
        children: names.map((name) => ({ ...createSubAttribute(), name })),
        at: timestamp(),
      })
    }
  }

  return (
    <>
      <section
        className="selected-editor"
        aria-labelledby="selected-node-title"
      >
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
          <div className={'category-quick-style'}>
            <div className="color-field">
              <label className="field-label" htmlFor="category-color">
                分类颜色
              </label>
              <input
                id="category-color"
                type="color"
                value={(node as GraphCategory).color}
                onChange={(event) =>
                  update({ color: event.currentTarget.value })
                }
              />
            </div>
            <button
              type={'button'}
              className={'compact-button'}
              onClick={() => onOpenCategoryAppearance(node.id)}
            >
              分类设置
            </button>
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
            <button
              type={'button'}
              className={'ghost-button'}
              onClick={() => setShowImageSearch(true)}
            >
              在线搜索
            </button>
            {asset ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => setImageEditorAssetId(asset.id)}
              >
                调整
              </button>
            ) : null}
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

        <div className="node-order-control">
          <div>
            <span className="field-label">节点顺序</span>
            <p>
              当前第 {nodeIndex + 1} 项，共 {siblingIds.length} 项
            </p>
          </div>
          <div className="node-order-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={nodeIndex <= 0}
              onClick={() =>
                dispatch({
                  type: 'node-moved',
                  nodeId: node.id,
                  direction: 'up',
                  at: timestamp(),
                })
              }
            >
              ↑ 上移
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={nodeIndex < 0 || nodeIndex >= siblingIds.length - 1}
              onClick={() =>
                dispatch({
                  type: 'node-moved',
                  nodeId: node.id,
                  direction: 'down',
                  at: timestamp(),
                })
              }
            >
              ↓ 下移
            </button>
          </div>
        </div>

        <div className="node-actions">
          {kind !== 'subAttribute' ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowChildDialog(true)}
            >
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
      {editorAsset && editorAsset.id === node.imageAssetId ? (
        <LocalImageEditor
          asset={editorAsset}
          initialTransform={node.imageTransform}
          cropShape={'circle'}
          title={'调整' + KIND_LABELS[kind] + '图片'}
          onCancel={() => setImageEditorAssetId(null)}
          onApply={(imageTransform) => {
            update({ imageTransform })
            setImageEditorAssetId(null)
          }}
        />
      ) : null}
      {showImageSearch ? (
        <ImageSearchDialog
          initialQuery={node.name}
          onClose={() => setShowImageSearch(false)}
          onSelect={async (result) => {
            const assetId = await attachOnlineImage(node.id, result)
            if (!assetId) return false
            setImageEditorAssetId(assetId)
            return true
          }}
        />
      ) : null}
      {showChildDialog && kind !== 'subAttribute' ? (
        <NodeCreateDialog
          kind={kind === 'category' ? 'attribute' : 'subAttribute'}
          parentName={node.name}
          onCancel={() => setShowChildDialog(false)}
          onConfirm={(names) => {
            addChildren(names)
            setShowChildDialog(false)
          }}
        />
      ) : null}
    </>
  )
}

export function EditorPanel() {
  const { state, dispatch } = useEditor()
  const [showGlobalSettings, setShowGlobalSettings] = useState(false)
  const [appearanceCategoryId, setAppearanceCategoryId] = useState<
    string | null
  >(null)

  if (appearanceCategoryId) {
    return (
      <aside className={'editor-panel'} aria-label={'分类独立设置面板'}>
        <CategoryAppearancePanel
          categoryId={appearanceCategoryId}
          onBack={() => setAppearanceCategoryId(null)}
        />
      </aside>
    )
  }

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
      <SelectedNodeEditor
        key={state.selectedNodeId ?? 'none'}
        onOpenCategoryAppearance={setAppearanceCategoryId}
      />
      <GraphTree onOpenGlobalSettings={() => setShowGlobalSettings(true)} />
    </aside>
  )
}
