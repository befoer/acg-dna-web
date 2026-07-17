import { describe, expect, it } from 'vitest'

import {
  DEFAULT_IMAGE_TRANSFORM,
  createAttribute,
  createSubAttribute,
  createStarterGraph,
  decorationCustomTextLayerId,
  decorationImageLayerId,
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

  it('adds a batch of attributes as one undoable edit', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const attributes = [
      { ...createAttribute(), id: 'attribute-batch-a', name: '配乐' },
      { ...createAttribute(), id: 'attribute-batch-b', name: '演出' },
    ]
    const added = editorReducer(state, {
      type: 'attributes-added',
      categoryId: 'category-animation',
      attributes,
      at: NOW,
    })

    expect(
      added.document.categories[0]?.attributes
        .slice(-2)
        .map((item) => item.name),
    ).toEqual(['配乐', '演出'])
    expect(added.selectedNodeId).toBe('attribute-batch-b')
    expect(added.history.past).toHaveLength(1)

    const undone = editorReducer(added, {
      type: 'undo',
      at: '2026-07-15T12:00:01.000Z',
    })
    expect(
      undone.document.categories[0]?.attributes.some((item) =>
        item.id.startsWith('attribute-batch-'),
      ),
    ).toBe(false)
  })

  it('adds a batch of sub-attributes and rejects a missing parent', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const children = [
      { ...createSubAttribute(), id: 'sub-batch-a', name: '光影' },
      { ...createSubAttribute(), id: 'sub-batch-b', name: '构图' },
    ]
    const added = editorReducer(state, {
      type: 'sub-attributes-added',
      attributeId: 'attribute-visual',
      children,
      at: NOW,
    })
    const visual = added.document.categories
      .find((category) => category.id === 'category-animation')
      ?.attributes.find((attribute) => attribute.id === 'attribute-visual')

    expect(visual?.children.slice(-2).map((item) => item.name) ?? []).toEqual([
      '光影',
      '构图',
    ])
    expect(added.selectedNodeId).toBe('sub-batch-b')
    expect(
      editorReducer(state, {
        type: 'sub-attributes-added',
        attributeId: 'missing',
        children,
        at: NOW,
      }),
    ).toBe(state)
  })

  it('imports text categories in append or replace mode as one edit', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const imported = [
      {
        ...state.document.categories[0]!,
        id: 'category-imported',
        name: '导入分类',
        attributes: [],
      },
    ]
    const appended = editorReducer(state, {
      type: 'graph-text-imported',
      categories: imported,
      mode: 'append',
      at: NOW,
    })
    expect(appended.document.categories.at(-1)?.name).toBe('导入分类')
    expect(appended.history.past).toHaveLength(1)

    const replaced = editorReducer(state, {
      type: 'graph-text-imported',
      categories: imported,
      mode: 'replace',
      at: NOW,
    })
    expect(
      replaced.document.categories.map((category) => category.name),
    ).toEqual(['导入分类'])
    expect(replaced.selectedNodeId).toBe('category-imported')
  })

  it('removes replaced node assets and restores them with undo', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const asset = createTestAsset('asset-before-text-import')
    const attached = editorReducer(state, {
      type: 'asset-attached',
      nodeId: 'category-animation',
      asset,
      at: NOW,
    })
    const imported = [
      {
        ...state.document.categories[0]!,
        id: 'category-text-replacement',
        name: '文本分类',
        attributes: [],
      },
    ]
    const replaced = editorReducer(attached, {
      type: 'graph-text-imported',
      categories: imported,
      mode: 'replace',
      at: '2026-07-15T12:00:01.000Z',
    })
    expect(replaced.assets[asset.id]).toBeUndefined()

    const undone = editorReducer(replaced, {
      type: 'undo',
      at: '2026-07-15T12:00:02.000Z',
    })
    expect(undone.assets[asset.id]).toBe(asset)
    expect(
      findGraphNode(undone.document, 'category-animation')?.node.imageAssetId,
    ).toBe(asset.id)
  })

  it('reorders categories, attributes, and children within their own level', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const categoryMoved = editorReducer(state, {
      type: 'node-moved',
      nodeId: 'category-animation',
      direction: 'down',
      at: NOW,
    })
    expect(categoryMoved.document.categories[1]?.id).toBe('category-animation')

    const attributeMoved = editorReducer(categoryMoved, {
      type: 'node-moved',
      nodeId: 'attribute-visual',
      direction: 'up',
      at: NOW,
    })
    const animation = attributeMoved.document.categories.find(
      (category) => category.id === 'category-animation',
    )
    expect(animation?.attributes.map((attribute) => attribute.id)).toEqual([
      'attribute-visual',
      'attribute-story',
    ])

    const childMoved = editorReducer(attributeMoved, {
      type: 'node-moved',
      nodeId: 'sub-aftertaste',
      direction: 'up',
      at: NOW,
    })
    const story = childMoved.document.categories
      .find((category) => category.id === 'category-animation')
      ?.attributes.find((attribute) => attribute.id === 'attribute-story')
    expect(story?.children.map((child) => child.id)).toEqual([
      'sub-aftertaste',
      'sub-world',
    ])
    expect(childMoved.selectedNodeId).toBe(state.selectedNodeId)
  })

  it('does not create history when a node cannot move farther', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const next = editorReducer(state, {
      type: 'node-moved',
      nodeId: 'category-animation',
      direction: 'up',
      at: NOW,
    })

    expect(next).toBe(state)
  })

  it('undoes a node reorder as one structural edit', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const moved = editorReducer(state, {
      type: 'node-moved',
      nodeId: 'sub-world',
      direction: 'down',
      at: NOW,
    })
    const undone = editorReducer(moved, {
      type: 'undo',
      at: '2026-07-15T12:00:01.000Z',
    })
    const story = undone.document.categories[0]?.attributes[0]

    expect(story?.children.map((child) => child.id)).toEqual([
      'sub-world',
      'sub-aftertaste',
    ])
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

  it('changes and clamps custom canvas dimensions as an undoable edit', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const resized = editorReducer(state, {
      type: 'canvas-size-changed',
      width: 120,
      height: 9000,
      at: NOW,
    })

    expect(resized.document.canvas).toMatchObject({
      width: 320,
      height: 4096,
      templateId: 'custom',
    })
    expect(resized.statusMessage).toBe('画布尺寸已更新为 320 × 4096')

    const undone = editorReducer(resized, {
      type: 'undo',
      at: '2026-07-15T12:00:01.000Z',
    })
    expect(undone.document.canvas.width).toBe(state.document.canvas.width)
    expect(undone.document.canvas.height).toBe(state.document.canvas.height)
  })

  it('does not create history when the canvas size is unchanged', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const next = editorReducer(state, {
      type: 'canvas-size-changed',
      width: state.document.canvas.width,
      height: state.document.canvas.height,
      at: NOW,
    })

    expect(next).toBe(state)
  })

  it('keeps a built-in template canvas size locked', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const templated = editorReducer(state, {
      type: 'template-applied',
      templateId: 'cute-pink',
      at: NOW,
    })
    const resized = editorReducer(templated, {
      type: 'canvas-size-changed',
      width: 1600,
      height: 1600,
      at: NOW,
    })

    expect(resized).toBe(templated)
    expect(resized.document.canvas).toMatchObject({
      width: 1280,
      height: 1847,
      templateId: 'cute-pink',
    })
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
      avatarTransform: DEFAULT_IMAGE_TRANSFORM,
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

  it('adds, updates, removes, and restores a free decoration image', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const asset = createTestAsset('asset-decoration-image')
    const attached = editorReducer(state, {
      type: 'decoration-image-attached',
      asset,
      image: {
        id: 'decoration-image-one',
        name: '贴纸.png',
        assetId: asset.id,
        visible: true,
        x: 0.5,
        y: 0.5,
        size: 0.35,
        rotation: 0,
        opacity: 1,
      },
      at: NOW,
    })
    const updated = editorReducer(attached, {
      type: 'decoration-image-changed',
      imageId: 'decoration-image-one',
      patch: { x: 0.7, rotation: 30, opacity: 0.5 },
      group: 'transform',
      at: '2026-07-15T12:00:01.000Z',
    })

    expect(updated.document.decoration.images[0]).toMatchObject({
      x: 0.7,
      rotation: 30,
      opacity: 0.5,
    })
    expect(updated.assets[asset.id]).toBe(asset)
    expect(updated.document.decoration.layerOrder[0]).toBe(
      decorationImageLayerId('decoration-image-one'),
    )

    const removed = editorReducer(updated, {
      type: 'decoration-image-removed',
      imageId: 'decoration-image-one',
      assetId: asset.id,
      at: '2026-07-15T12:00:02.000Z',
    })
    expect(removed.document.decoration.images).toEqual([])
    expect(removed.assets[asset.id]).toBeUndefined()
    expect(removed.document.decoration.layerOrder).not.toContain(
      decorationImageLayerId('decoration-image-one'),
    )

    const undone = editorReducer(removed, {
      type: 'undo',
      at: '2026-07-15T12:00:03.000Z',
    })
    expect(undone.assets[asset.id]).toBe(asset)
    expect(undone.document.decoration.images[0]).toMatchObject({
      id: 'decoration-image-one',
      x: 0.7,
      opacity: 0.5,
    })
  })

  it('selects a decoration image for canvas editing without document history', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const selected = editorReducer(state, {
      type: 'decoration-image-selected',
      imageId: 'decoration-image-one',
    })

    expect(selected.editingDecorationImageId).toBe('decoration-image-one')
    expect(selected.selectedNodeId).toBeNull()
    expect(selected.editingCustomTextId).toBeNull()
    expect(selected.history.past).toEqual([])
  })

  it('synchronizes custom text layers and mutually exclusive canvas selection', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const withText = editorReducer(state, {
      type: 'profile-settings-changed',
      patch: {
        customTexts: [
          {
            id: 'text-one',
            text: '测试文字',
            x: 0.2,
            y: 0.2,
            fontSize: 24,
            color: '#000000',
            rotation: 0,
            fontWeight: 500,
            fontFamily: 'sans',
            maxWidth: 0.5,
            maxHeight: 0.5,
            visible: true,
            strokeWidth: 0,
            strokeColor: '#ffffff',
          },
        ],
      },
      at: NOW,
    })
    expect(withText.document.decoration.layerOrder).toContain(
      decorationCustomTextLayerId('text-one'),
    )

    const selected = editorReducer(withText, {
      type: 'decoration-frame-selected',
      frameId: 'frame-one',
    })
    expect(selected.editingDecorationFrameId).toBe('frame-one')
    expect(selected.editingCustomTextId).toBeNull()
    expect(selected.editingDecorationImageId).toBeNull()
    expect(selected.selectedNodeId).toBeNull()
    expect(selected.history).toBe(withText.history)
  })

  it('updates a node image transform as one undoable document edit', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const asset = createTestAsset('asset-transform')
    const attached = editorReducer(state, {
      type: 'asset-attached',
      nodeId: 'attribute-story',
      asset,
      at: NOW,
    })
    const transformed = editorReducer(attached, {
      type: 'node-updated',
      nodeId: 'attribute-story',
      patch: {
        imageTransform: {
          zoom: 2,
          offsetX: 0.25,
          offsetY: -0.5,
          rotation: 30,
        },
      },
      at: '2026-07-15T12:00:01.000Z',
    })

    expect(
      findGraphNode(transformed.document, 'attribute-story')?.node
        .imageTransform,
    ).toEqual({
      zoom: 2,
      offsetX: 0.25,
      offsetY: -0.5,
      rotation: 30,
    })
    const undone = editorReducer(transformed, {
      type: 'undo',
      at: '2026-07-15T12:00:02.000Z',
    })
    expect(
      findGraphNode(undone.document, 'attribute-story')?.node.imageTransform,
    ).toEqual(DEFAULT_IMAGE_TRANSFORM)
  })

  it('updates and resets one category appearance with undo support', () => {
    const state = createInitialEditorState(createStarterGraph(NOW))
    const updated = editorReducer(state, {
      type: 'category-appearance-changed',
      categoryId: 'category-animation',
      patch: {
        showLabelImages: false,
        fillFactor: 1.3,
        imageMask: 'black',
      },
      at: NOW,
    })

    expect(updated.document.categories[0]!.appearance).toMatchObject({
      showLabelImages: false,
      fillFactor: 1.3,
      imageMask: 'black',
    })
    expect(updated.document.categories[1]!.appearance).toBeUndefined()

    const reset = editorReducer(updated, {
      type: 'category-appearance-reset',
      categoryId: 'category-animation',
      at: '2026-07-15T12:00:01.000Z',
    })
    expect(reset.document.categories[0]!.appearance).toBeUndefined()

    const undone = editorReducer(reset, {
      type: 'undo',
      at: '2026-07-15T12:00:02.000Z',
    })
    expect(undone.document.categories[0]!.appearance?.fillFactor).toBe(1.3)
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
