import type {
  GraphAttribute,
  GraphCategory,
  GraphCategoryAppearance,
  GraphContentBounds,
  GraphDocument,
  GraphDecorationSettings,
  GraphDecorationImage,
  GraphImageTransform,
  GraphLabelSettings,
  GraphLayoutMode,
  GraphNode,
  GraphProfileSettings,
  GraphSubAttribute,
  GraphTemplateId,
} from '../domain/graph'
import {
  DEFAULT_IMAGE_TRANSFORM,
  createAppStarterGraph,
  decorationImageLayerId,
  findGraphNode,
  resolveDecorationLayerOrder,
} from '../domain/graph'
import { getDefaultProfileSubTemplateId } from '../domain/profileTemplates'
import { getGraphTemplate } from '../domain/templates'
import type { LocalImageAsset } from './assets'

export interface EditorState {
  document: GraphDocument
  selectedNodeId: string | null
  editingCustomTextId: string | null
  editingDecorationImageId: string | null
  editingDecorationFrameId: string | null
  assets: Record<string, LocalImageAsset>
  statusMessage: string
  revision: number
  persistence: EditorPersistenceState
  history: EditorHistoryState
}

export type PersistenceStatus =
  'restoring' | 'dirty' | 'saving' | 'saved' | 'error' | 'unavailable'

export interface EditorPersistenceState {
  status: PersistenceStatus
  lastSavedAt: string | null
  errorMessage: string | null
}

export interface EditorHistorySnapshot {
  document: GraphDocument
  selectedNodeId: string | null
  editingCustomTextId: string | null
  editingDecorationImageId: string | null
  editingDecorationFrameId: string | null
  assets: Record<string, LocalImageAsset>
}

export interface EditorHistoryState {
  past: EditorHistorySnapshot[]
  future: EditorHistorySnapshot[]
  lastGroup: string | null
  lastChangedAt: string | null
}

export interface GraphNodePatch {
  name?: string
  value?: number
  hidden?: boolean
  color?: string
  imageTransform?: GraphImageTransform
}

export type EditorAction =
  | { type: 'document-renamed'; name: string; at: string }
  | { type: 'background-changed'; color: string; at: string }
  | { type: 'canvas-size-changed'; width: number; height: number; at: string }
  | { type: 'layout-mode-changed'; mode: GraphLayoutMode; at: string }
  | { type: 'template-applied'; templateId: GraphTemplateId; at: string }
  | {
      type: 'label-settings-changed'
      patch: Partial<GraphLabelSettings>
      group?: string
      at: string
    }
  | {
      type: 'content-bounds-changed'
      bounds: GraphContentBounds
      group?: string
      at: string
    }
  | {
      type: 'profile-settings-changed'
      patch: Partial<GraphProfileSettings>
      group?: string
      at: string
    }
  | { type: 'custom-text-selected'; textId: string | null }
  | { type: 'decoration-image-selected'; imageId: string | null }
  | { type: 'decoration-frame-selected'; frameId: string | null }
  | { type: 'node-selected'; nodeId: string | null }
  | { type: 'node-updated'; nodeId: string; patch: GraphNodePatch; at: string }
  | {
      type: 'node-moved'
      nodeId: string
      direction: 'up' | 'down'
      at: string
    }
  | {
      type: 'category-appearance-changed'
      categoryId: string
      patch: GraphCategoryAppearance
      group?: string
      at: string
    }
  | { type: 'category-appearance-reset'; categoryId: string; at: string }
  | {
      type: 'graph-text-imported'
      categories: GraphCategory[]
      mode: 'replace' | 'append'
      at: string
    }
  | { type: 'category-added'; category: GraphCategory; at: string }
  | {
      type: 'attribute-added'
      categoryId: string
      attribute: GraphAttribute
      at: string
    }
  | {
      type: 'attributes-added'
      categoryId: string
      attributes: GraphAttribute[]
      at: string
    }
  | {
      type: 'sub-attribute-added'
      attributeId: string
      child: GraphSubAttribute
      at: string
    }
  | {
      type: 'sub-attributes-added'
      attributeId: string
      children: GraphSubAttribute[]
      at: string
    }
  | {
      type: 'node-removed'
      nodeId: string
      removedAssetIds: string[]
      at: string
    }
  | {
      type: 'asset-attached'
      nodeId: string
      asset: LocalImageAsset
      replacedAssetId?: string
      imageTransform?: GraphImageTransform
      at: string
    }
  | { type: 'asset-removed'; nodeId: string; assetId: string; at: string }
  | {
      type: 'profile-avatar-attached'
      asset: LocalImageAsset
      replacedAssetId?: string
      at: string
    }
  | { type: 'profile-avatar-removed'; assetId: string; at: string }
  | {
      type: 'decoration-settings-changed'
      patch: Partial<GraphDecorationSettings>
      group?: string
      at: string
    }
  | {
      type: 'decoration-image-attached'
      image: GraphDecorationImage
      asset: LocalImageAsset
      at: string
    }
  | {
      type: 'decoration-image-changed'
      imageId: string
      patch: Partial<Omit<GraphDecorationImage, 'id' | 'assetId'>>
      group?: string
      at: string
    }
  | {
      type: 'decoration-image-removed'
      imageId: string
      assetId: string
      at: string
    }
  | { type: 'status-changed'; message: string }
  | {
      type: 'editor-restored'
      document: GraphDocument
      assets: Record<string, LocalImageAsset>
      savedAt: string
      message?: string
    }
  | {
      type: 'persistence-status-changed'
      status: PersistenceStatus
      savedAt?: string
      errorMessage?: string
    }
  | { type: 'undo'; at: string }
  | { type: 'redo'; at: string }

export function createInitialEditorState(
  document = createAppStarterGraph(),
): EditorState {
  return {
    document,
    selectedNodeId: document.categories[0]?.attributes[0]?.id ?? null,
    editingCustomTextId: null,
    editingDecorationImageId: null,
    editingDecorationFrameId: null,
    assets: {},
    statusMessage: '编辑器已就绪',
    revision: 0,
    persistence: {
      status: 'restoring',
      lastSavedAt: null,
      errorMessage: null,
    },
    history: {
      past: [],
      future: [],
      lastGroup: null,
      lastChangedAt: null,
    },
  }
}

type EditorStateChange = Partial<
  Omit<EditorState, 'revision' | 'persistence' | 'history'>
>

const HISTORY_LIMIT = 60
const HISTORY_GROUP_WINDOW_MS = 900

interface HistoryGroup {
  key: string
  at: string
}

function historySnapshot(state: EditorState): EditorHistorySnapshot {
  return {
    document: state.document,
    selectedNodeId: state.selectedNodeId,
    editingCustomTextId: state.editingCustomTextId,
    editingDecorationImageId: state.editingDecorationImageId,
    editingDecorationFrameId: state.editingDecorationFrameId,
    assets: state.assets,
  }
}

function dirtyPersistence(
  persistence: EditorPersistenceState,
): EditorPersistenceState {
  const keepsFailureState =
    persistence.status === 'unavailable' || persistence.status === 'error'
  return {
    ...persistence,
    status: keepsFailureState ? persistence.status : 'dirty',
    errorMessage: keepsFailureState ? persistence.errorMessage : null,
  }
}

function markDirty(
  state: EditorState,
  changes: EditorStateChange,
  group?: HistoryGroup,
): EditorState {
  const changedAt = group ? Date.parse(group.at) : Number.NaN
  const previousChangedAt = state.history.lastChangedAt
    ? Date.parse(state.history.lastChangedAt)
    : Number.NaN
  const coalescesWithPrevious =
    Boolean(group) &&
    state.history.future.length === 0 &&
    state.history.lastGroup === group?.key &&
    Number.isFinite(changedAt) &&
    Number.isFinite(previousChangedAt) &&
    changedAt - previousChangedAt >= 0 &&
    changedAt - previousChangedAt <= HISTORY_GROUP_WINDOW_MS
  const past = coalescesWithPrevious
    ? state.history.past
    : [...state.history.past, historySnapshot(state)].slice(-HISTORY_LIMIT)

  return {
    ...state,
    ...changes,
    revision: state.revision + 1,
    persistence: dirtyPersistence(state.persistence),
    history: {
      past,
      future: [],
      lastGroup: group?.key ?? null,
      lastChangedAt: group?.at ?? null,
    },
  }
}

function touchDocument(document: GraphDocument, at: string): GraphDocument {
  return { ...document, updatedAt: at }
}

function patchNode<T extends GraphNode>(node: T, patch: GraphNodePatch): T {
  return { ...node, ...patch } as T
}

function updateNode(
  document: GraphDocument,
  nodeId: string,
  patch: GraphNodePatch,
): GraphDocument {
  return {
    ...document,
    categories: document.categories.map((category) => {
      if (category.id === nodeId) {
        return patchNode(category, patch)
      }

      return {
        ...category,
        attributes: category.attributes.map((attribute) => {
          if (attribute.id === nodeId) {
            return patchNode(attribute, patch)
          }

          return {
            ...attribute,
            children: attribute.children.map((child) =>
              child.id === nodeId ? patchNode(child, patch) : child,
            ),
          }
        }),
      }
    }),
  }
}

function updateCategoryAppearance(
  document: GraphDocument,
  categoryId: string,
  patch: GraphCategoryAppearance | null,
): GraphDocument {
  let changed = false
  const categories = document.categories.map((category) => {
    if (category.id !== categoryId) return category
    changed = true
    if (patch === null) {
      const next = { ...category }
      delete next.appearance
      return next
    }
    const appearance = { ...category.appearance, ...patch }
    Object.keys(appearance).forEach((key) => {
      if (appearance[key as keyof GraphCategoryAppearance] === undefined) {
        delete appearance[key as keyof GraphCategoryAppearance]
      }
    })
    if (Object.keys(appearance).length === 0) {
      const next = { ...category }
      delete next.appearance
      return next
    }
    return { ...category, appearance }
  })
  return changed ? { ...document, categories } : document
}

function setNodeImage(
  document: GraphDocument,
  nodeId: string,
  imageAssetId: string | undefined,
  imageTransform: GraphImageTransform = DEFAULT_IMAGE_TRANSFORM,
): GraphDocument {
  return {
    ...document,
    categories: document.categories.map((category) => {
      if (category.id === nodeId) {
        const next = { ...category }
        if (imageAssetId) {
          next.imageAssetId = imageAssetId
          next.imageTransform = { ...imageTransform }
        } else {
          delete next.imageAssetId
          delete next.imageTransform
        }
        return next
      }

      return {
        ...category,
        attributes: category.attributes.map((attribute) => {
          if (attribute.id === nodeId) {
            const next = { ...attribute }
            if (imageAssetId) {
              next.imageAssetId = imageAssetId
              next.imageTransform = { ...imageTransform }
            } else {
              delete next.imageAssetId
              delete next.imageTransform
            }
            return next
          }

          return {
            ...attribute,
            children: attribute.children.map((child) => {
              if (child.id !== nodeId) return child
              const next = { ...child }
              if (imageAssetId) {
                next.imageAssetId = imageAssetId
                next.imageTransform = { ...imageTransform }
              } else {
                delete next.imageAssetId
                delete next.imageTransform
              }
              return next
            }),
          }
        }),
      }
    }),
  }
}

function removeNode(document: GraphDocument, nodeId: string): GraphDocument {
  return {
    ...document,
    categories: document.categories
      .filter((category) => category.id !== nodeId)
      .map((category) => ({
        ...category,
        attributes: category.attributes
          .filter((attribute) => attribute.id !== nodeId)
          .map((attribute) => ({
            ...attribute,
            children: attribute.children.filter((child) => child.id !== nodeId),
          })),
      })),
  }
}

function collectCategoryAssetIds(categories: GraphCategory[]): string[] {
  const ids: string[] = []
  const add = (node: GraphNode) => {
    if (node.imageAssetId) ids.push(node.imageAssetId)
  }
  categories.forEach((category) => {
    add(category)
    category.attributes.forEach((attribute) => {
      add(attribute)
      attribute.children.forEach(add)
    })
  })
  return ids
}

function moveArrayItem<T>(
  items: T[],
  index: number,
  direction: 'up' | 'down',
): T[] | null {
  const targetIndex = index + (direction === 'up' ? -1 : 1)
  if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return null
  const next = [...items]
  ;[next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!]
  return next
}

function moveNode(
  document: GraphDocument,
  nodeId: string,
  direction: 'up' | 'down',
): GraphDocument {
  const match = findGraphNode(document, nodeId)
  if (!match) return document

  if (match.kind === 'category') {
    const categories = moveArrayItem(
      document.categories,
      document.categories.findIndex((category) => category.id === nodeId),
      direction,
    )
    return categories ? { ...document, categories } : document
  }

  if (match.kind === 'attribute') {
    let changed = false
    const categories = document.categories.map((category) => {
      if (category.id !== match.categoryId) return category
      const attributes = moveArrayItem(
        category.attributes,
        category.attributes.findIndex((attribute) => attribute.id === nodeId),
        direction,
      )
      if (!attributes) return category
      changed = true
      return { ...category, attributes }
    })
    return changed ? { ...document, categories } : document
  }

  let changed = false
  const categories = document.categories.map((category) => {
    if (category.id !== match.categoryId) return category
    return {
      ...category,
      attributes: category.attributes.map((attribute) => {
        if (attribute.id !== match.parentId) return attribute
        const children = moveArrayItem(
          attribute.children,
          attribute.children.findIndex((child) => child.id === nodeId),
          direction,
        )
        if (!children) return attribute
        changed = true
        return { ...attribute, children }
      }),
    }
  })
  return changed ? { ...document, categories } : document
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case 'document-renamed':
      return markDirty(
        state,
        {
          document: touchDocument(
            { ...state.document, name: action.name },
            action.at,
          ),
        },
        { key: 'document-name', at: action.at },
      )
    case 'background-changed':
      return markDirty(
        state,
        {
          document: touchDocument(
            {
              ...state.document,
              canvas: {
                ...state.document.canvas,
                backgroundColor: action.color,
                templateId: 'custom',
              },
            },
            action.at,
          ),
        },
        { key: 'canvas-background', at: action.at },
      )
    case 'canvas-size-changed': {
      if (state.document.canvas.templateId !== 'custom') return state
      const width = Math.min(4096, Math.max(320, Math.round(action.width)))
      const height = Math.min(4096, Math.max(320, Math.round(action.height)))
      if (
        width === state.document.canvas.width &&
        height === state.document.canvas.height
      ) {
        return state
      }
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            canvas: {
              ...state.document.canvas,
              width,
              height,
              templateId: 'custom',
            },
          },
          action.at,
        ),
        statusMessage: '画布尺寸已更新为 ' + width + ' × ' + height,
      })
    }
    case 'template-applied': {
      const template = getGraphTemplate(action.templateId)
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            canvas: {
              ...state.document.canvas,
              width: template.width,
              height: template.height,
              backgroundColor: template.backgroundColor,
              templateId: template.id,
              contentBounds: { ...template.contentBounds },
              labelSettings: {
                ...state.document.canvas.labelSettings,
                colorOverride: template.labelColorOverride,
                textColorOverride: template.labelTextColorOverride,
                categoryStrokeWidth: template.categoryStrokeWidth,
                labelStrokeWidth: template.labelStrokeWidth,
              },
            },
            profile: {
              ...state.document.profile,
              subTemplateId: getDefaultProfileSubTemplateId(template.id),
            },
          },
          action.at,
        ),
        statusMessage: '已应用模板：' + template.name,
      })
    }
    case 'content-bounds-changed':
      return markDirty(
        state,
        {
          document: touchDocument(
            {
              ...state.document,
              canvas: {
                ...state.document.canvas,
                contentBounds: { ...action.bounds },
              },
            },
            action.at,
          ),
          statusMessage: '标签范围已更新',
        },
        action.group
          ? { key: 'content-bounds:' + action.group, at: action.at }
          : undefined,
      )
    case 'label-settings-changed':
      return markDirty(
        state,
        {
          document: touchDocument(
            {
              ...state.document,
              canvas: {
                ...state.document.canvas,
                labelSettings: {
                  ...state.document.canvas.labelSettings,
                  ...action.patch,
                },
              },
            },
            action.at,
          ),
          statusMessage: '全局标签设置已更新',
        },
        action.group
          ? { key: 'label-settings:' + action.group, at: action.at }
          : undefined,
      )
    case 'profile-settings-changed': {
      const profile = {
        ...state.document.profile,
        ...action.patch,
      }
      const layerOrder = resolveDecorationLayerOrder(
        state.document.decoration,
        profile.customTexts.map((text) => text.id),
      )
      return markDirty(
        state,
        {
          document: touchDocument(
            {
              ...state.document,
              profile,
              decoration: {
                ...state.document.decoration,
                layerOrder,
                hiddenLayerIds: state.document.decoration.hiddenLayerIds.filter(
                  (id) => layerOrder.includes(id),
                ),
              },
            },
            action.at,
          ),
          statusMessage: '资料标题卡已更新',
          ...(action.patch.customTexts &&
          state.editingCustomTextId &&
          !action.patch.customTexts.some(
            (text) => text.id === state.editingCustomTextId,
          )
            ? { editingCustomTextId: null }
            : {}),
        },
        action.group
          ? { key: 'profile:' + action.group, at: action.at }
          : undefined,
      )
    }
    case 'custom-text-selected':
      return {
        ...state,
        editingCustomTextId: action.textId,
        editingDecorationImageId: null,
        editingDecorationFrameId: null,
        selectedNodeId: action.textId ? null : state.selectedNodeId,
      }
    case 'decoration-image-selected':
      return {
        ...state,
        editingDecorationImageId: action.imageId,
        editingCustomTextId: null,
        editingDecorationFrameId: null,
        selectedNodeId: action.imageId ? null : state.selectedNodeId,
      }
    case 'decoration-frame-selected':
      return {
        ...state,
        editingDecorationFrameId: action.frameId,
        editingDecorationImageId: null,
        editingCustomTextId: null,
        selectedNodeId: action.frameId ? null : state.selectedNodeId,
      }
    case 'layout-mode-changed':
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            canvas: {
              ...state.document.canvas,
              layoutMode: action.mode,
            },
          },
          action.at,
        ),
        statusMessage:
          action.mode === 'gravity' ? '已启用重力布局' : '已启用基础聚合布局',
      })
    case 'node-selected':
      return {
        ...state,
        selectedNodeId: action.nodeId,
        editingCustomTextId: null,
        editingDecorationImageId: null,
        editingDecorationFrameId: null,
      }
    case 'node-updated': {
      const patchKey = Object.keys(action.patch).sort().join(',')
      return markDirty(
        state,
        {
          document: touchDocument(
            updateNode(state.document, action.nodeId, action.patch),
            action.at,
          ),
        },
        { key: `node:${action.nodeId}:${patchKey}`, at: action.at },
      )
    }
    case 'node-moved': {
      const document = moveNode(state.document, action.nodeId, action.direction)
      if (document === state.document) return state
      return markDirty(state, {
        document: touchDocument(document, action.at),
        statusMessage: action.direction === 'up' ? '节点已上移' : '节点已下移',
      })
    }
    case 'category-appearance-changed': {
      const document = updateCategoryAppearance(
        state.document,
        action.categoryId,
        action.patch,
      )
      if (document === state.document) return state
      return markDirty(
        state,
        {
          document: touchDocument(document, action.at),
          statusMessage: '分类外观已更新',
        },
        action.group
          ? {
              key:
                'category-appearance:' + action.categoryId + ':' + action.group,
              at: action.at,
            }
          : undefined,
      )
    }
    case 'category-appearance-reset': {
      const match = findGraphNode(state.document, action.categoryId)
      if (
        match?.kind !== 'category' ||
        !(match.node as GraphCategory).appearance
      ) {
        return state
      }
      return markDirty(state, {
        document: touchDocument(
          updateCategoryAppearance(state.document, action.categoryId, null),
          action.at,
        ),
        statusMessage: '分类外观已恢复为全局设置',
      })
    }
    case 'graph-text-imported': {
      if (action.categories.length === 0) return state
      const replaces = action.mode === 'replace'
      const assets = { ...state.assets }
      if (replaces) {
        collectCategoryAssetIds(state.document.categories).forEach(
          (assetId) => delete assets[assetId],
        )
      }
      const categories = replaces
        ? action.categories
        : [...state.document.categories, ...action.categories]
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            categories,
          },
          action.at,
        ),
        assets,
        selectedNodeId: action.categories[0]?.id ?? state.selectedNodeId,
        statusMessage:
          (replaces ? '已替换为' : '已追加') +
          action.categories.length +
          ' 个文本分类',
      })
    }
    case 'category-added':
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            categories: [...state.document.categories, action.category],
          },
          action.at,
        ),
        selectedNodeId: action.category.id,
      })
    case 'attribute-added':
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            categories: state.document.categories.map((category) =>
              category.id === action.categoryId
                ? {
                    ...category,
                    attributes: [...category.attributes, action.attribute],
                  }
                : category,
            ),
          },
          action.at,
        ),
        selectedNodeId: action.attribute.id,
      })
    case 'attributes-added': {
      if (action.attributes.length === 0) return state
      const category = state.document.categories.find(
        (item) => item.id === action.categoryId,
      )
      if (!category) return state
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            categories: state.document.categories.map((item) =>
              item.id === action.categoryId
                ? {
                    ...item,
                    attributes: [...item.attributes, ...action.attributes],
                  }
                : item,
            ),
          },
          action.at,
        ),
        selectedNodeId: action.attributes.at(-1)?.id ?? state.selectedNodeId,
        statusMessage: '已添加 ' + action.attributes.length + ' 个属性',
      })
    }
    case 'sub-attribute-added':
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            categories: state.document.categories.map((category) => ({
              ...category,
              attributes: category.attributes.map((attribute) =>
                attribute.id === action.attributeId
                  ? {
                      ...attribute,
                      children: [...attribute.children, action.child],
                    }
                  : attribute,
              ),
            })),
          },
          action.at,
        ),
        selectedNodeId: action.child.id,
      })
    case 'sub-attributes-added': {
      if (action.children.length === 0) return state
      const match = findGraphNode(state.document, action.attributeId)
      if (match?.kind !== 'attribute') return state
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            categories: state.document.categories.map((category) => ({
              ...category,
              attributes: category.attributes.map((attribute) =>
                attribute.id === action.attributeId
                  ? {
                      ...attribute,
                      children: [...attribute.children, ...action.children],
                    }
                  : attribute,
              ),
            })),
          },
          action.at,
        ),
        selectedNodeId: action.children.at(-1)?.id ?? state.selectedNodeId,
        statusMessage: '已添加 ' + action.children.length + ' 个子属性',
      })
    }
    case 'node-removed': {
      const assets = { ...state.assets }
      action.removedAssetIds.forEach((assetId) => delete assets[assetId])
      const document = touchDocument(
        removeNode(state.document, action.nodeId),
        action.at,
      )
      return markDirty(state, {
        document,
        assets,
        selectedNodeId:
          state.selectedNodeId === action.nodeId
            ? (document.categories[0]?.id ?? null)
            : state.selectedNodeId,
        statusMessage: '节点已删除',
      })
    }
    case 'asset-attached': {
      if (!findGraphNode(state.document, action.nodeId)) return state
      const assets = { ...state.assets, [action.asset.id]: action.asset }
      if (action.replacedAssetId) delete assets[action.replacedAssetId]
      return markDirty(state, {
        document: touchDocument(
          setNodeImage(
            state.document,
            action.nodeId,
            action.asset.id,
            action.imageTransform,
          ),
          action.at,
        ),
        assets,
        statusMessage: `已载入 ${action.asset.fileName}`,
      })
    }
    case 'asset-removed': {
      const assets = { ...state.assets }
      delete assets[action.assetId]
      return markDirty(state, {
        document: touchDocument(
          setNodeImage(state.document, action.nodeId, undefined),
          action.at,
        ),
        assets,
        statusMessage: '本地图片已移除',
      })
    }
    case 'profile-avatar-attached': {
      const assets = { ...state.assets, [action.asset.id]: action.asset }
      if (action.replacedAssetId) delete assets[action.replacedAssetId]
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            profile: {
              ...state.document.profile,
              avatarAssetId: action.asset.id,
              avatarTransform: { ...DEFAULT_IMAGE_TRANSFORM },
            },
          },
          action.at,
        ),
        assets,
        statusMessage: '已载入资料头像 ' + action.asset.fileName,
      })
    }
    case 'profile-avatar-removed': {
      const assets = { ...state.assets }
      delete assets[action.assetId]
      const profile = { ...state.document.profile }
      delete profile.avatarAssetId
      delete profile.avatarTransform
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            profile,
          },
          action.at,
        ),
        assets,
        statusMessage: '资料头像已移除',
      })
    }
    case 'decoration-image-attached': {
      if (state.document.decoration.images.length >= 20) return state
      const layerId = decorationImageLayerId(action.image.id)
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            decoration: {
              ...state.document.decoration,
              images: [...state.document.decoration.images, action.image],
              layerOrder: [
                layerId,
                ...resolveDecorationLayerOrder(
                  state.document.decoration,
                  state.document.profile.customTexts.map((text) => text.id),
                ).filter((id) => id !== layerId),
              ],
            },
          },
          action.at,
        ),
        assets: { ...state.assets, [action.asset.id]: action.asset },
        statusMessage: '已添加装饰图片 ' + action.asset.fileName,
      })
    }
    case 'decoration-image-changed': {
      if (
        !state.document.decoration.images.some(
          (image) => image.id === action.imageId,
        )
      ) {
        return state
      }
      return markDirty(
        state,
        {
          document: touchDocument(
            {
              ...state.document,
              decoration: {
                ...state.document.decoration,
                images: state.document.decoration.images.map((image) =>
                  image.id === action.imageId
                    ? { ...image, ...action.patch }
                    : image,
                ),
              },
            },
            action.at,
          ),
          statusMessage: '装饰图片已更新',
        },
        action.group
          ? {
              key: 'decoration-image:' + action.imageId + ':' + action.group,
              at: action.at,
            }
          : undefined,
      )
    }
    case 'decoration-image-removed': {
      const image = state.document.decoration.images.find(
        (candidate) => candidate.id === action.imageId,
      )
      if (!image || image.assetId !== action.assetId) return state
      const assets = { ...state.assets }
      delete assets[action.assetId]
      const layerId = decorationImageLayerId(action.imageId)
      return markDirty(state, {
        document: touchDocument(
          {
            ...state.document,
            decoration: {
              ...state.document.decoration,
              images: state.document.decoration.images.filter(
                (candidate) => candidate.id !== action.imageId,
              ),
              layerOrder: state.document.decoration.layerOrder.filter(
                (id) => id !== layerId,
              ),
              hiddenLayerIds: state.document.decoration.hiddenLayerIds.filter(
                (id) => id !== layerId,
              ),
            },
          },
          action.at,
        ),
        assets,
        editingDecorationImageId:
          state.editingDecorationImageId === action.imageId
            ? null
            : state.editingDecorationImageId,
        statusMessage: '装饰图片已移除',
      })
    }
    case 'decoration-settings-changed':
      return markDirty(
        state,
        {
          document: touchDocument(
            {
              ...state.document,
              decoration: {
                ...state.document.decoration,
                ...action.patch,
              },
            },
            action.at,
          ),
          statusMessage: '背景装饰已更新',
          ...(action.patch.frames &&
          state.editingDecorationFrameId &&
          !action.patch.frames.some(
            (frame) => frame.id === state.editingDecorationFrameId,
          )
            ? { editingDecorationFrameId: null }
            : {}),
        },
        action.group
          ? { key: 'decoration:' + action.group, at: action.at }
          : undefined,
      )
    case 'status-changed':
      return { ...state, statusMessage: action.message }
    case 'editor-restored':
      return {
        ...state,
        document: action.document,
        assets: action.assets,
        selectedNodeId:
          action.document.categories[0]?.attributes[0]?.id ??
          action.document.categories[0]?.id ??
          null,
        editingCustomTextId: null,
        editingDecorationImageId: null,
        editingDecorationFrameId: null,
        statusMessage: action.message ?? '已恢复本地项目',
        revision: 0,
        persistence: {
          status: 'saved',
          lastSavedAt: action.savedAt,
          errorMessage: null,
        },
        history: {
          past: [],
          future: [],
          lastGroup: null,
          lastChangedAt: null,
        },
      }
    case 'persistence-status-changed':
      return {
        ...state,
        persistence: {
          status: action.status,
          lastSavedAt: action.savedAt ?? state.persistence.lastSavedAt,
          errorMessage: action.errorMessage ?? null,
        },
      }
    case 'undo': {
      const previous = state.history.past.at(-1)
      if (!previous) return state
      return {
        ...state,
        document: touchDocument(previous.document, action.at),
        selectedNodeId: previous.selectedNodeId,
        editingCustomTextId: previous.editingCustomTextId,
        editingDecorationImageId: previous.editingDecorationImageId,
        editingDecorationFrameId: previous.editingDecorationFrameId,
        assets: previous.assets,
        statusMessage: '已撤销',
        revision: state.revision + 1,
        persistence: dirtyPersistence(state.persistence),
        history: {
          past: state.history.past.slice(0, -1),
          future: [historySnapshot(state), ...state.history.future].slice(
            0,
            HISTORY_LIMIT,
          ),
          lastGroup: null,
          lastChangedAt: null,
        },
      }
    }
    case 'redo': {
      const next = state.history.future[0]
      if (!next) return state
      return {
        ...state,
        document: touchDocument(next.document, action.at),
        selectedNodeId: next.selectedNodeId,
        editingCustomTextId: next.editingCustomTextId,
        editingDecorationImageId: next.editingDecorationImageId,
        editingDecorationFrameId: next.editingDecorationFrameId,
        assets: next.assets,
        statusMessage: '已重做',
        revision: state.revision + 1,
        persistence: dirtyPersistence(state.persistence),
        history: {
          past: [...state.history.past, historySnapshot(state)].slice(
            -HISTORY_LIMIT,
          ),
          future: state.history.future.slice(1),
          lastGroup: null,
          lastChangedAt: null,
        },
      }
    }
  }
}

export function selectedNode(state: EditorState) {
  return state.selectedNodeId
    ? findGraphNode(state.document, state.selectedNodeId)
    : undefined
}
