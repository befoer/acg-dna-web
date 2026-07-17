import { createContext, useContext, type Dispatch } from 'react'

import type { EditorAction, EditorState } from './editorReducer'
import type { ProjectSummary } from './persistence'

export interface ProjectExport {
  blob: Blob
  fileName: string
}

export interface EditorContextValue {
  state: EditorState
  dispatch: Dispatch<EditorAction>
  attachImage: (nodeId: string, file: File) => Promise<string | null>
  removeImage: (nodeId: string) => void
  attachProfileAvatar: (file: File) => Promise<string | null>
  removeProfileAvatar: () => void
  attachDecorationImage: (file: File) => Promise<string | null>
  removeDecorationImage: (imageId: string) => void
  removeNode: (nodeId: string) => void
  projects: ProjectSummary[]
  activeProjectId: string | null
  projectActionPending: boolean
  retrySave: () => Promise<void>
  createProject: () => Promise<void>
  switchProject: (projectId: string) => Promise<void>
  duplicateProject: () => Promise<void>
  deleteProject: (projectId: string) => Promise<void>
  importProject: (file: File) => Promise<void>
  exportProject: () => Promise<ProjectExport>
}

export const EditorContext = createContext<EditorContextValue | null>(null)

export function useEditor(): EditorContextValue {
  const value = useContext(EditorContext)
  if (!value) {
    throw new Error('useEditor 必须在 EditorProvider 内使用')
  }
  return value
}
