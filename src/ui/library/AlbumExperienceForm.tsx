import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  MusicUseCaseError,
  type MusicLibrary,
} from '../../application/music-library'
import {
  listeningStatusSchema,
  type ListeningStatus,
  type UserAlbum,
} from '../../domain/library/schemas'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { listeningLabels } from './labels'

interface Props {
  entry: UserAlbum
  library: MusicLibrary
  blocked: boolean
  onCommitted: () => Promise<LocalSnapshot>
  onBusyChange: (busy: boolean) => void
}
function expectedExperience(entry: UserAlbum) {
  return {
    listeningStatus: entry.listeningStatus,
    updatedAt: entry.updatedAt,
    ...(entry.personalNotes === undefined
      ? {}
      : { personalNotes: entry.personalNotes }),
  }
}
export function AlbumExperienceForm({
  entry,
  library,
  blocked,
  onCommitted,
  onBusyChange,
}: Props) {
  const [status, setStatus] = useState<ListeningStatus>(entry.listeningStatus)
  const [notes, setNotes] = useState(entry.personalNotes ?? '')
  const [base, setBase] = useState(() => expectedExperience(entry))
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<UserAlbum>()
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const locked = useRef(false)
  const focusInput = useRef(false)
  const select = useRef<HTMLSelectElement>(null)
  const readButton = useRef<HTMLButtonElement>(null)
  const current = pending ?? entry
  useEffect(() => {
    if (busy) return
    if ((pending && failure) || conflict) readButton.current?.focus()
    else if (focusInput.current) {
      select.current?.focus()
      focusInput.current = false
    }
  }, [busy, pending, failure, conflict])
  async function synchronize(replaceDraft = false) {
    try {
      const snapshot = await onCommitted()
      const saved = snapshot.library.userAlbums.find(
        (row) => row.id === entry.id && row.deletedAt === undefined,
      )
      if (replaceDraft && saved) {
        setStatus(saved.listeningStatus)
        setNotes(saved.personalNotes ?? '')
        setBase(expectedExperience(saved))
        setConflict(false)
        setNotice('Datos guardados cargados. Puedes volver a editar.')
      }
      setPending(undefined)
      setFailure('')
      onBusyChange(false)
      focusInput.current = true
    } catch {
      setFailure(
        pending || !replaceDraft
          ? 'La experiencia se guardó, pero no pudimos actualizar la ficha. Reintenta la lectura para continuar.'
          : 'No se pudieron cargar los datos guardados. Tu borrador se conserva; vuelve a intentar.',
      )
    }
  }
  async function save() {
    if (locked.current || pending || blocked || conflict) return
    locked.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    setNotice('')
    try {
      const saved = await library.updatePersonalExperience(entry.id, {
        listeningStatus: status,
        personalNotes: notes,
        expected: base,
      })
      setStatus(saved.listeningStatus)
      setNotes(saved.personalNotes ?? '')
      setPending(saved)
      setBase(expectedExperience(saved))
      setNotice('Escucha y notas guardadas.')
    } catch (error) {
      if (
        error instanceof MusicUseCaseError &&
        error.code === 'outdated_experience'
      )
        setConflict(true)
      else
        setFailure(
          error instanceof LocalStorageError && error.code === 'quota_exceeded'
            ? 'No hay espacio para guardar la experiencia. El estado anterior se conserva, junto con tu borrador; libera espacio y vuelve a intentar.'
            : 'No se pudo guardar la experiencia. El estado anterior y tu borrador se conservan; vuelve a intentar.',
        )
      onBusyChange(false)
      setBusy(false)
      locked.current = false
      focusInput.current = true
      return
    }
    await synchronize()
    setBusy(false)
    locked.current = false
  }
  async function read(replaceDraft: boolean) {
    if (locked.current || (blocked && !pending)) return
    locked.current = true
    setBusy(true)
    onBusyChange(true)
    await synchronize(replaceDraft)
    setBusy(false)
    locked.current = false
    if (replaceDraft) onBusyChange(false)
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void save()
  }
  function edited() {
    setFailure('')
    setNotice('')
  }
  return (
    <section className="experience-panel" aria-labelledby="experience-title">
      <h3 id="experience-title" className="text-lg font-semibold">
        Tu experiencia personal
      </h3>
      <p className="mt-3 text-sm">
        {conflict ? 'Última escucha cargada:' : 'Escucha guardada:'}{' '}
        <strong className="text-accent-text">
          {listeningLabels[current.listeningStatus]}
        </strong>
      </p>
      <form onSubmit={submit} noValidate autoComplete="off">
        <fieldset
          disabled={busy || pending !== undefined || blocked}
          className="mt-5 min-w-0"
        >
          <div className="experience-fields">
            <div>
              <label className="field-label" htmlFor="listening-status">
                Estado de escucha
              </label>
              <select
                ref={select}
                id="listening-status"
                value={status}
                onChange={(event) => {
                  setStatus(listeningStatusSchema.parse(event.target.value))
                  edited()
                }}
              >
                {listeningStatusSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {listeningLabels[value]}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Puedes pasar directamente a cualquier estado. La escucha y la
                propiedad se registran por separado.
              </p>
            </div>
            <div>
              <label className="field-label" htmlFor="personal-notes">
                Notas personales
              </label>
              <textarea
                id="personal-notes"
                value={notes}
                rows={5}
                placeholder="Tus impresiones y recuerdos…"
                aria-describedby="personal-notes-help"
                onChange={(event) => {
                  setNotes(event.target.value)
                  edited()
                }}
              />
              <p
                id="personal-notes-help"
                className="mt-2 text-xs leading-relaxed text-muted"
              >
                Se guardan en este navegador. Se conservan espacios y saltos de
                línea; dejar el campo vacío quita tus notas personales.
              </p>
              <button
                type="button"
                className="text-button mt-2"
                disabled={notes.length === 0}
                onClick={() => {
                  setNotes('')
                  edited()
                }}
              >
                Limpiar notas del formulario
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="primary-button mt-5"
            disabled={conflict}
          >
            Guardar experiencia
          </button>
        </fieldset>
      </form>
      {notice ? (
        <p role="status" className="mt-3 text-sm text-accent-text">
          {notice}
        </p>
      ) : null}
      {failure || conflict ? (
        <p role="alert" className="field-error">
          {failure ||
            'Tu experiencia cambió desde que abriste esta ficha. El borrador se conserva. Cargar los datos guardados reemplaza el texto del formulario.'}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {pending || conflict
            ? 'Actualizando experiencia…'
            : 'Guardando experiencia…'}
        </p>
      ) : null}
      {pending && failure ? (
        <button
          ref={readButton}
          type="button"
          className="action-button mt-4"
          disabled={busy}
          onClick={() => {
            void read(false)
          }}
        >
          Reintentar lectura de experiencia
        </button>
      ) : conflict ? (
        <button
          ref={readButton}
          type="button"
          className="action-button mt-4"
          disabled={busy || blocked}
          onClick={() => {
            void read(true)
          }}
        >
          Cargar datos guardados
        </button>
      ) : null}
    </section>
  )
}
