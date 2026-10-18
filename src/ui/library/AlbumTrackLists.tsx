import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ZodError } from 'zod'
import type { MusicLibrary } from '../../application/music-library'
import {
  TrackListConflictError,
  trackListRows,
  trackListToken,
} from '../../application/track-lists'
import { addReleaseInputSchema } from '../../application/inputs'
import { saveTrackListInputSchema } from '../../application/track-lists'
import type { Catalog } from '../../domain/catalog/schemas'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import {
  emptyTrackDraft,
  contentLabels,
  formatDuration,
  parseDuration,
  type TrackDraft,
} from './track-list-drafts'
import { TrackListEditor } from './TrackListEditor'
import { TrackRatingForm } from './TrackRatingForm'
import type { TrackRating } from '../../domain/library/schemas'
import { unitsToScore } from '../../domain/library/scores'
import { formatScore } from './labels'
import { useDraftGuard, useDraftState } from '../navigation/draft-context'
import { useNavigation } from '../navigation/navigation-context'

const formatLabels: Record<string, string> = {
  vinyl: 'Vinilo',
  cd: 'CD',
  cassette: 'Casete',
  digital: 'Digital',
  other: 'Otro',
}
export function AlbumTrackLists({
  albumId,
  catalog,
  library,
  blocked,
  onBusyChange,
  onCommitted,
  entryId,
  ratings,
}: {
  albumId: string
  catalog: Catalog
  library: MusicLibrary
  blocked: boolean
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
  entryId: string
  ratings: TrackRating[]
}) {
  const [ratedTrackId, setRatedTrackId] = useState<string>()
  const [confirmedRating, setConfirmedRating] = useState<{
    trackId: string
    score: number | undefined
  }>()
  const panel = useRef<HTMLElement>(null)
  const draftId = `tracks:${entryId}`
  const navigation = useNavigation()
  const [target, setTarget] = useDraftState(draftId, 'target', 'core')
  const [mode, setMode] = useDraftState<'view' | 'edit' | 'create'>(
    draftId,
    'mode',
    'view',
  )
  const [rows, setRows] = useDraftState<TrackDraft[]>(draftId, 'rows', [])
  const [base, setBase] = useDraftState(draftId, 'base', '')
  const [initialRows, setInitialRows] = useDraftState(draftId, 'initial', '')
  const [editionName, setEditionName] = useDraftState(draftId, 'edition', '')
  const [format, setFormat] = useDraftState(draftId, 'format', 'cd')
  const [year, setYear] = useDraftState(draftId, 'year', '')
  const [copy, setCopy] = useDraftState(draftId, 'copy', true)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const alert = useRef<HTMLParagraphElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const focusPanel = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  useDraftGuard({
    id: draftId,
    label: mode === 'create' ? 'Nueva edición' : 'Lista de pistas',
    dirty:
      mode === 'edit'
        ? JSON.stringify(rows) !== initialRows
        : mode === 'create' &&
          Boolean(editionName || year || format !== 'cd' || !copy),
    busy,
    pendingRead: pending,
    ...(pending || conflict ? { focus: () => retry.current?.focus() } : {}),
    form,
  })
  useEffect(() => {
    if (mode !== 'view' || focusPanel.current) heading.current?.focus()
    focusPanel.current = false
  }, [mode])
  useEffect(() => {
    if (busy) return
    if (pending || conflict) retry.current?.focus()
    else if (error) alert.current?.focus()
  }, [busy, pending, conflict, error])
  const releaseId = target === 'core' ? undefined : target
  const releases = catalog.releases.filter(
    (release) => release.albumId === albumId,
  )
  const tracks = catalog.tracks.filter((track) => track.albumId === albumId)
  const scores = new Map(
    ratings
      .filter((rating) => rating.userAlbumId === entryId)
      .map((rating) => [rating.trackId, unitsToScore(rating.scoreUnits)]),
  )
  const ratedTrack = tracks.find((track) => track.id === ratedTrackId)
  if (confirmedRating) {
    if (confirmedRating.score === undefined)
      scores.delete(confirmedRating.trackId)
    else scores.set(confirmedRating.trackId, confirmedRating.score)
  }
  const saved = trackListRows(catalog, albumId, releaseId)
  const selected = releases.find((release) => release.id === releaseId)
  const title = selected
    ? `${selected.editionLabel ?? 'Edición sin nombre'} · ${formatLabels[selected.format]}`
    : 'Lista original'
  function withTrackClosed(action: () => void) {
    if (ratedTrackId && navigation)
      navigation.closeEditor(`track-rating:${entryId}:${ratedTrackId}`, action)
    else action()
  }
  function beginEdit() {
    withTrackClosed(startEdit)
  }
  function startEdit() {
    setRatedTrackId(undefined)
    const initial = saved.map((row) => ({
      ...emptyTrackDraft(row.trackNumber),
      source: row.trackId,
      disc: String(row.discNumber),
      ...('id' in row
        ? {
            occurrenceId: row.id,
            role: row.contentRole,
            displayTitle: row.displayTitleOverride ?? '',
            duration: formatDuration(row.durationMs),
          }
        : {}),
    }))
    setRows(initial)
    setInitialRows(JSON.stringify(initial))
    setBase(trackListToken(catalog, albumId, releaseId))
    setError('')
    setNotice('')
    setConflict(false)
    setMode('edit')
  }
  async function read(replaceDraft = false) {
    try {
      await onCommitted()
      setPending(false)
      setError('')
      setConflict(false)
      focusPanel.current = true
      setMode('view')
      if (replaceDraft)
        setNotice(
          'Datos actualizados. Abre el editor para empezar un nuevo borrador.',
        )
      onBusyChange(false)
    } catch {
      setError(
        replaceDraft
          ? 'No se pudo cargar la lista. Tu borrador se conserva; vuelve a intentar.'
          : 'El cambio se guardó, pero no pudimos actualizar las listas. Reintenta la lectura para continuar.',
      )
      if (replaceDraft) onBusyChange(false)
    }
  }
  async function commit(action: () => Promise<unknown>, message: string) {
    if (lock.current || blocked || pending || conflict) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (failure) {
      if (failure instanceof TrackListConflictError) {
        setConflict(true)
        setError(
          'Esta lista cambió desde que empezaste a editarla. Tu borrador se conserva. Cargar la lista guardada descarta el borrador explícitamente.',
        )
      } else
        setError(
          failure instanceof ZodError
            ? 'Revisa los títulos, las posiciones positivas y únicas por disco y las referencias al mismo álbum. El borrador se conserva.'
            : failure instanceof LocalStorageError &&
                failure.code === 'quota_exceeded'
              ? 'No hay espacio para guardar. La lista anterior y tu borrador se conservan; libera espacio y vuelve a intentar.'
              : 'No se pudo guardar. La lista anterior y tu borrador se conservan; vuelve a intentar.',
        )
      setBusy(false)
      onBusyChange(false)
      lock.current = false
      return
    }
    setPending(true)
    setNotice(message)
    await read()
    setBusy(false)
    lock.current = false
  }
  function submitList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void commit(async () => {
      const request = saveTrackListInputSchema.parse({
        albumId,
        ...(releaseId ? { releaseId } : {}),
        expected: base,
        rows: rows.map((row) => ({
          ...(row.occurrenceId ? { occurrenceId: row.occurrenceId } : {}),
          ...(row.source === 'new'
            ? {
                track: {
                  title: row.title,
                  ...(row.variant ? { variantOfTrackId: row.variant } : {}),
                  ...(row.version.trim() ? { versionLabel: row.version } : {}),
                },
              }
            : { trackId: row.source }),
          discNumber: Number(row.disc),
          trackNumber: Number(row.number),
          contentRole: row.role,
          ...(row.displayTitle.trim()
            ? { displayTitleOverride: row.displayTitle }
            : {}),
          ...(row.duration ? { durationMs: parseDuration(row.duration) } : {}),
        })),
      })
      await library.saveTrackList(request)
    }, 'Lista guardada.')
  }
  function submitEdition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void commit(async () => {
      const request = addReleaseInputSchema.parse({
        albumId,
        format,
        copyCoreTracks: copy,
        ...(editionName.trim() ? { editionLabel: editionName } : {}),
        ...(year ? { releaseYear: Number(year) } : {}),
      })
      const release = await library.addRelease(request)
      setTarget(release.id)
    }, 'Edición guardada dentro de este álbum.')
  }
  async function retryRead() {
    if (lock.current || (blocked && !pending)) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    await read(conflict)
    setBusy(false)
    lock.current = false
  }
  return (
    <section
      ref={panel}
      className="track-lists-panel"
      aria-labelledby="track-lists-title"
    >
      <h3 id="track-lists-title" className="text-xl font-semibold">
        Pistas y ediciones
      </h3>
      <p className="mt-3 text-sm text-muted">
        Cada edición conserva su propio orden. Reutiliza una pista cuando sea la
        misma versión musical; crea una variante para una demo, un directo o un
        remix diferente.
      </p>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="field-label min-w-0 flex-1">
          Lista que quieres consultar
          <select
            value={target}
            disabled={blocked || mode !== 'view'}
            onChange={(event) => {
              const next = event.target.value
              withTrackClosed(() => {
                setTarget(next)
                setRatedTrackId(undefined)
                setNotice('')
                setError('')
              })
            }}
          >
            <option value="core">Original — lista de referencia</option>
            {releases.map((release) => (
              <option key={release.id} value={release.id}>
                {release.editionLabel ?? 'Edición sin nombre'} ·{' '}
                {formatLabels[release.format]}
                {release.releaseYear ? ` · ${release.releaseYear}` : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="action-button"
          disabled={blocked || mode !== 'view'}
          onClick={() => {
            withTrackClosed(() => {
              setEditionName('')
              setRatedTrackId(undefined)
              setYear('')
              setFormat('cd')
              setCopy(true)
              setError('')
              setNotice('')
              setMode('create')
            })
          }}
        >
          Nueva edición
        </button>
      </div>
      {mode === 'view' ? (
        <>
          <h4
            ref={heading}
            tabIndex={-1}
            className="mt-6 text-lg font-semibold wrap-anywhere"
          >
            {title}
          </h4>
          {saved.length ? (
            <ol aria-label={title} className="track-list mt-4">
              {saved.map((row) => {
                const track = tracks.find((item) => item.id === row.trackId)
                return (
                  <li
                    key={
                      'id' in row
                        ? row.id
                        : `${row.discNumber}:${row.trackNumber}`
                    }
                    className="track-list-row"
                  >
                    <span className="text-muted">
                      {row.discNumber}.{row.trackNumber}
                    </span>
                    <div className="min-w-0 wrap-anywhere">
                      <span>
                        {'displayTitleOverride' in row
                          ? (row.displayTitleOverride ?? track?.title)
                          : track?.title}
                      </span>
                      {track?.versionLabel ? (
                        <span className="ml-2 text-sm text-muted">
                          ({track.versionLabel})
                        </span>
                      ) : null}
                      {track?.variantOfTrackId ? (
                        <p className="text-xs text-muted">
                          Variante de{' '}
                          {
                            tracks.find(
                              (item) => item.id === track.variantOfTrackId,
                            )?.title
                          }
                        </p>
                      ) : null}
                      {'contentRole' in row ? (
                        <p className="text-xs text-muted">
                          {contentLabels[row.contentRole]}
                          {row.durationMs
                            ? ` · ${formatDuration(row.durationMs)}`
                            : ''}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                        <span>
                          Nota:{' '}
                          <strong className="text-accent-text">
                            {scores.has(row.trackId)
                              ? `${formatScore(scores.get(row.trackId)!)} / 10`
                              : 'Sin nota'}
                          </strong>
                        </span>
                        <button
                          type="button"
                          className="text-button"
                          data-track-rating-id={row.trackId}
                          disabled={blocked}
                          onClick={() => {
                            if (ratedTrackId !== row.trackId)
                              withTrackClosed(() =>
                                setRatedTrackId(row.trackId),
                              )
                          }}
                        >
                          Valorar pista {track?.title}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Esta lista aún no tiene pistas.
            </p>
          )}
          <button
            type="button"
            className="primary-button mt-5"
            disabled={blocked}
            onClick={beginEdit}
          >
            {releaseId ? 'Editar lista de edición' : 'Editar lista original'}
          </button>
          {ratedTrack ? (
            <TrackRatingForm
              key={ratedTrack.id}
              entryId={entryId}
              trackId={ratedTrack.id}
              title={ratedTrack.title}
              score={scores.get(ratedTrack.id)}
              library={library}
              onConfirmed={(score) =>
                setConfirmedRating({ trackId: ratedTrack.id, score })
              }
              onCommitted={async () => {
                const snapshot = await onCommitted()
                setConfirmedRating(undefined)
                return snapshot
              }}
              onBusyChange={onBusyChange}
              blocked={blocked}
              onClose={() => {
                setRatedTrackId(undefined)
                panel.current
                  ?.querySelector<HTMLButtonElement>(
                    `[data-track-rating-id="${ratedTrack.id}"]`,
                  )
                  ?.focus()
              }}
            />
          ) : null}
        </>
      ) : (
        <>
          <h4
            ref={heading}
            tabIndex={-1}
            className="mt-6 text-lg font-semibold"
          >
            {mode === 'edit' ? `Editar ${title}` : 'Registrar edición'}
          </h4>
          <form
            ref={form}
            noValidate
            autoComplete="off"
            onSubmit={mode === 'edit' ? submitList : submitEdition}
          >
            <fieldset disabled={busy || blocked || pending} className="min-w-0">
              {mode === 'edit' ? (
                <TrackListEditor
                  rows={rows}
                  tracks={tracks}
                  edition={releaseId !== undefined}
                  onChange={(value) => {
                    setRows(value)
                    if (!conflict) setError('')
                  }}
                />
              ) : (
                <div className="track-fields mt-5">
                  <label className="field-label">
                    Nombre de edición
                    <input
                      placeholder="Original, Deluxe…"
                      value={editionName}
                      onChange={(event) => setEditionName(event.target.value)}
                    />
                  </label>
                  <label className="field-label">
                    Formato de edición
                    <select
                      value={format}
                      onChange={(event) => setFormat(event.target.value)}
                    >
                      {Object.entries(formatLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Año de edición
                    <input
                      type="number"
                      min="1"
                      max="9999"
                      value={year}
                      onChange={(event) => setYear(event.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={copy}
                      onChange={(event) => setCopy(event.target.checked)}
                    />
                    Copiar lista original
                  </label>
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={conflict}
                >
                  {mode === 'edit' ? 'Guardar lista' : 'Guardar edición'}
                </button>
                <button
                  type="button"
                  className="action-button"
                  onClick={() => {
                    setMode('view')
                    setError('')
                    setConflict(false)
                    focusPanel.current = true
                  }}
                >
                  Descartar borrador
                </button>
              </div>
            </fieldset>
          </form>
        </>
      )}
      {notice ? (
        <p role="status" className="mt-3 text-sm text-accent-text">
          {notice}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {pending ? 'Actualizando listas…' : 'Guardando…'}
        </p>
      ) : null}
      {error ? (
        <p ref={alert} role="alert" tabIndex={-1} className="field-error">
          {error}
        </p>
      ) : null}
      {pending || conflict ? (
        <button
          ref={retry}
          type="button"
          className="action-button mt-4"
          disabled={busy || (blocked && !pending)}
          onClick={() => {
            void retryRead()
          }}
        >
          {pending
            ? 'Reintentar lectura de listas'
            : 'Descartar borrador y cargar lista guardada'}
        </button>
      ) : null}
    </section>
  )
}
