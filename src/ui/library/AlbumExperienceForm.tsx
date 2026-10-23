import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  experienceExpected,
  type ExperienceExpected,
} from '../../application/album-experience'
import {
  MusicUseCaseError,
  type MusicLibrary,
} from '../../application/music-library'
import { listeningStatusSchema } from '../../domain/library/schemas'
import { unitsToScore } from '../../domain/library/scores'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { useDraftGuard, useDraftState } from '../navigation/draft-context'
import { parseRating } from './parse-rating'
import { formatScore, listeningLabels } from './labels'
import { releaseLabels } from './release-labels'

function draftFrom(saved: ExperienceExpected) {
  return {
    listeningStatus: saved.listeningStatus,
    notes: saved.personalNotes ?? '',
    score: saved.rating
      ? formatScore(unitsToScore(saved.rating.scoreUnits))
      : '',
    reference: saved.rating?.referenceReleaseId ?? '',
  }
}
export function AlbumExperienceForm({
  snapshot,
  entryId,
  library,
  blocked,
  onCommitted,
  onBusyChange,
  onComplete,
  onCancel,
}: {
  snapshot: LocalSnapshot
  entryId: string
  library: MusicLibrary
  blocked: boolean
  onCommitted: () => Promise<LocalSnapshot>
  onBusyChange: (busy: boolean) => void
  onComplete: () => void
  onCancel: () => void
}) {
  const draftId = `experience:${entryId}`
  const [base, setBase] = useDraftState(draftId, 'expected', () =>
    experienceExpected(snapshot, entryId),
  )
  const [draft, setDraft] = useDraftState(draftId, 'draft', () =>
    draftFrom(base),
  )
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [failure, setFailure] = useState('')
  const [validation, setValidation] = useState('')
  const [notice, setNotice] = useState('')
  const locked = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const entry = snapshot.library.userAlbums.find((row) => row.id === entryId)!
  const releases = snapshot.catalog.releases.filter(
    (release) => release.albumId === entry.albumId,
  )
  const labels = releaseLabels(releases)
  useDraftGuard({
    id: draftId,
    label: 'Mi experiencia',
    dirty: JSON.stringify(draft) !== JSON.stringify(draftFrom(base)),
    busy,
    pendingRead: pending,
    ...(pending || conflict ? { focus: () => retry.current?.focus() } : {}),
    form,
  })
  useEffect(() => {
    input.current?.focus()
  }, [])
  useEffect(() => {
    if (!busy && (pending || conflict) && failure) retry.current?.focus()
  }, [busy, pending, conflict, failure])
  function edit(change: Partial<typeof draft>) {
    setDraft((previous) => ({ ...previous, ...change }))
    setFailure('')
    setValidation('')
    setNotice('')
  }
  async function read(replace: boolean) {
    try {
      const fresh = await onCommitted()
      if (replace) {
        const saved = experienceExpected(fresh, entryId)
        setBase(saved)
        setDraft(draftFrom(saved))
        setConflict(false)
        setNotice('Datos guardados cargados. Puedes volver a editar.')
      }
      setFailure('')
      setPending(false)
      onBusyChange(false)
      if (!replace) onComplete()
    } catch {
      setFailure(
        pending || !replace
          ? 'La experiencia se guardó, pero no pudimos actualizar la ficha. Reintenta sólo la lectura para continuar.'
          : 'No se pudieron cargar los datos guardados. Tu borrador se conserva.',
      )
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current || pending || blocked || conflict) return
    const score = parseRating(draft.score)
    if (draft.score.trim() && score === undefined) {
      setValidation('Escribe una nota de 1 a 10 en pasos de 0,5.')
      input.current?.focus()
      return
    }
    locked.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    setNotice('')
    try {
      const saved = await library.saveAlbumExperience(entryId, {
        listeningStatus: draft.listeningStatus,
        personalNotes: draft.notes,
        ...(score === undefined
          ? {}
          : {
              rating: {
                score,
                ...(draft.reference
                  ? { referenceReleaseId: draft.reference }
                  : {}),
              },
            }),
        expected: base,
      })
      setBase(saved)
      setDraft(draftFrom(saved))
      setPending(true)
    } catch (error) {
      const outdated =
        error instanceof MusicUseCaseError &&
        error.code === 'outdated_experience'
      setConflict(outdated)
      setFailure(
        outdated
          ? 'Tu experiencia cambió desde que abriste el editor. El borrador se conserva; cargar los datos guardados lo reemplaza.'
          : error instanceof LocalStorageError &&
              error.code === 'quota_exceeded'
            ? 'No hay espacio para guardar la experiencia. Los datos anteriores y tu borrador se conservan.'
            : 'No se pudo guardar la experiencia. Revisa la nota y que la edición siga perteneciendo a este álbum. Los datos anteriores y el borrador se conservan.',
      )
      onBusyChange(false)
      setBusy(false)
      locked.current = false
      return
    }
    await read(false)
    setBusy(false)
    locked.current = false
  }
  async function retryRead() {
    if (locked.current || (blocked && !pending)) return
    locked.current = true
    setBusy(true)
    await read(conflict)
    setBusy(false)
    locked.current = false
  }
  return (
    <section className="experience-panel" aria-labelledby="experience-title">
      <h3 id="experience-title" className="text-xl font-semibold">
        Mi experiencia
      </h3>
      <p className="mt-3 text-sm text-muted">
        Escucha, nota, edición de referencia y comentario se guardan juntos. La
        nota del álbum es independiente de las pistas.
      </p>
      <form
        ref={form}
        onSubmit={(event) => void save(event)}
        noValidate
        autoComplete="off"
      >
        <fieldset
          disabled={busy || pending || blocked}
          className="mt-5 min-w-0 grid gap-5"
        >
          <label>
            <span className="field-label">Estado de escucha</span>
            <select
              value={draft.listeningStatus}
              onChange={(event) =>
                edit({
                  listeningStatus: listeningStatusSchema.parse(
                    event.target.value,
                  ),
                })
              }
            >
              {listeningStatusSchema.options.map((status) => (
                <option key={status} value={status}>
                  {listeningLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <div>
            <label className="field-label" htmlFor="album-score">
              Nota del álbum
            </label>
            <input
              ref={input}
              id="album-score"
              inputMode="decimal"
              value={draft.score}
              placeholder="Por ejemplo, 9,5"
              aria-invalid={Boolean(validation)}
              aria-describedby="album-score-help"
              onChange={(event) =>
                edit({
                  score: event.target.value,
                  ...(!event.target.value.trim() ? { reference: '' } : {}),
                })
              }
            />
            <p id="album-score-help" className="mt-2 text-xs text-muted">
              De 1 a 10, en pasos de 0,5. Coma o punto. Dejarla vacía guarda la
              experiencia sin nota.
            </p>
            {validation ? (
              <p role="alert" className="field-error">
                {validation}
              </p>
            ) : null}
          </div>
          <label>
            <span className="field-label">Edición de referencia</span>
            <select
              value={draft.reference}
              aria-label="Edición de referencia"
              disabled={!draft.score.trim()}
              onChange={(event) => edit({ reference: event.target.value })}
            >
              <option value="">Sin edición de referencia</option>
              {draft.reference && !labels.has(draft.reference) ? (
                <option value={draft.reference}>
                  Edición no disponible: revisa la selección
                </option>
              ) : null}
              {releases.map((release) => (
                <option key={release.id} value={release.id}>
                  {labels.get(release.id)}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-xs text-muted">
              {releases.length
                ? 'Ediciones añadidas a este álbum, aunque no las hayas adquirido. La selección contextualiza tu única nota.'
                : 'Aún no has añadido ediciones. Puedes valorar sin referencia.'}
            </span>
          </label>
          <label>
            <span className="field-label">Notas personales</span>
            <textarea
              aria-label="Notas personales"
              rows={4}
              value={draft.notes}
              placeholder="Tus impresiones y recuerdos…"
              onChange={(event) => edit({ notes: event.target.value })}
            />
            <span className="mt-2 block text-xs text-muted">
              Conservamos espacios y saltos de línea; dejarlo vacío quita el
              comentario.
            </span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="primary-button"
              disabled={conflict}
            >
              Guardar experiencia
            </button>
            <button
              type="button"
              className="action-button"
              onClick={(event) => {
                event.currentTarget.focus()
                onCancel()
              }}
            >
              Cancelar experiencia
            </button>
            <button
              type="button"
              className="text-button"
              disabled={!draft.score && !draft.reference}
              onClick={() => {
                edit({ score: '', reference: '' })
                setNotice(
                  'Nota y referencia retiradas del borrador. Guarda la experiencia para confirmar; escucha y comentario se conservan.',
                )
              }}
            >
              Quitar nota del borrador
            </button>
          </div>
        </fieldset>
      </form>
      {notice ? (
        <p role="status" className="mt-3 text-sm text-accent-text">
          {notice}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="field-error">
          {failure}
        </p>
      ) : null}
      {busy ? (
        <p role="status">
          {pending ? 'Actualizando experiencia…' : 'Guardando experiencia…'}
        </p>
      ) : null}
      {pending || conflict ? (
        <button
          ref={retry}
          type="button"
          className="action-button mt-4"
          disabled={busy || (blocked && !pending)}
          onClick={() => void retryRead()}
        >
          {pending
            ? 'Reintentar lectura de experiencia'
            : 'Cargar datos guardados'}
        </button>
      ) : null}
    </section>
  )
}
