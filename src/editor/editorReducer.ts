import type {
  GraphAttribute,
  GraphCategory,
  GraphContentBounds,
  GraphDocument,
  GraphLabelSettings,
  GraphLayoutMode,
  GraphNode,
  GraphSubAttribute,
  GraphTemplateId,
} from '../domain/graph'
import { createStarterGraph, findGraphNode } from '../domain/graph'
import { getGraphTemplate } from '../domain/templates'
import type { LocalImageAsset } from './assets'

export interface EditorState {
  document: GraphDocument
  selectedNodeId: string | null
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
}

export type EditorAction =
  | { type: 'document-renamed'; name: string; at: string }
  | { type: 'background-changed'; color: string; at: string }
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
  | { type: 'node-selected'; nodeId: string | null }
  | { type: 'node-updated'; nodeId: string; patch: GraphNodePatch; at: string }
  | { type: 'category-added'; category: GraphCategory; at: string }
  | {
      type: 'attribute-added'
      categoryId: string
      attribute: GraphAttribute
      at: string
    }
  | {
      type: 'sub-attribute-added'
      attributeId: string
      child: GraphSubAttribute
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
      at: string
    }
  | { type: 'asset-removed'; nodeId: string; assetId: string; at: string }
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
  document = createStarterGraph(),
): EditorState {
  return {
    document,
    selectedNodeId: document.categories[0]?.attributes[0]?.id ?? null,
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

function setNodeImage(
  document: GraphDocument,
  nodeId: string,
  imageAssetId: string | undefined,
): GraphDocument {
  return {
    ...document,
    categories: document.categories.map((category) => {
      if (category.id === nodeId) {
        const next = { ...category }
        if (imageAssetId) next.imageAssetId = imageAssetId
        else delete next.imageAssetId
        return next
      }

      return {
        ...category,
        attributes: category.attributes.map((attribute) => {
          if (attribute.id === nodeId) {
            const next = { ...attribute }
            if (imageAssetId) next.imageAssetId = imageAssetId
            else delete next.imageAssetId
            return next
          }

          return {
            ...attribute,
            children: attribute.children.map((child) => {
              if (child.id !== nodeId) return child
              const next = { ...child }
              if (imageAssetId) next.imageAssetId = imageAssetId
              else delete next.imageAssetId
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
      return { ...state, selectedNodeId: action.nodeId }
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
          setNodeImage(state.document, action.nodeId, action.asset.id),
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
