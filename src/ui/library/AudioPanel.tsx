import { useRef, useState, type FormEvent } from 'react'
import type { LocalAudio } from '../../application/local-audio'
import { AudioError } from '../../domain/audio'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { useDraftGuard } from '../navigation/draft-context'
import { AudioEditor } from './AudioEditor'
import { LocalAudioPlayer } from './LocalAudioPlayer'
import { useAudioDraft } from './use-audio-draft'

export function AudioPanel({
  service,
  snapshot,
  entryId,
  blocked,
  onBusyChange,
  onCommitted,
}: {
  service: LocalAudio
  snapshot: LocalSnapshot
  entryId: string
  blocked: boolean
  onBusyChange: (value: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
}) {
  const id = `audio:${entryId}`
  const draft = useAudioDraft(id, snapshot.identity, service, entryId)
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [preparing, setPreparing] = useState(false),
    [pending, setPending] = useState(false),
    [failure, setFailure] = useState('')
  const form = useRef<HTMLFormElement>(null),
    lock = useRef(false),
    retry = useRef<HTMLButtonElement>(null)
  useDraftGuard({
    id,
    label: 'Audio personal',
    dirty: editing && draft.dirty,
    busy: busy || preparing,
    pendingRead: pending,
    form,
    ...(pending ? { focus: () => retry.current?.focus() } : {}),
  })
  const entry = snapshot.library.userAlbums.find((row) => row.id === entryId)!
  async function read() {
    try {
      await onCommitted()
      setPending(false)
      setEditing(false)
      onBusyChange(false)
      setFailure('')
    } catch {
      setFailure(
        'El audio se guardó, pero no pudimos actualizar la ficha. Reintenta la lectura para continuar.',
      )
      setPending(true)
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (lock.current || preparing || pending || blocked) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    try {
      await service.save(entryId, draft.value)
      draft.accept(entryId)
      setPending(true)
    } catch (error) {
      setFailure(
        error instanceof AudioError
          ? error.message
          : error instanceof LocalStorageError &&
              error.code === 'quota_exceeded'
            ? 'No hay espacio para guardar audio. Los archivos anteriores y tu borrador se conservan; retira archivos nuevos o libera espacio.'
            : 'No se pudo guardar el audio. Los archivos anteriores y tu borrador se conservan.',
      )
      onBusyChange(false)
      setBusy(false)
      lock.current = false
      return
    }
    await read()
    setBusy(false)
    lock.current = false
  }
  return (
    <section
      className="owned-panel local-audio-panel"
      aria-label="Audio en este dispositivo"
    >
      <h3 className="text-xl font-semibold">Audio en este dispositivo</h3>
      <p className="mt-3 text-sm text-muted">
        Tus archivos permanecen en este navegador. Para trasladarlos, usa el
        respaldo completo ZIP; la cuenta y el JSON no incluyen audio.
      </p>
      {failure ? (
        <p role="alert" className="mt-3">
          {failure}
        </p>
      ) : null}
      {pending ? (
        <button
          ref={retry}
          type="button"
          className="action-button mt-3"
          disabled={busy}
          onClick={() => {
            if (!lock.current) {
              lock.current = true
              setBusy(true)
              void read().finally(() => {
                setBusy(false)
                lock.current = false
              })
            }
          }}
        >
          Reintentar lectura del audio guardado
        </button>
      ) : null}
      {editing ? (
        <form
          ref={form}
          onSubmit={(event) => void save(event)}
          className="mt-4"
        >
          <AudioEditor
            value={draft.value}
            onChange={draft.set}
            service={service}
            tracks={snapshot.catalog.tracks.filter(
              (row) => row.albumId === entry.albumId,
            )}
            disabled={busy || pending}
            onBusyChange={setPreparing}
            outside={draft.value.outside}
            ready={draft.ready}
            error={draft.value.error}
            onReload={draft.reload}
          />
          <div className="form-actions mt-4">
            <button
              type="submit"
              className="primary-button"
              disabled={busy || preparing || pending || !draft.ready}
            >
              Guardar audio
            </button>
            <button
              type="button"
              className="action-button"
              disabled={busy || preparing || pending}
              onClick={() => {
                draft.reload()
                setEditing(false)
                setFailure('')
              }}
            >
              Descartar cambios de audio
            </button>
          </div>
        </form>
      ) : (
        <>
          {draft.value.error ? (
            <p role="alert" className="mt-3">
              {draft.value.error}
            </p>
          ) : null}
          {!draft.ready && !draft.value.error ? (
            <p role="status">Leyendo archivos locales…</p>
          ) : null}
          {draft.value.base.length ? (
            <ul className="mt-4 grid gap-4">
              {draft.value.base.map((row) => (
                <li key={row.id} className="audio-item">
                  <p className="font-semibold wrap-anywhere">{row.name}</p>
                  <p className="text-xs text-muted">
                    {row.container} · {(row.size / 1024 / 1024).toFixed(2)} MiB
                    {row.trackId
                      ? ` · ${snapshot.catalog.tracks.find((track) => track.id === row.trackId)?.title ?? 'Pista no disponible'}`
                      : ''}
                  </p>
                  <LocalAudioPlayer
                    key={`${row.id}:${row.sha256}`}
                    name={row.name}
                    disabled={blocked}
                    load={async (signal) => {
                      const file = await service.read(row.id, signal, row)
                      if (file.attachment.scope !== row.scope)
                        throw new AudioError(
                          'scope',
                          'La biblioteca cambió. Vuelve a abrir el álbum.',
                        )
                      return { bytes: file.bytes, mime: file.attachment.mime }
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : draft.ready ? (
            <p className="mt-3 text-sm text-muted">
              Aún no hay archivos propios asociados a este álbum.
            </p>
          ) : null}
          <div className="form-actions mt-4">
            <button
              type="button"
              className="action-button"
              disabled={blocked}
              onClick={() => setEditing(true)}
            >
              Gestionar audio
            </button>
            <button
              type="button"
              className="text-button"
              disabled={blocked}
              onClick={draft.reload}
            >
              Actualizar lista de audio
            </button>
          </div>
        </>
      )}
    </section>
  )
}
