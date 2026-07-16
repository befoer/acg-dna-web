import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  collectNodeImageAssetIds,
  createEntityId,
  createStarterGraph,
  findGraphNode,
  type GraphDocument,
} from '../domain/graph'
import {
  loadLocalImageAsset,
  restoreLocalImageAsset,
  revokeLocalImageAsset,
  type LocalImageAsset,
} from './assets'
import { EditorContext } from './editorContext'
import { createInitialEditorState, editorReducer } from './editorReducer'
import {
  createBrowserProjectRepository,
  createPersistedSnapshot,
  persistenceErrorMessage,
  type PersistedEditorSnapshot,
  type ProjectRepository,
  type ProjectSummary,
} from './persistence'
import {
  createProjectFileBlob,
  createProjectFileName,
  readProjectFile,
  serializeProjectFile,
} from './projectFile'

interface EditorProviderProps {
  children: ReactNode
  initialDocument?: GraphDocument
  repository?: ProjectRepository | null
  autosaveDelayMs?: number
}

interface RestoredProjectAssets {
  assets: Record<string, LocalImageAsset>
  failedCount: number
}

const PROFILE_AVATAR_REQUEST_KEY = 'profile-avatar'

async function restoreProjectAssets(
  snapshot: PersistedEditorSnapshot,
): Promise<RestoredProjectAssets> {
  const restoredResults = await Promise.allSettled(
    snapshot.assets.map(restoreLocalImageAsset),
  )
  const assets: Record<string, LocalImageAsset> = {}
  let failedCount = 0
  restoredResults.forEach((result) => {
    if (result.status === 'fulfilled') {
      assets[result.value.id] = result.value
    } else {
      failedCount += 1
    }
  })
  return { assets, failedCount }
}

function summaryFromSnapshot(
  projectId: string,
  snapshot: PersistedEditorSnapshot,
): ProjectSummary {
  return {
    id: projectId,
    name: snapshot.document.name,
    createdAt: snapshot.document.createdAt,
    updatedAt: snapshot.document.updatedAt,
    savedAt: snapshot.savedAt,
  }
}

function upsertProjectSummary(
  projects: ProjectSummary[],
  summary: ProjectSummary,
): ProjectSummary[] {
  return [
    ...projects.filter((project) => project.id !== summary.id),
    summary,
  ].sort((left, right) => right.savedAt.localeCompare(left.savedAt))
}

export function EditorProvider({
  children,
  initialDocument,
  repository,
  autosaveDelayMs = 600,
}: EditorProviderProps) {
  const projectRepository = useMemo(
    () =>
      repository === undefined ? createBrowserProjectRepository() : repository,
    [repository],
  )
  const [state, dispatch] = useReducer(
    editorReducer,
    initialDocument,
    (document) => createInitialEditorState(document),
  )
  const [persistenceReady, setPersistenceReady] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projectActionPending, setProjectActionPending] = useState(false)
  const stateRef = useRef(state)
  const activeProjectIdRef = useRef<string | null>(null)
  const knownAssetsRef = useRef(new Map<string, LocalImageAsset>())
  const imageRequestTokensRef = useRef(new Map<string, symbol>())
  const mountedRef = useRef(false)
  const projectActionPendingRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const lastSavedRevisionRef = useRef(-1)

  const updateActiveProjectId = useCallback((projectId: string | null) => {
    activeProjectIdRef.current = projectId
    setActiveProjectId(projectId)
  }, [])

  const updateProjectActionPending = useCallback((pending: boolean) => {
    projectActionPendingRef.current = pending
    setProjectActionPending(pending)
  }, [])

  useEffect(() => {
    stateRef.current = state
    const liveAssets = new Map<string, LocalImageAsset>()
    const includeAssets = (assets: Record<string, LocalImageAsset>) => {
      Object.values(assets).forEach((asset) => liveAssets.set(asset.id, asset))
    }
    includeAssets(state.assets)
    state.history.past.forEach((snapshot) => includeAssets(snapshot.assets))
    state.history.future.forEach((snapshot) => includeAssets(snapshot.assets))

    liveAssets.forEach((asset, assetId) => {
      const knownAsset = knownAssetsRef.current.get(assetId)
      if (knownAsset && knownAsset !== asset) {
        revokeLocalImageAsset(knownAsset)
      }
      knownAssetsRef.current.set(assetId, asset)
    })
    knownAssetsRef.current.forEach((asset, assetId) => {
      if (liveAssets.has(assetId)) return
      revokeLocalImageAsset(asset)
      knownAssetsRef.current.delete(assetId)
    })
  }, [state])

  useEffect(() => {
    const requestTokens = imageRequestTokensRef.current
    const knownAssets = knownAssetsRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestTokens.clear()
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
      knownAssets.forEach(revokeLocalImageAsset)
      knownAssets.clear()
    }
  }, [])

  const enqueueSave = useCallback(
    (projectId: string, snapshot: PersistedEditorSnapshot) => {
      if (!projectRepository) {
        return Promise.reject(new Error('当前浏览器不支持 IndexedDB'))
      }
      const saveOperation = saveQueueRef.current
        .catch(() => undefined)
        .then(() => projectRepository.saveProject(projectId, snapshot))
      saveQueueRef.current = saveOperation.then(
        () => undefined,
        () => undefined,
      )
      return saveOperation
    },
    [projectRepository],
  )

  const refreshProjects = useCallback(async () => {
    if (!projectRepository) return
    setProjects(await projectRepository.listProjects())
  }, [projectRepository])

  const applyProjectSnapshot = useCallback(
    async (
      projectId: string,
      snapshot: PersistedEditorSnapshot,
      message: string,
      requireAllAssets = false,
      beforeApply?: () => Promise<void>,
      preRestored?: RestoredProjectAssets,
    ) => {
      const restored = preRestored ?? (await restoreProjectAssets(snapshot))
      if (requireAllAssets && restored.failedCount > 0) {
        Object.values(restored.assets).forEach(revokeLocalImageAsset)
        throw new Error('项目中的图片无法完整解码，已取消导入')
      }
      if (!mountedRef.current) {
        Object.values(restored.assets).forEach(revokeLocalImageAsset)
        return
      }
      try {
        await beforeApply?.()
      } catch (error) {
        Object.values(restored.assets).forEach(revokeLocalImageAsset)
        throw error
      }
      if (!mountedRef.current) {
        Object.values(restored.assets).forEach(revokeLocalImageAsset)
        return
      }
      updateActiveProjectId(projectId)
      lastSavedRevisionRef.current = 0
      dispatch({
        type: 'editor-restored',
        document: snapshot.document,
        assets: restored.assets,
        savedAt: snapshot.savedAt,
        message:
          restored.failedCount > 0
            ? message + '，但有 ' + restored.failedCount + ' 张图片无法读取'
            : message,
      })
    },
    [updateActiveProjectId],
  )

  const flushCurrentProject = useCallback(async () => {
    const projectId = activeProjectIdRef.current
    if (!projectRepository || !projectId) return
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const currentState = stateRef.current
    if (currentState.revision === lastSavedRevisionRef.current) return
    const revision = currentState.revision
    const savedAt = new Date().toISOString()
    const snapshot = createPersistedSnapshot(
      currentState.document,
      currentState.assets,
      savedAt,
    )
    dispatch({ type: 'persistence-status-changed', status: 'saving' })
    try {
      await enqueueSave(projectId, snapshot)
    } catch (error) {
      if (mountedRef.current && activeProjectIdRef.current === projectId) {
        dispatch({
          type: 'persistence-status-changed',
          status: 'error',
          errorMessage: persistenceErrorMessage(error),
        })
      }
      throw error
    }
    setProjects((current) =>
      upsertProjectSummary(current, summaryFromSnapshot(projectId, snapshot)),
    )
    if (
      mountedRef.current &&
      activeProjectIdRef.current === projectId &&
      stateRef.current.revision === revision
    ) {
      lastSavedRevisionRef.current = revision
      dispatch({
        type: 'persistence-status-changed',
        status: 'saved',
        savedAt,
      })
    }
  }, [enqueueSave, projectRepository])

  useEffect(() => {
    let cancelled = false
    lastSavedRevisionRef.current = -1

    if (!projectRepository) {
      const currentState = stateRef.current
      const snapshot = createPersistedSnapshot(
        currentState.document,
        currentState.assets,
        currentState.document.updatedAt,
      )
      updateActiveProjectId(currentState.document.id)
      setProjects([summaryFromSnapshot(currentState.document.id, snapshot)])
      dispatch({
        type: 'persistence-status-changed',
        status: 'unavailable',
        errorMessage: '当前浏览器不支持 IndexedDB',
      })
      setPersistenceReady(true)
      return
    }

    dispatch({ type: 'persistence-status-changed', status: 'restoring' })
    void (async () => {
      try {
        const [loadedProject, projectList] = await Promise.all([
          projectRepository.loadActiveProject(),
          projectRepository.listProjects(),
        ])
        if (cancelled) return

        if (!loadedProject) {
          const currentState = stateRef.current
          const savedAt = new Date().toISOString()
          const snapshot = createPersistedSnapshot(
            currentState.document,
            currentState.assets,
            savedAt,
          )
          await projectRepository.saveProject(
            currentState.document.id,
            snapshot,
          )
          await projectRepository.setActiveProject(currentState.document.id)
          if (cancelled) return
          await applyProjectSnapshot(
            currentState.document.id,
            snapshot,
            '已创建本地项目',
          )
          setProjects([summaryFromSnapshot(currentState.document.id, snapshot)])
          setPersistenceReady(true)
          return
        }

        if (stateRef.current.revision > 0) {
          const currentState = stateRef.current
          const savedAt = new Date().toISOString()
          const document = {
            ...currentState.document,
            id: createEntityId('graph'),
            createdAt: savedAt,
            updatedAt: savedAt,
          }
          const snapshot = createPersistedSnapshot(
            document,
            currentState.assets,
            savedAt,
          )
          await projectRepository.saveProject(document.id, snapshot)
          await projectRepository.setActiveProject(document.id)
          if (cancelled) return
          await applyProjectSnapshot(
            document.id,
            snapshot,
            '恢复期间的编辑已另存为新项目',
          )
          setProjects(
            upsertProjectSummary(
              projectList,
              summaryFromSnapshot(document.id, snapshot),
            ),
          )
          setPersistenceReady(true)
          return
        }

        await applyProjectSnapshot(
          loadedProject.projectId,
          loadedProject.snapshot,
          '已恢复本地项目',
        )
        if (cancelled) return
        setProjects(projectList)
        setPersistenceReady(true)
      } catch (error) {
        if (cancelled) return
        dispatch({
          type: 'persistence-status-changed',
          status: 'error',
          errorMessage: persistenceErrorMessage(error),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [applyProjectSnapshot, projectRepository, updateActiveProjectId])

  useEffect(() => {
    if (
      !projectRepository ||
      !persistenceReady ||
      !activeProjectId ||
      projectActionPending ||
      state.revision === lastSavedRevisionRef.current
    ) {
      return
    }

    const revision = state.revision
    const projectId = activeProjectId
    const snapshotDocument = state.document
    const snapshotAssets = state.assets
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(
      () => {
        saveTimerRef.current = null
        const savedAt = new Date().toISOString()
        const snapshot = createPersistedSnapshot(
          snapshotDocument,
          snapshotAssets,
          savedAt,
        )
        dispatch({ type: 'persistence-status-changed', status: 'saving' })

        const saveOperation = enqueueSave(projectId, snapshot)

        void saveOperation.then(
          () => {
            setProjects((current) =>
              upsertProjectSummary(
                current,
                summaryFromSnapshot(projectId, snapshot),
              ),
            )
            if (
              !mountedRef.current ||
              activeProjectIdRef.current !== projectId ||
              stateRef.current.revision !== revision
            ) {
              return
            }
            lastSavedRevisionRef.current = revision
            dispatch({
              type: 'persistence-status-changed',
              status: 'saved',
              savedAt,
            })
          },
          (error) => {
            if (
              !mountedRef.current ||
              activeProjectIdRef.current !== projectId ||
              stateRef.current.revision !== revision
            ) {
              return
            }
            dispatch({
              type: 'persistence-status-changed',
              status: 'error',
              errorMessage: persistenceErrorMessage(error),
            })
          },
        )
      },
      Math.max(0, autosaveDelayMs),
    )

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [
    autosaveDelayMs,
    activeProjectId,
    enqueueSave,
    persistenceReady,
    projectRepository,
    projectActionPending,
    state.assets,
    state.document,
    state.revision,
  ])

  const performProjectAction = useCallback(
    async (operation: () => Promise<void>) => {
      if (projectActionPendingRef.current) return
      updateProjectActionPending(true)
      imageRequestTokensRef.current.clear()
      try {
        await operation()
      } catch (error) {
        if (!mountedRef.current) return
        dispatch({
          type: 'status-changed',
          message: persistenceErrorMessage(error),
        })
      } finally {
        if (mountedRef.current) updateProjectActionPending(false)
      }
    },
    [updateProjectActionPending],
  )

  const switchProject = useCallback(
    async (projectId: string) => {
      if (projectId === activeProjectIdRef.current) return
      await performProjectAction(async () => {
        if (!projectRepository) {
          throw new Error('当前浏览器不支持多项目本地保存')
        }
        await flushCurrentProject()
        const snapshot = await projectRepository.loadProject(projectId)
        if (!snapshot) throw new Error('要打开的本地项目不存在')
        await applyProjectSnapshot(
          projectId,
          snapshot,
          '已切换本地项目',
          false,
          () => projectRepository.setActiveProject(projectId),
        )
        await refreshProjects()
      })
    },
    [
      applyProjectSnapshot,
      flushCurrentProject,
      performProjectAction,
      projectRepository,
      refreshProjects,
    ],
  )

  const createProject = useCallback(async () => {
    await performProjectAction(async () => {
      if (!projectRepository) {
        throw new Error('当前浏览器不支持多项目本地保存')
      }
      await flushCurrentProject()
      const savedAt = new Date().toISOString()
      const document = {
        ...createStarterGraph(savedAt),
        id: createEntityId('graph'),
        name: '未命名属性图',
      }
      const snapshot: PersistedEditorSnapshot = {
        document,
        assets: [],
        savedAt,
      }
      await projectRepository.saveProject(document.id, snapshot)
      await applyProjectSnapshot(
        document.id,
        snapshot,
        '已新建项目',
        false,
        () => projectRepository.setActiveProject(document.id),
      )
      await refreshProjects()
    })
  }, [
    applyProjectSnapshot,
    flushCurrentProject,
    performProjectAction,
    projectRepository,
    refreshProjects,
  ])

  const duplicateProject = useCallback(async () => {
    await performProjectAction(async () => {
      if (!projectRepository) {
        throw new Error('当前浏览器不支持多项目本地保存')
      }
      await flushCurrentProject()
      const currentState = stateRef.current
      const savedAt = new Date().toISOString()
      const document = {
        ...currentState.document,
        id: createEntityId('graph'),
        name: (
          (currentState.document.name.trim() || '未命名属性图') + ' 副本'
        ).slice(0, 48),
        createdAt: savedAt,
        updatedAt: savedAt,
      }
      const snapshot = createPersistedSnapshot(
        document,
        currentState.assets,
        savedAt,
      )
      await projectRepository.saveProject(document.id, snapshot)
      await applyProjectSnapshot(
        document.id,
        snapshot,
        '已复制项目',
        true,
        () => projectRepository.setActiveProject(document.id),
      )
      await refreshProjects()
    })
  }, [
    applyProjectSnapshot,
    flushCurrentProject,
    performProjectAction,
    projectRepository,
    refreshProjects,
  ])

  const importProject = useCallback(
    async (file: File) => {
      await performProjectAction(async () => {
        if (!projectRepository) {
          throw new Error('当前浏览器不支持项目导入后的本地保存')
        }
        dispatch({ type: 'status-changed', message: '正在校验项目文件…' })
        const imported = await readProjectFile(file)
        const validation = await restoreProjectAssets(imported)
        if (validation.failedCount > 0) {
          Object.values(validation.assets).forEach(revokeLocalImageAsset)
          throw new Error('项目中的图片无法完整解码，已取消导入')
        }
        await flushCurrentProject()
        const savedAt = new Date().toISOString()
        const document = {
          ...imported.document,
          id: createEntityId('graph'),
          createdAt: savedAt,
          updatedAt: savedAt,
        }
        const snapshot: PersistedEditorSnapshot = {
          document,
          assets: imported.assets,
          savedAt,
        }
        try {
          await projectRepository.saveProject(document.id, snapshot)
          await applyProjectSnapshot(
            document.id,
            snapshot,
            '项目文件已导入',
            true,
            () => projectRepository.setActiveProject(document.id),
            validation,
          )
        } catch (error) {
          if (activeProjectIdRef.current !== document.id) {
            Object.values(validation.assets).forEach(revokeLocalImageAsset)
          }
          throw error
        }
        await refreshProjects()
      })
    },
    [
      applyProjectSnapshot,
      flushCurrentProject,
      performProjectAction,
      projectRepository,
      refreshProjects,
    ],
  )

  const deleteProject = useCallback(
    async (projectId: string) => {
      await performProjectAction(async () => {
        if (!projectRepository) {
          throw new Error('当前浏览器不支持多项目本地保存')
        }
        const deletesActiveProject = projectId === activeProjectIdRef.current
        if (!deletesActiveProject) {
          await projectRepository.deleteProject(projectId)
          await refreshProjects()
          dispatch({ type: 'status-changed', message: '项目已删除' })
          return
        }

        await flushCurrentProject()
        const remainingProjects = (
          await projectRepository.listProjects()
        ).filter((project) => project.id !== projectId)
        const fallbackProject = remainingProjects[0]
        let fallbackSnapshot: PersistedEditorSnapshot
        let fallbackProjectId: string
        let fallbackMessage: string

        if (fallbackProject) {
          const storedFallback = await projectRepository.loadProject(
            fallbackProject.id,
          )
          if (!storedFallback) {
            throw new Error('删除前无法读取下一个本地项目')
          }
          fallbackProjectId = fallbackProject.id
          fallbackSnapshot = storedFallback
          fallbackMessage = '项目已删除，已打开下一个项目'
        } else {
          const savedAt = new Date().toISOString()
          const document = {
            ...createStarterGraph(savedAt),
            id: createEntityId('graph'),
            name: '未命名属性图',
          }
          fallbackProjectId = document.id
          fallbackSnapshot = {
            document,
            assets: [],
            savedAt,
          }
          fallbackMessage = '最后一个项目已删除，已新建项目'
          await projectRepository.saveProject(
            fallbackProjectId,
            fallbackSnapshot,
          )
        }

        await projectRepository.deleteProject(projectId)
        await applyProjectSnapshot(
          fallbackProjectId,
          fallbackSnapshot,
          fallbackMessage,
          false,
          () => projectRepository.setActiveProject(fallbackProjectId),
        )
        await refreshProjects()
      })
    },
    [
      applyProjectSnapshot,
      flushCurrentProject,
      performProjectAction,
      projectRepository,
      refreshProjects,
    ],
  )

  const exportProject = useCallback(async () => {
    const currentState = stateRef.current
    dispatch({ type: 'status-changed', message: '正在生成项目文件…' })
    try {
      const exportedAt = new Date().toISOString()
      const snapshot = createPersistedSnapshot(
        currentState.document,
        currentState.assets,
        exportedAt,
      )
      const text = await serializeProjectFile(snapshot, exportedAt)
      dispatch({ type: 'status-changed', message: '项目文件已导出' })
      return {
        blob: createProjectFileBlob(text),
        fileName: createProjectFileName(currentState.document.name),
      }
    } catch (error) {
      dispatch({
        type: 'status-changed',
        message: persistenceErrorMessage(error),
      })
      throw error
    }
  }, [])

  const attachImage = useCallback(async (nodeId: string, file: File) => {
    if (projectActionPendingRef.current) {
      dispatch({
        type: 'status-changed',
        message: '项目操作完成后再选择图片',
      })
      return
    }
    const requestToken = Symbol(nodeId)
    imageRequestTokensRef.current.set(nodeId, requestToken)
    dispatch({ type: 'status-changed', message: '正在读取本地图片…' })
    try {
      const asset = await loadLocalImageAsset(file)
      const currentState = stateRef.current
      const currentToken = imageRequestTokensRef.current.get(nodeId)
      const target = findGraphNode(currentState.document, nodeId)
      if (!mountedRef.current || currentToken !== requestToken || !target) {
        revokeLocalImageAsset(asset)
        return
      }

      imageRequestTokensRef.current.delete(nodeId)
      const previousAssetId = target.node.imageAssetId
      knownAssetsRef.current.set(asset.id, asset)
      dispatch({
        type: 'asset-attached',
        nodeId,
        asset,
        ...(previousAssetId ? { replacedAssetId: previousAssetId } : {}),
        at: new Date().toISOString(),
      })
    } catch (error) {
      if (imageRequestTokensRef.current.get(nodeId) !== requestToken) return
      imageRequestTokensRef.current.delete(nodeId)
      if (!mountedRef.current) return
      const message = error instanceof Error ? error.message : '图片读取失败'
      dispatch({ type: 'status-changed', message })
    }
  }, [])

  const removeImage = useCallback((nodeId: string) => {
    imageRequestTokensRef.current.delete(nodeId)
    const currentState = stateRef.current
    const assetId = findGraphNode(currentState.document, nodeId)?.node
      .imageAssetId
    if (!assetId) return
    dispatch({
      type: 'asset-removed',
      nodeId,
      assetId,
      at: new Date().toISOString(),
    })
  }, [])

  const attachProfileAvatar = useCallback(async (file: File) => {
    if (projectActionPendingRef.current) {
      dispatch({
        type: 'status-changed',
        message: '项目操作完成后再选择头像',
      })
      return
    }
    const requestToken = Symbol(PROFILE_AVATAR_REQUEST_KEY)
    imageRequestTokensRef.current.set(PROFILE_AVATAR_REQUEST_KEY, requestToken)
    dispatch({ type: 'status-changed', message: '正在读取本地头像…' })
    try {
      const asset = await loadLocalImageAsset(file)
      const currentToken = imageRequestTokensRef.current.get(
        PROFILE_AVATAR_REQUEST_KEY,
      )
      if (!mountedRef.current || currentToken !== requestToken) {
        revokeLocalImageAsset(asset)
        return
      }
      imageRequestTokensRef.current.delete(PROFILE_AVATAR_REQUEST_KEY)
      const previousAssetId = stateRef.current.document.profile.avatarAssetId
      knownAssetsRef.current.set(asset.id, asset)
      dispatch({
        type: 'profile-avatar-attached',
        asset,
        ...(previousAssetId ? { replacedAssetId: previousAssetId } : {}),
        at: new Date().toISOString(),
      })
    } catch (error) {
      if (
        imageRequestTokensRef.current.get(PROFILE_AVATAR_REQUEST_KEY) !==
        requestToken
      ) {
        return
      }
      imageRequestTokensRef.current.delete(PROFILE_AVATAR_REQUEST_KEY)
      if (!mountedRef.current) return
      dispatch({
        type: 'status-changed',
        message: error instanceof Error ? error.message : '头像读取失败',
      })
    }
  }, [])

  const removeProfileAvatar = useCallback(() => {
    imageRequestTokensRef.current.delete(PROFILE_AVATAR_REQUEST_KEY)
    const assetId = stateRef.current.document.profile.avatarAssetId
    if (!assetId) return
    dispatch({
      type: 'profile-avatar-removed',
      assetId,
      at: new Date().toISOString(),
    })
  }, [])

  const removeNode = useCallback((nodeId: string) => {
    const currentState = stateRef.current
    const removedMatch = findGraphNode(currentState.document, nodeId)
    for (const pendingNodeId of imageRequestTokensRef.current.keys()) {
      const pendingMatch = findGraphNode(currentState.document, pendingNodeId)
      const isInsideRemoval =
        pendingNodeId === nodeId ||
        (removedMatch?.kind === 'category' &&
          pendingMatch?.categoryId === nodeId) ||
        (removedMatch?.kind === 'attribute' &&
          pendingMatch?.parentId === nodeId)
      if (isInsideRemoval) imageRequestTokensRef.current.delete(pendingNodeId)
    }
    const removedAssetIds = collectNodeImageAssetIds(
      currentState.document,
      nodeId,
    )
    dispatch({
      type: 'node-removed',
      nodeId,
      removedAssetIds,
      at: new Date().toISOString(),
    })
  }, [])

  const value = useMemo(
    () => ({
      state,
      dispatch,
      attachImage,
      attachProfileAvatar,
      removeImage,
      removeProfileAvatar,
      removeNode,
      projects,
      activeProjectId,
      projectActionPending,
      createProject,
      switchProject,
      duplicateProject,
      deleteProject,
      importProject,
      exportProject,
    }),
    [
      activeProjectId,
      attachImage,
      attachProfileAvatar,
      createProject,
      deleteProject,
      duplicateProject,
      exportProject,
      importProject,
      projectActionPending,
      projects,
      removeImage,
      removeProfileAvatar,
      removeNode,
      state,
      switchProject,
    ],
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}
