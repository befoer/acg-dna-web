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
  attachImage: (nodeId: string, file: File) => Promise<void>
  removeImage: (nodeId: string) => void
  attachProfileAvatar: (file: File) => Promise<void>
  removeProfileAvatar: () => void
  removeNode: (nodeId: string) => void
  projects: ProjectSummary[]
  activeProjectId: string | null
  projectActionPending: boolean
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
