import { describe, expect, it } from 'vitest'

import {
  createSubAttribute,
  createStarterGraph,
  findGraphNode,
} from '../domain/graph'
import { createInitialEditorState, editorReducer } from './editorReducer'
import type { LocalImageAsset } from './assets'

const NOW = '2026-07-15T12:00:00.000Z'

function createTestAsset(id: string): LocalImageAsset {
  const blob = new Blob(['x'], { type: 'image/png' })
  return {
    id,
    fileName: `${id}.png`,
    mimeType: 'image/png',
    byteLength: blob.size,
    blob,
    objectUrl: `blob:${id}`,
    image: document.createElement('img'),
  }
}

describe('editor reducer', () => {
  it('updates a nested node without mutating the previous document', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))

    const next = editorReducer(state, {
      type: 'node-updated',
      nodeId: 'sub-world',
      patch: { name: '幻想世界', value: 91 },
      at: NOW,
    })

    expect(findGraphNode(next.document, 'sub-world')?.node).toMatchObject({
      name: '幻想世界',
      value: 91,
    })
    expect(findGraphNode(state.document, 'sub-world')?.node.name).toBe('世界观')
  })

  it('adds a third-level node and selects it', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const child = { ...createSubAttribute(), id: 'sub-new' }

    const next = editorReducer(state, {
      type: 'sub-attribute-added',
      attributeId: 'attribute-story',
      child,
      at: NOW,
    })

    expect(findGraphNode(next.document, 'sub-new')?.kind).toBe('subAttribute')
    expect(next.selectedNodeId).toBe('sub-new')
  })

  it('switches layout mode as a document setting', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))

    const next = editorReducer(state, {
      type: 'layout-mode-changed',
      mode: 'packing',
      at: NOW,
    })

    expect(next.document.canvas.layoutMode).toBe('packing')
    expect(next.statusMessage).toBe('已启用基础聚合布局')
    expect(next.revision).toBe(1)
    expect(next.persistence.status).toBe('dirty')
    expect(state.document.canvas.layoutMode).toBe('gravity')
  })

  it('updates APP profile fields and manages its local avatar asset', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const asset = createTestAsset('asset-profile')
    const updated = editorReducer(state, {
      type: 'profile-settings-changed',
      patch: {
        subTemplateId: 'cute_pink_1',
        nickname: '本地作者',
        gender: 'female',
      },
      at: NOW,
    })
    const attached = editorReducer(updated, {
      type: 'profile-avatar-attached',
      asset,
      at: NOW,
    })

    expect(attached.document.profile).toMatchObject({
      subTemplateId: 'cute_pink_1',
      nickname: '本地作者',
      gender: 'female',
      avatarAssetId: asset.id,
    })
    expect(attached.assets[asset.id]).toBe(asset)

    const removed = editorReducer(attached, {
      type: 'profile-avatar-removed',
      assetId: asset.id,
      at: NOW,
    })
    expect(removed.document.profile.avatarAssetId).toBeUndefined()
    expect(removed.assets[asset.id]).toBeUndefined()
  })

  it('applies a local template without replacing graph data or assets', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const asset = createTestAsset('asset-template')
    state.assets = { [asset.id]: asset }

    const applied = editorReducer(state, {
      type: 'template-applied',
      templateId: 'cute-pink',
      at: '2026-07-15T12:00:01.000Z',
    })

    expect(applied.document.canvas).toMatchObject({
      width: 1280,
      height: 1847,
      templateId: 'cute-pink',
      contentBounds: {
        left: 0.074,
        top: 0.253,
        right: 0.944,
        bottom: 0.943,
        rotation: -2,
      },
    })
    expect(applied.document.profile.subTemplateId).toBe('cute_pink_2')
    expect(applied.document.categories).toBe(state.document.categories)
    expect(applied.assets).toBe(state.assets)
    expect(applied.history.past).toHaveLength(1)

    const undone = editorReducer(applied, {
      type: 'undo',
      at: '2026-07-15T12:00:02.000Z',
    })
    expect(undone.document.canvas.templateId).toBe('custom')
    expect(undone.document.canvas.width).toBe(1380)
  })

  it('coalesces rapid changes to the same content-bounds control', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const originalBounds = state.document.canvas.contentBounds
    const first = editorReducer(state, {
      type: 'content-bounds-changed',
      bounds: { ...originalBounds, left: 0.08, right: 0.95 },
      group: 'x',
      at: '2026-07-15T12:00:00.100Z',
    })
    const second = editorReducer(first, {
      type: 'content-bounds-changed',
      bounds: {
        ...first.document.canvas.contentBounds,
        left: 0.1,
        right: 0.97,
      },
      group: 'x',
      at: '2026-07-15T12:00:00.500Z',
    })

    expect(second.history.past).toHaveLength(1)
    const undone = editorReducer(second, {
      type: 'undo',
      at: '2026-07-15T12:00:01.000Z',
    })
    expect(undone.document.canvas.contentBounds).toEqual(originalBounds)
  })

  it('updates global label settings with grouped history and undo', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const hiddenImages = editorReducer(state, {
      type: 'label-settings-changed',
      patch: { showImages: false },
      at: '2026-07-15T12:00:00.000Z',
    })
    const firstStroke = editorReducer(hiddenImages, {
      type: 'label-settings-changed',
      patch: { categoryStrokeWidth: 4 },
      group: 'category-stroke',
      at: '2026-07-15T12:00:01.100Z',
    })
    const secondStroke = editorReducer(firstStroke, {
      type: 'label-settings-changed',
      patch: { categoryStrokeWidth: 6 },
      group: 'category-stroke',
      at: '2026-07-15T12:00:01.500Z',
    })

    expect(secondStroke.document.canvas.labelSettings).toMatchObject({
      showImages: false,
      categoryStrokeWidth: 6,
    })
    expect(secondStroke.history.past).toHaveLength(2)

    const undoStroke = editorReducer(secondStroke, {
      type: 'undo',
      at: '2026-07-15T12:00:02.000Z',
    })
    expect(undoStroke.document.canvas.labelSettings).toMatchObject({
      showImages: false,
      categoryStrokeWidth: 2,
    })
    const undoImages = editorReducer(undoStroke, {
      type: 'undo',
      at: '2026-07-15T12:00:03.000Z',
    })
    expect(undoImages.document.canvas.labelSettings.showImages).toBe(true)
  })

  it('removes a category together with its descendants', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))

    const next = editorReducer(state, {
      type: 'node-removed',
      nodeId: 'category-animation',
      removedAssetIds: [],
      at: NOW,
    })

    expect(findGraphNode(next.document, 'category-animation')).toBeUndefined()
    expect(findGraphNode(next.document, 'attribute-story')).toBeUndefined()
    expect(findGraphNode(next.document, 'sub-world')).toBeUndefined()
  })

  it('rejects an image asset when its target node no longer exists', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const asset = createTestAsset('asset-orphan')

    const next = editorReducer(state, {
      type: 'asset-attached',
      nodeId: 'missing',
      asset,
      at: NOW,
    })

    expect(next).toBe(state)
  })

  it('coalesces rapid edits to the same field into one undo step', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const first = editorReducer(state, {
      type: 'node-updated',
      nodeId: 'attribute-story',
      patch: { name: '赛博' },
      at: '2026-07-15T12:00:00.100Z',
    })
    const second = editorReducer(first, {
      type: 'node-updated',
      nodeId: 'attribute-story',
      patch: { name: '赛博叙事' },
      at: '2026-07-15T12:00:00.500Z',
    })

    expect(second.history.past).toHaveLength(1)
    const undone = editorReducer(second, {
      type: 'undo',
      at: '2026-07-15T12:00:01.000Z',
    })
    expect(findGraphNode(undone.document, 'attribute-story')?.node.name).toBe(
      '叙事氛围',
    )
  })

  it('undoes and redoes a structural edit without breaking selection', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const child = { ...createSubAttribute(), id: 'sub-history' }
    const added = editorReducer(state, {
      type: 'sub-attribute-added',
      attributeId: 'attribute-story',
      child,
      at: '2026-07-15T12:01:00.000Z',
    })

    const undone = editorReducer(added, {
      type: 'undo',
      at: '2026-07-15T12:01:01.000Z',
    })
    expect(findGraphNode(undone.document, child.id)).toBeUndefined()
    expect(undone.selectedNodeId).toBe(state.selectedNodeId)

    const redone = editorReducer(undone, {
      type: 'redo',
      at: '2026-07-15T12:01:02.000Z',
    })
    expect(findGraphNode(redone.document, child.id)?.kind).toBe('subAttribute')
    expect(redone.selectedNodeId).toBe(child.id)
  })

  it('keeps replaced image assets available across undo and redo', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const firstAsset = createTestAsset('asset-first')
    const secondAsset = createTestAsset('asset-second')
    const first = editorReducer(state, {
      type: 'asset-attached',
      nodeId: 'attribute-story',
      asset: firstAsset,
      at: '2026-07-15T12:02:00.000Z',
    })
    const second = editorReducer(first, {
      type: 'asset-attached',
      nodeId: 'attribute-story',
      asset: secondAsset,
      replacedAssetId: firstAsset.id,
      at: '2026-07-15T12:02:01.000Z',
    })

    const undone = editorReducer(second, {
      type: 'undo',
      at: '2026-07-15T12:02:02.000Z',
    })
    expect(undone.assets[firstAsset.id]).toBe(firstAsset)
    expect(undone.assets[secondAsset.id]).toBeUndefined()
    expect(
      findGraphNode(undone.document, 'attribute-story')?.node.imageAssetId,
    ).toBe(firstAsset.id)

    const redone = editorReducer(undone, {
      type: 'redo',
      at: '2026-07-15T12:02:03.000Z',
    })
    expect(redone.assets[secondAsset.id]).toBe(secondAsset)
    expect(redone.assets[firstAsset.id]).toBeUndefined()
  })
})
