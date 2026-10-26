import { useRef, useState, type FormEvent } from 'react'
import { genreRenameExpected } from '../../application/album-genre-ratings'
import {
  MusicUseCaseError,
  type MusicLibrary,
} from '../../application/music-library'
import { genreKey } from '../../domain/catalog/genre-key'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { useDraftGuard, useDraftState } from '../navigation/draft-context'

export function GenreRenameForm({
  snapshot,
  albumId,
  library,
  blocked,
  onBusyChange,
  onCommitted,
}: {
  snapshot: LocalSnapshot
  albumId: string
  library: MusicLibrary
  blocked: boolean
  onBusyChange: (value: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
}) {
  const id = `rename-genre:${albumId}`
  const [source, setSource] = useDraftState(id, 'source', '')
  const [target, setTarget] = useDraftState(id, 'target', '')
  const [expected, setExpected] = useDraftState<ReturnType<
    typeof genreRenameExpected
  > | null>(id, 'expected', null)
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [conflict, setConflict] = useState(false)
  const [failure, setFailure] = useState(''),
    [notice, setNotice] = useState('')
  const form = useRef<HTMLFormElement>(null),
    retry = useRef<HTMLButtonElement>(null),
    lock = useRef(false)
  useDraftGuard({
    id,
    label: 'Renombrar género',
    dirty: Boolean(source || target),
    busy,
    pendingRead: pending,
    form,
    ...(pending || conflict ? { focus: () => retry.current?.focus() } : {}),
  })
  const labels = [
    ...new Map(
      (
        snapshot.catalog.albums.find((row) => row.id === albumId)?.genres ?? []
      ).map((label) => [genreKey(label), label]),
    ).values(),
  ]
  function clear() {
    setSource('')
    setTarget('')
    setExpected(null)
    setConflict(false)
    setFailure('')
  }
  async function read(committed: boolean) {
    try {
      await onCommitted()
      clear()
      setPending(false)
      onBusyChange(false)
      setNotice(
        committed
          ? 'Género renombrado. Valoraciones, fechas y referencias conservadas.'
          : 'Datos guardados cargados. Vuelve a elegir el género.',
      )
    } catch {
      setFailure(
        committed
          ? 'El género se renombró, pero no pudimos actualizar la ficha. Reintenta sólo la lectura.'
          : 'No se pudieron cargar los datos guardados. El borrador se conserva.',
      )
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current || blocked || pending || conflict || !expected) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    setNotice('')
    try {
      await library.renameAlbumGenre({
        albumId,
        fromGenre: source,
        toGenre: target,
        expected,
      })
      setPending(true)
    } catch (error) {
      setFailure(
        error instanceof MusicUseCaseError
          ? error.message
          : 'No se pudo renombrar. Revisa el nombre. Los datos anteriores y tu borrador se conservan.',
      )
      setConflict(
        error instanceof MusicUseCaseError && error.code === 'outdated_genre',
      )
      setBusy(false)
      onBusyChange(false)
      lock.current = false
      return
    }
    await read(true)
    setBusy(false)
    lock.current = false
  }
  async function retryRead() {
    if (lock.current || (blocked && !pending)) return
    lock.current = true
    setBusy(true)
    await read(pending)
    setBusy(false)
    lock.current = false
  }
  return (
    <details className="mt-5 genre-ratings-fields">
      <summary>Renombrar un género conservando sus valoraciones</summary>
      <p className="mt-3 text-sm text-muted">
        Aplica a este álbum y conserva las notas de entradas activas y
        retiradas. No combina géneros ya asignados ni cambia las puntuaciones,
        fechas o ediciones de referencia.
      </p>
      <form
        ref={form}
        onSubmit={(event) => void save(event)}
        autoComplete="off"
      >
        <fieldset
          disabled={busy || pending || blocked}
          className="mt-4 grid min-w-0 gap-4"
        >
          <label>
            <span className="field-label">Género a renombrar</span>
            <select
              value={source}
              required
              onChange={(event) => {
                const value = event.target.value
                setSource(value)
                setExpected(
                  value ? genreRenameExpected(snapshot, albumId, value) : null,
                )
                setFailure('')
                setNotice('')
              }}
            >
              <option value="">Elige un género</option>
              {source && !labels.includes(source) ? (
                <option value={source}>{source} (cambió)</option>
              ) : null}
              {labels.map((label) => (
                <option key={genreKey(label)} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Nuevo nombre del género</span>
            <input
              value={target}
              required
              maxLength={80}
              onChange={(event) => {
                setTarget(event.target.value)
                setFailure('')
                setNotice('')
              }}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="action-button"
              disabled={!source || !target.trim() || conflict}
            >
              Confirmar renombrado
            </button>
            <button type="button" className="text-button" onClick={clear}>
              Cancelar renombrado
            </button>
          </div>
        </fieldset>
      </form>
      {failure ? (
        <p role="alert" className="field-error">
          {failure}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      ) : null}
      {pending || conflict ? (
        <button
          ref={retry}
          type="button"
          className="action-button mt-3"
          disabled={busy || (blocked && !pending)}
          onClick={() => void retryRead()}
        >
          {pending
            ? 'Reintentar lectura del género'
            : 'Cargar géneros guardados'}
        </button>
      ) : null}
    </details>
  )
}
