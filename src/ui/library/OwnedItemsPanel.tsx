import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ZodError } from 'zod'
import { LibraryChangeError } from '../../domain/library/library'
import type { MusicLibrary } from '../../application/music-library'
import {
  ownedItemMatchesRelease,
  ownedMediumSchema,
  ownedFormatSchema,
  conditionSchema,
  type OwnedItem,
} from '../../domain/library/owned-items'
import type { Release } from '../../domain/catalog/schemas'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { useDraftGuard, useDraftState } from '../navigation/draft-context'
import { useNavigation } from '../navigation/navigation-context'
import { releaseLabels } from './release-labels'
import {
  ownedMediumLabels,
  ownedFormatLabels,
  conditionLabels,
  ownedItemLabel,
  ownedItemLabels,
} from './owned-labels'

type ConfirmedChange =
  | { type: 'added' | 'updated'; item: OwnedItem }
  | { type: 'removed'; id: string }
export function OwnedItemsPanel({
  entryId,
  items,
  releases,
  library,
  blocked,
  onBusyChange,
  onCommitted,
}: {
  entryId: string
  items: OwnedItem[]
  releases: Release[]
  library: MusicLibrary
  blocked: boolean
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
}) {
  const draftId = `owned:${entryId}`
  const navigation = useNavigation()
  const [formOpen, setFormOpen] = useDraftState(draftId, 'open', false)
  const [editing, setEditing] = useDraftState<OwnedItem | undefined>(
    draftId,
    'editing',
    undefined,
  )
  const [medium, setMedium] = useDraftState<OwnedItem['medium']>(
    draftId,
    'medium',
    'physical',
  )
  const [format, setFormat] = useDraftState<OwnedItem['format']>(
    draftId,
    'format',
    'cd',
  )
  const [releaseId, setReleaseId] = useDraftState(draftId, 'release', '')
  const [acquiredAt, setAcquiredAt] = useDraftState(draftId, 'acquired', '')
  const [mediaCondition, setMediaCondition] = useDraftState(
    draftId,
    'media',
    '',
  )
  const [sleeveCondition, setSleeveCondition] = useDraftState(
    draftId,
    'sleeve',
    '',
  )
  const [notes, setNotes] = useDraftState(draftId, 'notes', '')
  const [deleting, setDeleting] = useState<OwnedItem>()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<ConfirmedChange>()
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const lock = useRef(false)
  const panel = useRef<HTMLElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const mediumInput = useRef<HTMLSelectElement>(null)
  const cancelDelete = useRef<HTMLButtonElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const error = useRef<HTMLParagraphElement>(null)
  const focusAdd = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  useDraftGuard({
    id: draftId,
    label: editing ? 'Editar adquisición' : 'Nueva adquisición',
    dirty:
      formOpen &&
      Boolean(
        medium !== (editing?.medium ?? 'physical') ||
        format !== (editing?.format ?? 'cd') ||
        releaseId !== (editing?.releaseId ?? '') ||
        acquiredAt !== (editing?.acquiredAt ?? '') ||
        mediaCondition !== (editing?.mediaCondition ?? '') ||
        sleeveCondition !== (editing?.sleeveCondition ?? '') ||
        notes !== (editing?.notes ?? ''),
      ),
    busy,
    pendingRead: Boolean(pending),
    ...(pending || conflict ? { focus: () => retry.current?.focus() } : {}),
    form,
  })
  useEffect(() => {
    if (formOpen && !busy && !pending && !conflict) mediumInput.current?.focus()
  }, [formOpen, busy, pending, conflict])
  useEffect(() => {
    if (deleting) cancelDelete.current?.focus()
  }, [deleting])
  useEffect(() => {
    if (busy) return
    if ((pending || conflict) && failure) retry.current?.focus()
    else if (failure) error.current?.focus()
    else if (focusAdd.current) {
      addButton.current?.focus()
      focusAdd.current = false
    }
  }, [busy, pending, conflict, failure, formOpen])
  let visibleItems = items.filter((item) => item.userAlbumId === entryId)
  if (pending && pending.type !== 'removed')
    visibleItems = [
      ...visibleItems.filter((item) => item.id !== pending.item.id),
      pending.item,
    ]
  if (pending?.type === 'removed')
    visibleItems = visibleItems.filter((item) => item.id !== pending.id)
  visibleItems = visibleItems.toSorted(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
  const compatible = releases.filter((release) =>
    ownedItemMatchesRelease({ medium, format }, release),
  )
  const itemNames = ownedItemLabels(visibleItems)
  const releaseNames = releaseLabels(releases)
  function begin(item?: OwnedItem) {
    setEditing(item)
    setMedium(item?.medium ?? 'physical')
    setFormat(item?.format ?? 'cd')
    setReleaseId(item?.releaseId ?? '')
    setAcquiredAt(item?.acquiredAt ?? '')
    setNotes(item?.notes ?? '')
    setMediaCondition(item?.mediaCondition ?? '')
    setSleeveCondition(item?.sleeveCondition ?? '')
    setDeleting(undefined)
    setFailure('')
    setNotice('')
    setConflict(false)
    setFormOpen(true)
  }
  function cancelRemoval() {
    const id = deleting?.id
    setDeleting(undefined)
    setFailure('')
    setConflict(false)
    if (id)
      panel.current
        ?.querySelector<HTMLButtonElement>(`[data-remove-item="${id}"]`)
        ?.focus()
  }
  async function read() {
    try {
      await onCommitted()
      setPending(undefined)
      setFailure('')
      onBusyChange(false)
      focusAdd.current = true
    } catch {
      setFailure(
        'El cambio se guardó, pero no pudimos actualizar la colección. Reintenta la lectura para continuar.',
      )
    }
  }
  async function commit(
    action: () => Promise<ConfirmedChange>,
    message: string,
  ) {
    if (lock.current || blocked || pending || conflict) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    setNotice('')
    try {
      setPending(await action())
    } catch (cause) {
      const outdated =
        cause instanceof LibraryChangeError &&
        (cause.rule === 'outdated_change' || cause.rule === 'missing_reference')
      setConflict(outdated)
      setFailure(
        outdated
          ? 'Esta adquisición cambió o fue eliminada desde que la abriste. Tu borrador se conserva; cargar la colección guardada lo reemplaza.'
          : cause instanceof ZodError
            ? 'Revisa la fecha, las condiciones y la compatibilidad del medio, formato y edición. Los datos guardados y el borrador se conservan.'
            : cause instanceof LocalStorageError &&
                cause.code === 'quota_exceeded'
              ? 'No hay espacio para guardar. Los ejemplares previos y tu borrador se conservan; libera espacio y vuelve a intentar.'
              : 'No se pudo guardar el cambio. Los ejemplares previos y tu borrador se conservan; vuelve a intentar.',
      )
      setBusy(false)
      onBusyChange(false)
      lock.current = false
      return
    }
    setFormOpen(false)
    setEditing(undefined)
    setDeleting(undefined)
    setNotice(message)
    await read()
    setBusy(false)
    lock.current = false
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = {
      medium,
      format,
      notes,
      ...(releaseId ? { releaseId } : {}),
      ...(acquiredAt ? { acquiredAt } : {}),
      ...(mediaCondition ? { mediaCondition } : {}),
      ...(sleeveCondition ? { sleeveCondition } : {}),
    }
    void commit(
      async () => ({
        type: editing ? 'updated' : 'added',
        item: editing
          ? await library.updateOwnedItem(editing, fields)
          : await library.addOwnedItem(entryId, fields),
      }),
      editing ? 'Adquisición actualizada.' : 'Ejemplar registrado.',
    )
  }
  async function retryRead() {
    if (lock.current || !pending) return
    lock.current = true
    setBusy(true)
    await read()
    setBusy(false)
    lock.current = false
  }
  async function loadSaved() {
    if (lock.current || blocked) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    try {
      const fresh = await onCommitted()
      const item =
        editing && fresh.library.ownedItems.find((row) => row.id === editing.id)
      if (item) begin(item)
      else {
        setFormOpen(false)
        setEditing(undefined)
        setDeleting(undefined)
        setConflict(false)
        setFailure('')
        focusAdd.current = true
      }
      setNotice(
        'Colección guardada cargada. Revisa los datos antes de continuar.',
      )
    } catch {
      setFailure('No se pudo leer la colección. Tu borrador se conserva.')
    }
    setBusy(false)
    onBusyChange(false)
    lock.current = false
  }
  return (
    <section ref={panel} className="owned-panel" aria-labelledby="owned-title">
      <h3 id="owned-title" className="text-xl font-semibold">
        Tu colección
      </h3>
      <p className="mt-3 text-sm text-muted">
        Cada copia se registra por separado. La propiedad no cambia tu escucha
        ni tus valoraciones. Streaming y descargas gratuitas no representan una
        compra digital.
      </p>
      <p className="mt-4 text-sm">
        {visibleItems.length}{' '}
        {visibleItems.length === 1
          ? 'ejemplar registrado'
          : 'ejemplares registrados'}
      </p>
      {visibleItems.length ? (
        <ul aria-label="Ejemplares de este álbum" className="mt-4 grid gap-4">
          {visibleItems.map((item) => {
            const release = releases.find((row) => row.id === item.releaseId)
            return (
              <li key={item.id} className="owned-card">
                <h4 className="font-semibold wrap-anywhere">
                  {itemNames.get(item.id)}
                </h4>
                <p className="mt-2 text-sm text-muted">
                  {ownedMediumLabels[item.medium]} ·{' '}
                  {release
                    ? releaseNames.get(release.id)
                    : 'Edición sin determinar'}
                </p>
                <dl className="mt-3 grid gap-2 text-sm">
                  {item.acquiredAt ? (
                    <div>
                      <dt className="text-muted">Fecha de adquisición</dt>
                      <dd>{item.acquiredAt}</dd>
                    </div>
                  ) : null}
                  {item.mediaCondition ? (
                    <div>
                      <dt className="text-muted">Estado del soporte</dt>
                      <dd>{conditionLabels[item.mediaCondition]}</dd>
                    </div>
                  ) : null}
                  {item.sleeveCondition ? (
                    <div>
                      <dt className="text-muted">Estado de la funda</dt>
                      <dd>{conditionLabels[item.sleeveCondition]}</dd>
                    </div>
                  ) : null}
                </dl>
                {item.notes ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm wrap-anywhere">
                    {item.notes}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="action-button mt-3 mr-3"
                  disabled={blocked || formOpen || Boolean(deleting)}
                  onClick={() => begin(item)}
                >
                  Editar ejemplar {itemNames.get(item.id)}
                </button>
                <button
                  type="button"
                  className="text-button mt-3"
                  data-remove-item={item.id}
                  disabled={blocked || formOpen}
                  onClick={() => {
                    setDeleting(item)
                    setFailure('')
                    setNotice('')
                  }}
                >
                  Eliminar ejemplar {itemNames.get(item.id)}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">
          No has registrado ejemplares de este álbum.
        </p>
      )}
      {!formOpen ? (
        <button
          ref={addButton}
          type="button"
          className="primary-button mt-5"
          disabled={blocked || deleting !== undefined}
          onClick={() => begin()}
        >
          Registrar ejemplar
        </button>
      ) : (
        <form
          ref={form}
          onSubmit={submit}
          noValidate
          autoComplete="off"
          aria-describedby={failure ? 'owned-error' : 'owned-help'}
        >
          <h4 className="mt-6 text-lg font-semibold">
            {editing
              ? `Editar ${ownedItemLabel(editing, visibleItems)}`
              : 'Registrar ejemplar'}
          </h4>
          <fieldset disabled={busy || blocked} className="min-w-0">
            <div className="owned-fields mt-4">
              <label className="field-label">
                Medio del ejemplar
                <select
                  ref={mediumInput}
                  value={medium}
                  onChange={(event) => {
                    const next = ownedMediumSchema.parse(event.target.value)
                    setMedium(next)
                    setFormat(next === 'physical' ? 'cd' : 'digital_download')
                    setReleaseId('')
                    setMediaCondition('')
                    setSleeveCondition('')
                    setFailure('')
                  }}
                >
                  {Object.entries(ownedMediumLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Formato del ejemplar
                <select
                  value={format}
                  onChange={(event) => {
                    setFormat(ownedFormatSchema.parse(event.target.value))
                    setReleaseId('')
                    setFailure('')
                  }}
                >
                  {ownedFormatSchema.options
                    .filter((value) =>
                      medium === 'physical'
                        ? value !== 'digital_download'
                        : value === 'digital_download',
                    )
                    .map((value) => (
                      <option key={value} value={value}>
                        {ownedFormatLabels[value]}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field-label">
                Edición del ejemplar
                <select
                  value={releaseId}
                  onChange={(event) => setReleaseId(event.target.value)}
                >
                  <option value="">Sin edición determinada</option>
                  {releaseId &&
                  !compatible.some((release) => release.id === releaseId) ? (
                    <option value={releaseId}>
                      Edición no disponible: revisa la selección
                    </option>
                  ) : null}
                  {compatible.map((release) => (
                    <option key={release.id} value={release.id}>
                      {releaseNames.get(release.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Fecha de adquisición
                <input
                  type="date"
                  value={acquiredAt}
                  onChange={(event) => setAcquiredAt(event.target.value)}
                  onInput={(event) => setAcquiredAt(event.currentTarget.value)}
                />
              </label>
              {medium === 'physical' ? (
                <>
                  <label className="field-label">
                    Estado del soporte
                    <select
                      value={mediaCondition}
                      onChange={(event) =>
                        setMediaCondition(event.target.value)
                      }
                    >
                      <option value="">Sin registrar</option>
                      {conditionSchema.options.map((value) => (
                        <option key={value} value={value}>
                          {conditionLabels[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Estado de la funda
                    <select
                      value={sleeveCondition}
                      onChange={(event) =>
                        setSleeveCondition(event.target.value)
                      }
                    >
                      <option value="">Sin registrar</option>
                      {conditionSchema.options.map((value) => (
                        <option key={value} value={value}>
                          {conditionLabels[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </div>
            <label className="field-label mt-4">
              Notas del ejemplar
              <textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <p id="owned-help" className="mt-2 text-xs text-muted">
              Fecha, condiciones, notas y edición son opcionales. Se conservan
              los espacios y saltos de línea de tus notas.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="submit"
                className="primary-button"
                disabled={conflict}
              >
                {editing ? 'Guardar cambios del ejemplar' : 'Guardar ejemplar'}
              </button>
              <button
                type="button"
                className="action-button"
                onClick={() => {
                  const close = () => {
                    setFormOpen(false)
                    setEditing(undefined)
                    setConflict(false)
                    setFailure('')
                    focusAdd.current = true
                  }
                  if (navigation) navigation.closeEditor(draftId, close)
                  else close()
                }}
              >
                {editing
                  ? 'Cancelar edición del ejemplar'
                  : 'Cancelar registro'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {deleting ? (
        <div
          role="dialog"
          aria-labelledby="remove-owned-title"
          aria-describedby="remove-owned-help"
          className="owned-confirm mt-5"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !blocked && !busy) {
              event.stopPropagation()
              cancelRemoval()
            }
          }}
        >
          <h4 id="remove-owned-title" className="text-lg font-semibold">
            Eliminar {ownedItemLabel(deleting, visibleItems)}
          </h4>
          <p id="remove-owned-help" className="mt-3 text-sm">
            Se borrará únicamente este registro de propiedad y sus notas de
            ejemplar. El álbum, sus ediciones, valoraciones y experiencia se
            conservan. Esta eliminación no se puede deshacer desde la
            aplicación.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              ref={cancelDelete}
              type="button"
              className="action-button"
              disabled={blocked || busy}
              onClick={cancelRemoval}
            >
              Conservar ejemplar
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={blocked || busy || conflict}
              onClick={() => {
                void commit(async () => {
                  await library.removeOwnedItem(entryId, deleting.id, deleting)
                  return { type: 'removed', id: deleting.id }
                }, 'Ejemplar eliminado.')
              }}
            >
              Confirmar eliminación
            </button>
          </div>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-sm text-accent-text">
          {notice}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {pending ? 'Actualizando colección…' : 'Guardando cambio…'}
        </p>
      ) : null}
      {failure ? (
        <p
          ref={error}
          tabIndex={-1}
          id="owned-error"
          role="alert"
          className="field-error"
        >
          {failure}
        </p>
      ) : null}
      {pending && failure ? (
        <button
          ref={retry}
          type="button"
          className="action-button mt-4"
          disabled={busy}
          onClick={() => {
            void retryRead()
          }}
        >
          Reintentar lectura de colección
        </button>
      ) : null}
      {conflict ? (
        <button
          ref={retry}
          type="button"
          className="action-button mt-4"
          disabled={busy || blocked}
          onClick={() => void loadSaved()}
        >
          Cargar colección guardada
        </button>
      ) : null}
    </section>
  )
}
