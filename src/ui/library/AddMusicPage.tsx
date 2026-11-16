import { useRef, useState } from 'react'
import type { MusicLibrary } from '../../application/music-library'
import type {
  LocalSnapshot,
  BackupLocalRepository,
} from '../../domain/repositories/local-repository'
import { AlbumForm } from './AlbumForm'
import { JsonImportPanel } from './JsonImportPanel'
import { DiscographyImportPanel } from '../catalog/DiscographyImportPanel'
import { useNavigation } from '../navigation/navigation-context'
import { useDraftGuard, useDraftState } from '../navigation/draft-context'

type AddMode = 'manual' | 'search' | 'json'
export function AddMusicPage({
  snapshot,
  repository,
  library,
  onComplete,
  onCancel,
  onCommitted,
  onBusyChange,
  onImported,
}: {
  snapshot: LocalSnapshot
  repository: BackupLocalRepository
  library: MusicLibrary
  onComplete: (id: string, existing: boolean) => void
  onCancel: () => void
  onCommitted: () => Promise<LocalSnapshot>
  onBusyChange: (busy: boolean) => void
  onImported: (result?: { added: number; linked: number }) => void
}) {
  const [mode, setMode] = useDraftState<AddMode>('add-mode', 'mode', 'manual')
  const [jsonReview, setJsonReview] = useState(false)
  const [jsonBusy, setJsonBusy] = useState(false)
  const emptyForm = useRef<HTMLFormElement>(null)
  const navigation = useNavigation()
  useDraftGuard({
    id: 'json-add',
    label: 'Importación JSON',
    dirty: false,
    busy: jsonBusy,
    pendingRead: jsonReview,
    form: emptyForm,
  })
  function change(next: AddMode) {
    if (next === mode) return
    if (navigation) navigation.requestAction(() => setMode(next))
    else setMode(next)
  }
  return (
    <div className="add-music-page">
      <div
        className="add-mode-switch"
        role="group"
        aria-label="Cómo añadir música"
      >
        <button
          type="button"
          className="add-mode-card"
          aria-label="Buscar discografía"
          aria-pressed={mode === 'search'}
          onClick={() => change('search')}
        >
          <span>Buscar discografía</span>
          <small>Elige un artista y sus discos</small>
        </button>
        <button
          type="button"
          className="add-mode-card"
          aria-label="Registro manual"
          aria-pressed={mode === 'manual'}
          onClick={() => change('manual')}
        >
          <span>Registro manual</span>
          <small>Empieza con artista y título</small>
        </button>
      </div>
      <details
        className="add-other-methods"
        open={mode === 'json' || undefined}
      >
        <summary>Otras formas de añadir</summary>
        <button
          type="button"
          className="action-button"
          aria-pressed={mode === 'json'}
          onClick={() => change('json')}
        >
          Importar JSON
        </button>
      </details>
      {mode === 'manual' ? (
        <AlbumForm
          compact
          snapshot={snapshot}
          library={library}
          onComplete={onComplete}
          onCommitted={onCommitted}
          onCancel={onCancel}
        />
      ) : mode === 'search' ? (
        <DiscographyImportPanel
          snapshot={snapshot}
          repository={repository}
          onBusyChange={onBusyChange}
          onCommitted={onCommitted}
          onImported={onImported}
        />
      ) : (
        <JsonImportPanel
          repository={repository}
          blocked={false}
          onBusyChange={(busy) => {
            setJsonBusy(busy)
            onBusyChange(busy)
          }}
          onReviewChange={setJsonReview}
          onCommitted={onCommitted}
          onImported={() => onImported()}
        />
      )}
    </div>
  )
}
