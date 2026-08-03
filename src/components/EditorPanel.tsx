import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'

import type { GraphImageTransform } from '../domain/graph'
import {
  createAttribute,
  createCategory,
  createSubAttribute,
  findGraphNode,
} from '../domain/graph'
import { useEditor } from '../editor/editorContext'
import { selectedNode } from '../editor/editorReducer'
import { CategoryAppearancePanel } from './CategoryAppearancePanel'
import { GraphTextExportDialog } from './GraphTextExportDialog'
import {
  GraphTextImportDialog,
  type GraphTextFlatTarget,
} from './GraphTextImportDialog'
import { GlobalLabelSettingsPanel } from './GlobalLabelSettingsPanel'
import { LocalImageEditor } from './LocalImageEditor'
import { ImageSearchDialog } from './ImageSearchDialog'
import { NodeCreateDialog } from './NodeCreateDialog'
import type { CanvasNodeActionRequest } from './canvasNodeActions'
import type { OnlineImageKind } from '../search/onlineImageSearch'
import eyeIconUrl from '../assets/eye.svg'
import gearIconUrl from '../assets/gear.svg'
import imageIconUrl from '../assets/image.svg'

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
  canAddChild?: boolean
  onAddChild?: () => void
  onRemove?: () => void
  onOpenCategorySettings?: () => void
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
  canAddChild = false,
  onAddChild,
  onRemove,
  onOpenCategorySettings,
}: TreeRowProps) {
  const { dispatch } = useEditor()
  const [isRenaming, setIsRenaming] = useState(false)
  const displayName = name || '未命名'
  const normalizedValue = Math.max(1, Math.min(100, value))
  const isCategory = depth === 0
  const showAddButton = depth === 1 && canAddChild && onAddChild
  const style = {
    '--tree-color': color,
    '--tree-progress': normalizedValue + '%',
  } as CSSProperties

  return (
    <div
      className={
        'tree-row tree-row-depth-' +
        depth +
        (selected ? ' is-selected' : '') +
        (hidden ? ' is-hidden' : '')
      }
      style={style}
    >
      <div className="tree-row-main">
        <span className="tree-branch" aria-hidden={true} />
        {expandable || isCategory ? (
          <button
            type="button"
            className="tree-expand-button"
            aria-label={(expanded ? '折叠 ' : '展开 ') + displayName}
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          >
            {expanded ? '⌄' : '›'}
          </button>
        ) : (
          <span className="tree-expand-spacer" aria-hidden={true} />
        )}
        {showAddButton ? (
          <button
            type="button"
            className="tree-icon-button tree-add-child-button"
            onClick={onAddChild}
            aria-label={'为 ' + displayName + ' 添加子标签'}
            title="添加子标签并选择图片"
          >
            +
          </button>
        ) : (
          <span className="tree-control-spacer" aria-hidden={true} />
        )}
        <button
          type="button"
          className="tree-icon-button tree-remove-button"
          onClick={onRemove}
          aria-label={'删除 ' + displayName}
          title={'删除标签'}
        >
          −
        </button>
        {isRenaming ? (
          <input
            autoFocus={true}
            className="tree-name-input"
            defaultValue={name}
            maxLength={40}
            aria-label={'重命名 ' + displayName}
            onBlur={(event) => {
              const nextName = event.currentTarget.value.trim()
              if (nextName && nextName !== name) {
                dispatch({
                  type: 'node-updated',
                  nodeId: id,
                  patch: { name: nextName },
                  at: timestamp(),
                })
              }
              setIsRenaming(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.currentTarget.value = name
                event.currentTarget.blur()
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="tree-node-button"
            onClick={() => dispatch({ type: 'node-selected', nodeId: id })}
            onDoubleClick={(event) => {
              event.preventDefault()
              dispatch({ type: 'node-selected', nodeId: id })
              setIsRenaming(true)
            }}
            aria-pressed={selected}
          >
            <span className="tree-name">{displayName}</span>
          </button>
        )}
        {isCategory ? (
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
            <img src={eyeIconUrl} alt="" aria-hidden={true} />
          </button>
        ) : null}
        {isCategory ? (
          <button
            type="button"
            className="tree-icon-button tree-category-settings-button"
            onClick={onOpenCategorySettings}
            aria-label={displayName + ' 分类设置'}
            title="分类设置"
          >
            <img src={gearIconUrl} alt="" aria-hidden={true} />
          </button>
        ) : null}
        {isCategory ? (
          <button
            type="button"
            className="tree-selection-spacer"
            aria-label={'选择 ' + displayName}
            onClick={() => dispatch({ type: 'node-selected', nodeId: id })}
          />
        ) : null}
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
    </div>
  )
}

interface TreeCustomDialogProps {
  onClose: () => void
  onConfirm: (input: { file: File | null; name: string }) => Promise<boolean>
}

function TreeCustomDialog({ onClose, onConfirm }: TreeCustomDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  )
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const chooseLocalImage = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!nextFile || saving) return
    setFile(nextFile)
  }

  const confirm = async () => {
    if (saving || (!file && !name.trim())) return
    setSaving(true)
    const saved = await onConfirm({ file, name: name.trim() })
    setSaving(false)
    if (saved) onClose()
  }

  return (
    <div
      className="node-create-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="node-create-dialog tree-custom-dialog"
        role="dialog"
        aria-modal={true}
        aria-labelledby="tree-custom-title"
      >
        <div className="node-create-heading">
          <div>
            <p className="section-kicker">LOCAL CONTENT</p>
            <h2 id="tree-custom-title">自定义内容</h2>
          </div>
          <button
            type="button"
            className="profile-icon-button"
            aria-label="关闭自定义窗口"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <input
          ref={inputRef}
          className="tree-custom-file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          onChange={chooseLocalImage}
        />
        <button
          type="button"
          className="tree-custom-image-picker"
          aria-label={file ? '更换本地图片' : '添加本地图片'}
          onClick={() => inputRef.current?.click()}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" />
          ) : (
            <span aria-hidden={true}>+</span>
          )}
        </button>
        <input
          className="text-input tree-custom-name-input"
          value={name}
          maxLength={40}
          placeholder="名称"
          aria-label="自定义名称"
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <div className="node-create-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={saving || (!file && !name.trim())}
            onClick={() => void confirm()}
          >
            {saving ? '保存中…' : '确认'}
          </button>
        </div>
      </section>
    </div>
  )
}

interface GraphTreeProps {
  onOpenCategoryAppearance: (categoryId: string) => void
}

type TreeAddTarget =
  | {
      kind: 'attribute'
      categoryId: string
      parentName: string
      initialKind?: OnlineImageKind
    }
  | {
      kind: 'subAttribute'
      attributeId: string
      parentName: string
      initialKind?: OnlineImageKind
    }

function categorySearchKind(name: string): OnlineImageKind | undefined {
  return {
    动画: 'anime',
    角色: 'character',
    游戏: 'game',
    歌手: 'singer',
  }[name.trim()] as OnlineImageKind | undefined
}

function GraphTree({ onOpenCategoryAppearance }: GraphTreeProps) {
  const { state, dispatch, attachImage, attachOnlineImage, removeNode } =
    useEditor()
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [imageTargetId, setImageTargetId] = useState<string | null>(null)
  const [treeAddTarget, setTreeAddTarget] = useState<TreeAddTarget | null>(null)
  const [showTreeImageSearch, setShowTreeImageSearch] = useState(false)
  const [showTreeCustom, setShowTreeCustom] = useState(false)
  const [treeImageEditorAssetId, setTreeImageEditorAssetId] = useState<
    string | null
  >(null)

  const selectedMatch = state.selectedNodeId
    ? findGraphNode(state.document, state.selectedNodeId)
    : undefined
  const imageTargetMatch = imageTargetId
    ? findGraphNode(state.document, imageTargetId)
    : undefined
  const imageTargetNode = imageTargetMatch?.node
  const imageTargetCategory = imageTargetMatch
    ? state.document.categories.find(
        (category) => category.id === imageTargetMatch.categoryId,
      )
    : undefined
  const treeImageEditorAsset = treeImageEditorAssetId
    ? state.assets[treeImageEditorAssetId]
    : undefined
  const treeImageEditorOnlineSeed = treeImageEditorAsset?.source?.searchSeed

  const openTreeImageSearch = (target: TreeAddTarget) => {
    setImageTargetId(null)
    setTreeAddTarget(target)
    setShowTreeCustom(false)
    setShowTreeImageSearch(true)
  }

  const createTreeNode = (target: TreeAddTarget, name: string) => {
    if (target.kind === 'attribute') {
      const attribute = { ...createAttribute(), name }
      dispatch({
        type: 'attributes-added',
        categoryId: target.categoryId,
        attributes: [attribute],
        at: timestamp(),
      })
      return attribute
    }
    const child = { ...createSubAttribute(), name }
    dispatch({
      type: 'sub-attributes-added',
      attributeId: target.attributeId,
      children: [child],
      at: timestamp(),
    })
    return child
  }

  const waitForTreeNode = () =>
    new Promise<void>((resolve) => window.setTimeout(resolve, 0))

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
      <div className="graph-tree-section">
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
              <div className="tree-category-group" key={category.id}>
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
                  onRemove={() => removeNode(category.id)}
                  onOpenCategorySettings={() =>
                    onOpenCategoryAppearance(category.id)
                  }
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
                                canAddChild={true}
                                onAddChild={() =>
                                  openTreeImageSearch({
                                    kind: 'subAttribute',
                                    attributeId: attribute.id,
                                    parentName: attribute.name || '未命名属性',
                                    initialKind: categorySearchKind(
                                      category.name,
                                    ),
                                  })
                                }
                                onRemove={() => removeNode(attribute.id)}
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
                                      onRemove={() => removeNode(child.id)}
                                      key={child.id}
                                    />
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
                <button
                  type="button"
                  className="tree-add-row"
                  aria-label={'为 ' + category.name + ' 添加属性'}
                  onClick={() =>
                    openTreeImageSearch({
                      kind: 'attribute',
                      categoryId: category.id,
                      parentName: category.name || '未命名分类',
                      initialKind: categorySearchKind(category.name),
                    })
                  }
                >
                  ＋
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className="tree-add-category-row"
          aria-label="添加一级标签"
          onClick={() => setShowCategoryDialog(true)}
        >
          ＋
        </button>
      </div>
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
      {showTreeImageSearch && (imageTargetNode || treeAddTarget) ? (
        <ImageSearchDialog
          cacheKey={
            imageTargetNode?.id ??
            'tree-add-' + treeAddTarget?.kind + '-' + treeAddTarget?.parentName
          }
          initialQuery={
            imageTargetNode?.name ?? treeAddTarget?.parentName ?? ''
          }
          initialKind={
            categorySearchKind(imageTargetCategory?.name ?? '') ??
            treeAddTarget?.initialKind
          }
          onClose={() => {
            setShowTreeImageSearch(false)
            setTreeAddTarget(null)
          }}
          onCustomize={() => {
            setShowTreeImageSearch(false)
            setShowTreeCustom(true)
          }}
          onSelect={async (result) => {
            if (imageTargetNode) {
              const assetId = await attachOnlineImage(
                imageTargetNode.id,
                result,
              )
              if (!assetId) return false
              dispatch({
                type: 'node-updated',
                nodeId: imageTargetNode.id,
                patch: { name: result.name },
                at: timestamp(),
              })
              setShowTreeImageSearch(false)
              setTreeImageEditorAssetId(assetId)
              return false
            }
            if (!treeAddTarget) return false
            const node = createTreeNode(treeAddTarget, result.name)
            setShowTreeImageSearch(false)
            setTreeAddTarget(null)
            await waitForTreeNode()
            const assetId = await attachOnlineImage(node.id, result)
            if (!assetId) {
              removeNode(node.id)
              return false
            }
            dispatch({ type: 'node-selected', nodeId: node.id })
            // The dialog was closed before the Blob download began. Returning
            // false prevents this stale selection from closing a newer dialog.
            return false
          }}
        />
      ) : null}
      {showTreeCustom && (imageTargetNode || treeAddTarget) ? (
        <TreeCustomDialog
          onClose={() => {
            setShowTreeCustom(false)
            setTreeAddTarget(null)
          }}
          onConfirm={async ({ file, name }) => {
            if (!imageTargetNode && treeAddTarget) {
              const node = createTreeNode(treeAddTarget, name || '未命名')
              setTreeAddTarget(null)
              if (!file) return true
              await waitForTreeNode()
              const assetId = await attachImage(node.id, file)
              if (!assetId) return false
              dispatch({ type: 'node-selected', nodeId: node.id })
              setImageTargetId(node.id)
              setTreeImageEditorAssetId(assetId)
              return true
            }
            if (!imageTargetNode || !imageTargetMatch) return false
            if (file) {
              const assetId = await attachImage(imageTargetNode.id, file)
              if (!assetId) return false
              if (name) {
                dispatch({
                  type: 'node-updated',
                  nodeId: imageTargetNode.id,
                  patch: { name },
                  at: timestamp(),
                })
              }
              setTreeImageEditorAssetId(assetId)
              return true
            }

            if (!name) return false
            if (imageTargetMatch.kind === 'category') {
              dispatch({
                type: 'attributes-added',
                categoryId: imageTargetNode.id,
                attributes: [{ ...createAttribute(), name }],
                at: timestamp(),
              })
              return true
            }
            if (imageTargetMatch.kind === 'attribute') {
              dispatch({
                type: 'sub-attributes-added',
                attributeId: imageTargetNode.id,
                children: [{ ...createSubAttribute(), name }],
                at: timestamp(),
              })
              return true
            }
            return true
          }}
        />
      ) : null}
      {treeImageEditorAsset &&
      imageTargetNode &&
      treeImageEditorAsset.id === imageTargetNode.imageAssetId ? (
        <LocalImageEditor
          key={treeImageEditorAsset.id}
          asset={treeImageEditorAsset}
          initialTransform={imageTargetNode.imageTransform}
          cropShape={'circle'}
          cropAspectRatio={3 / 4}
          title={'调整图片'}
          onlineImageSeed={treeImageEditorOnlineSeed}
          onSelectOnlineImage={
            treeImageEditorOnlineSeed?.provider === 'bangumi'
              ? async (result) => {
                  const assetId = await attachOnlineImage(
                    imageTargetNode.id,
                    result,
                    treeImageEditorOnlineSeed,
                  )
                  if (!assetId) return false
                  setTreeImageEditorAssetId(assetId)
                  return true
                }
              : undefined
          }
          onSearch={() => {
            setTreeImageEditorAssetId(null)
            setShowTreeImageSearch(true)
          }}
          onCancel={() => {
            setTreeImageEditorAssetId(null)
            setImageTargetId(null)
          }}
          onApply={(imageTransform) => {
            dispatch({
              type: 'node-updated',
              nodeId: imageTargetNode.id,
              patch: { imageTransform },
              at: timestamp(),
            })
            setTreeImageEditorAssetId(null)
            setImageTargetId(null)
          }}
        />
      ) : null}
    </>
  )
}
interface SelectedNodeEditorProps {
  canvasNodeAction: CanvasNodeActionRequest | null
  onCanvasNodeActionHandled: () => void
}

type CanvasChildTarget = {
  kind: 'attribute' | 'subAttribute'
  parentId: string
  parentName: string
  initialKind?: OnlineImageKind
}

function SelectedNodeEditor({
  canvasNodeAction,
  onCanvasNodeActionHandled,
}: SelectedNodeEditorProps) {
  const { state, dispatch, attachImage, attachOnlineImage, removeNode } =
    useEditor()
  const match = selectedNode(state)
  const asset = match?.node.imageAssetId
    ? state.assets[match.node.imageAssetId]
    : undefined
  const [imageEditorAssetId, setImageEditorAssetId] = useState<string | null>(
    null,
  )
  const [showImageSearch, setShowImageSearch] = useState(false)
  const [showCustomContent, setShowCustomContent] = useState(false)
  const [canvasChildTarget, setCanvasChildTarget] =
    useState<CanvasChildTarget | null>(null)
  const [showCanvasChildCustom, setShowCanvasChildCustom] = useState(false)
  const editorAsset = imageEditorAssetId
    ? state.assets[imageEditorAssetId]
    : undefined
  const imageEditorOnlineSeed = editorAsset?.source?.searchSeed
  const selectedNodeId = match?.node.id
  const selectedNodeKind = match?.kind
  const selectedCategory = match?.categoryId
    ? state.document.categories.find((item) => item.id === match.categoryId)
    : undefined

  useEffect(() => {
    if (
      !canvasNodeAction ||
      !selectedNodeId ||
      canvasNodeAction.nodeId !== selectedNodeId
    ) {
      return
    }
    const timer = window.setTimeout(() => {
      if (canvasNodeAction.action === 'image') {
        if (asset) setImageEditorAssetId(asset.id)
        else setShowImageSearch(true)
      }
      if (canvasNodeAction.action === 'child') {
        if (selectedNodeKind === 'category') {
          setCanvasChildTarget({
            kind: 'attribute',
            parentId: selectedNodeId,
            parentName: match?.node.name || '未命名分类',
            initialKind: categorySearchKind(selectedCategory?.name ?? ''),
          })
        }
        if (selectedNodeKind === 'attribute') {
          setCanvasChildTarget({
            kind: 'subAttribute',
            parentId: selectedNodeId,
            parentName: match?.node.name || '未命名属性',
            initialKind: categorySearchKind(selectedCategory?.name ?? ''),
          })
        }
      }
      onCanvasNodeActionHandled()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    asset,
    canvasNodeAction,
    onCanvasNodeActionHandled,
    selectedNodeId,
    selectedNodeKind,
    selectedCategory?.name,
    match?.node.name,
  ])

  if (!match) {
    return null
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
  const openImageControl = () => {
    if (asset) {
      setImageEditorAssetId(asset.id)
      return
    }
    setShowImageSearch(true)
  }
  const createCanvasChild = (target: CanvasChildTarget, name: string) => {
    if (target.kind === 'attribute') {
      const attribute = { ...createAttribute(), name }
      dispatch({
        type: 'attributes-added',
        categoryId: target.parentId,
        attributes: [attribute],
        at: timestamp(),
      })
      return attribute
    }
    const child = { ...createSubAttribute(), name }
    dispatch({
      type: 'sub-attributes-added',
      attributeId: target.parentId,
      children: [child],
      at: timestamp(),
    })
    return child
  }

  return (
    <>
      <section className="selected-editor" aria-label="节点编辑">
        <div className="node-name-input-row">
          <input
            id="node-name"
            className="text-input"
            aria-label="名称"
            value={node.name}
            maxLength={40}
            onChange={(event) => update({ name: event.currentTarget.value })}
            onBlur={(event) => {
              if (!event.currentTarget.value.trim()) update({ name: '未命名' })
            }}
          />
          <div className="node-image-controls">
            <button
              type="button"
              className={'node-image-trigger' + (asset ? ' has-image' : '')}
              aria-label={asset ? '调整图片' : '搜索图片'}
              title={asset ? '调整图片' : '搜索图片'}
              onClick={openImageControl}
            >
              {asset ? (
                <img src={asset.objectUrl} alt="" />
              ) : (
                <img
                  className="node-image-placeholder-icon"
                  src={imageIconUrl}
                  alt=""
                  aria-hidden={true}
                />
              )}
            </button>
            <div className="node-order-actions">
              <button
                type="button"
                className="ghost-button"
                aria-label="上移"
                title="上移"
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
                ↑
              </button>
              <button
                type="button"
                className="ghost-button"
                aria-label="下移"
                title="下移"
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
                ↓
              </button>
            </div>
          </div>
        </div>
      </section>
      {editorAsset && editorAsset.id === node.imageAssetId ? (
        <LocalImageEditor
          key={editorAsset.id}
          asset={editorAsset}
          initialTransform={node.imageTransform}
          cropShape={'circle'}
          cropAspectRatio={3 / 4}
          title={'调整图片'}
          onlineImageSeed={imageEditorOnlineSeed}
          onSelectOnlineImage={
            imageEditorOnlineSeed?.provider === 'bangumi'
              ? async (result) => {
                  const assetId = await attachOnlineImage(
                    node.id,
                    result,
                    imageEditorOnlineSeed,
                  )
                  if (!assetId) return false
                  setImageEditorAssetId(assetId)
                  return true
                }
              : undefined
          }
          onSearch={() => {
            setImageEditorAssetId(null)
            setShowImageSearch(true)
          }}
          onCancel={() => setImageEditorAssetId(null)}
          onApply={(imageTransform) => {
            update({ imageTransform })
            setImageEditorAssetId(null)
          }}
        />
      ) : null}
      {showImageSearch ? (
        <ImageSearchDialog
          cacheKey={node.id}
          initialQuery={node.name}
          initialKind={categorySearchKind(category?.name ?? '')}
          onClose={() => setShowImageSearch(false)}
          onCustomize={() => {
            setShowImageSearch(false)
            setShowCustomContent(true)
          }}
          onSelect={async (result) => {
            const assetId = await attachOnlineImage(node.id, result)
            if (!assetId) return false
            update({ name: result.name })
            setImageEditorAssetId(assetId)
            return true
          }}
        />
      ) : null}
      {showCustomContent ? (
        <TreeCustomDialog
          onClose={() => setShowCustomContent(false)}
          onConfirm={async ({ file, name }) => {
            if (file) {
              const assetId = await attachImage(node.id, file)
              if (!assetId) return false
              if (name) update({ name })
              setImageEditorAssetId(assetId)
              return true
            }
            if (!name) return false
            update({ name })
            return true
          }}
        />
      ) : null}
      {canvasChildTarget &&
      !showCanvasChildCustom &&
      canvasChildTarget.parentId === node.id ? (
        <ImageSearchDialog
          cacheKey={'canvas-child-' + canvasChildTarget.parentId}
          initialQuery={canvasChildTarget.parentName}
          initialKind={canvasChildTarget.initialKind}
          onClose={() => setCanvasChildTarget(null)}
          onCustomize={() => {
            setShowCanvasChildCustom(true)
          }}
          onSelect={async (result) => {
            const child = createCanvasChild(canvasChildTarget, result.name)
            setCanvasChildTarget(null)
            await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
            const assetId = await attachOnlineImage(child.id, result)
            if (!assetId) {
              removeNode(child.id)
              return false
            }
            dispatch({ type: 'node-selected', nodeId: child.id })
            // The child-search dialog has already been closed above.
            return false
          }}
        />
      ) : null}
      {showCanvasChildCustom && canvasChildTarget ? (
        <TreeCustomDialog
          onClose={() => {
            setShowCanvasChildCustom(false)
            setCanvasChildTarget(null)
          }}
          onConfirm={async ({ file, name }) => {
            if (!file && !name) return false
            const child = createCanvasChild(canvasChildTarget, name || '未命名')
            setShowCanvasChildCustom(false)
            setCanvasChildTarget(null)
            if (!file) {
              dispatch({ type: 'node-selected', nodeId: child.id })
              return true
            }
            await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
            const assetId = await attachImage(child.id, file)
            if (!assetId) return false
            dispatch({ type: 'node-selected', nodeId: child.id })
            return true
          }}
        />
      ) : null}
    </>
  )
}

interface EditorPanelProps {
  canvasNodeAction?: CanvasNodeActionRequest | null
  onCanvasNodeActionHandled?: () => void
}

export function EditorPanel({
  canvasNodeAction = null,
  onCanvasNodeActionHandled = () => undefined,
}: EditorPanelProps = {}) {
  const { state, dispatch } = useEditor()
  const [appearanceCategoryId, setAppearanceCategoryId] = useState<
    string | null
  >(null)
  const [showGlobalLabelSettings, setShowGlobalLabelSettings] = useState(false)
  const [showTextImport, setShowTextImport] = useState(false)
  const [showTextExport, setShowTextExport] = useState(false)
  const flatImportTargets: GraphTextFlatTarget[] = [
    ...state.document.categories.map((category) => ({
      id: category.id,
      kind: 'category' as const,
      label: (category.name || '未命名分类') + '（一级标签）',
    })),
    ...state.document.categories.flatMap((category) =>
      category.attributes.map((attribute) => ({
        id: attribute.id,
        kind: 'attribute' as const,
        label:
          (category.name || '未命名分类') +
          ' / ' +
          (attribute.name || '未命名属性') +
          '（二级标签）',
      })),
    ),
  ]

  if (showGlobalLabelSettings) {
    return (
      <aside className={'editor-panel'} aria-label={'全局标签设置面板'}>
        <GlobalLabelSettingsPanel
          onBack={() => setShowGlobalLabelSettings(false)}
          backLabel={appearanceCategoryId ? '返回分类设置' : '返回数据编辑'}
        />
      </aside>
    )
  }

  if (appearanceCategoryId) {
    return (
      <aside className={'editor-panel'} aria-label={'分类独立设置面板'}>
        <CategoryAppearancePanel
          categoryId={appearanceCategoryId}
          onBack={() => setAppearanceCategoryId(null)}
          onOpenGlobalSettings={() => setShowGlobalLabelSettings(true)}
        />
      </aside>
    )
  }

  const clearSelectedNodeOnBlankClick = (
    event: React.MouseEvent<HTMLElement>,
  ) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (
      target.closest('button, input, select, textarea, label, [role="dialog"]')
    ) {
      return
    }
    if (state.selectedNodeId) {
      dispatch({ type: 'node-selected', nodeId: null })
    }
  }

  return (
    <aside
      className="editor-panel"
      aria-label="数据编辑面板"
      onClick={clearSelectedNodeOnBlankClick}
    >
      <div className="panel-header">
        <div>
          <h2>数据</h2>
        </div>
        <div className={'panel-header-actions'}>
          <button
            type={'button'}
            className={'ghost-button is-rectangular-control'}
            aria-label={'导入文字'}
            onClick={() => setShowTextImport(true)}
          >
            导入数据
          </button>
          <button
            type={'button'}
            className={'ghost-button is-rectangular-control'}
            aria-label={'导出文字'}
            onClick={() => setShowTextExport(true)}
          >
            导出数据
          </button>
        </div>
      </div>
      <p className="sr-only">{state.statusMessage}</p>
      <SelectedNodeEditor
        key={state.selectedNodeId ?? 'none'}
        canvasNodeAction={canvasNodeAction}
        onCanvasNodeActionHandled={onCanvasNodeActionHandled}
      />
      <GraphTree onOpenCategoryAppearance={setAppearanceCategoryId} />
      {showTextImport ? (
        <GraphTextImportDialog
          flatTargets={flatImportTargets}
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
          onImportFlat={(target, names) => {
            if (target.kind === 'category') {
              dispatch({
                type: 'attributes-added',
                categoryId: target.id,
                attributes: names.map((name) => ({
                  ...createAttribute(),
                  name,
                })),
                at: timestamp(),
              })
            } else {
              dispatch({
                type: 'sub-attributes-added',
                attributeId: target.id,
                children: names.map((name) => ({
                  ...createSubAttribute(),
                  name,
                })),
                at: timestamp(),
              })
            }
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
    </aside>
  )
}
