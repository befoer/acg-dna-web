import { EditorWorkspace } from './components/EditorWorkspace'
import { EditorProvider } from './editor/EditorProvider'
import type { ProjectRepository } from './editor/persistence'

export interface AppProps {
  repository?: ProjectRepository | null
  autosaveDelayMs?: number
}

export default function App({ repository, autosaveDelayMs }: AppProps) {
  return (
    <EditorProvider repository={repository} autosaveDelayMs={autosaveDelayMs}>
      <EditorWorkspace />
    </EditorProvider>
  )
}
