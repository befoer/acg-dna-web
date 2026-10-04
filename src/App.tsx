import { EditorWorkspace } from './components/EditorWorkspace'
import type { GraphDocument } from './domain/graph'
import { EditorProvider } from './editor/EditorProvider'
import type { ProjectRepository } from './editor/persistence'

export interface AppProps {
  initialDocument?: GraphDocument
  repository?: ProjectRepository | null
  autosaveDelayMs?: number
}

export default function App({
  initialDocument,
  repository,
  autosaveDelayMs,
}: AppProps) {
  return (
    <EditorProvider
      initialDocument={initialDocument}
      repository={repository}
      autosaveDelayMs={autosaveDelayMs}
    >
      <EditorWorkspace />
    </EditorProvider>
  )
}
