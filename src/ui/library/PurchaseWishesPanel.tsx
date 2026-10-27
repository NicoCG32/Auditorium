import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { MusicLibrary } from '../../application/music-library'
import { releaseFormatSchema, type Release } from '../../domain/catalog/schemas'
import {
  wishMatchesOwnedItem,
  type PurchaseWish,
} from '../../domain/library/purchase-wishes'
import type { OwnedItem } from '../../domain/library/owned-items'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { ownedItemLabels } from './owned-labels'
import { useDraftGuard, useDraftState } from '../navigation/draft-context'
import { useNavigation } from '../navigation/navigation-context'

const formatLabels = {
  vinyl: 'Vinilo',
  cd: 'CD',
  cassette: 'Casete',
  digital: 'Descarga digital',
  other: 'Otro',
}
const statusLabels = {
  active: 'Activo',
  fulfilled: 'Cumplido',
  cancelled: 'Cancelado',
}
function releaseLabel(release: Release) {
  return `${release.editionLabel ?? 'Edición sin nombre'} · ${formatLabels[release.format]}${release.releaseYear ? ` · ${release.releaseYear}` : ''}`
}

export function PurchaseWishesPanel({
  entryId,
  wishes,
  items,
  releases,
  library,
  blocked,
  onBusyChange,
  onCommitted,
}: {
  entryId: string
  wishes: PurchaseWish[]
  items: OwnedItem[]
  releases: Release[]
  library: MusicLibrary
  blocked: boolean
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
}) {
  const draftId = `wish:${entryId}`
  const navigation = useNavigation()
  const [formOpen, setFormOpen] = useDraftState(draftId, 'open', false)
  const [editing, setEditing] = useDraftState<PurchaseWish | undefined>(
    draftId,
    'editing',
    undefined,
  )
  const [format, setFormat] = useDraftState(draftId, 'format', 'vinyl')
  const [releaseId, setReleaseId] = useDraftState(draftId, 'release', '')
  const [notes, setNotes] = useDraftState(draftId, 'notes', '')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PurchaseWish>()
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  const add = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLSelectElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const error = useRef<HTMLParagraphElement>(null)
  const focusAdd = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  useDraftGuard({
    id: draftId,
    label: 'Deseo de compra',
    dirty:
      formOpen &&
      (format !== (editing ? (editing.targetFormat ?? '') : 'vinyl') ||
        releaseId !== (editing?.targetReleaseId ?? '') ||
        notes !== (editing?.notes ?? '')),
    busy,
    pendingRead: Boolean(pending),
    ...(pending ? { focus: () => retry.current?.focus() } : {}),
    form,
  })
  useEffect(() => {
    if (formOpen) input.current?.focus()
  }, [formOpen])
  useEffect(() => {
    if (busy) return
    if (pending && failure) retry.current?.focus()
    else if (failure) error.current?.focus()
    else if (focusAdd.current) {
      add.current?.focus()
      focusAdd.current = false
    }
  }, [busy, pending, failure, formOpen])
  let visible = wishes.filter((wish) => wish.userAlbumId === entryId)
  if (pending)
    visible = [...visible.filter((wish) => wish.id !== pending.id), pending]
  visible = visible.toSorted(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
  const disabled = busy || blocked || Boolean(pending)
  const compatible = releases.filter(
    (release) => !format || release.format === format,
  )
  const itemNames = ownedItemLabels(items)
  const activeCount = visible.filter((wish) => wish.status === 'active').length
  function begin(wish?: PurchaseWish) {
    setEditing(wish)
    setFormat(wish ? (wish.targetFormat ?? '') : 'vinyl')
    setReleaseId(wish?.targetReleaseId ?? '')
    setNotes(wish?.notes ?? '')
    setFailure('')
    setNotice('')
    setFormOpen(true)
  }
  function cancel() {
    const close = () => {
      setFormOpen(false)
      setFailure('')
      focusAdd.current = true
    }
    if (navigation) navigation.closeEditor(draftId, close)
    else close()
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
        'El deseo se guardó, pero no pudimos actualizar la ficha. Reintenta la lectura para continuar.',
      )
    }
  }
  async function commit(action: () => Promise<PurchaseWish>, message: string) {
    if (lock.current || blocked || pending) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    setNotice('')
    try {
      setPending(await action())
    } catch (cause) {
      setFailure(
        cause instanceof LocalStorageError && cause.code === 'quota_exceeded'
          ? 'No hay espacio para guardar. El deseo previo y tu borrador se conservan; libera espacio y vuelve a intentar.'
          : 'No se pudo guardar. Revisa el objetivo y comprueba que el deseo y la compra sigan disponibles. El borrador y los datos guardados se conservan.',
      )
      setBusy(false)
      onBusyChange(false)
      lock.current = false
      return
    }
    setFormOpen(false)
    setEditing(undefined)
    setNotice(message)
    await read()
    setBusy(false)
    lock.current = false
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = {
      ...(format ? { targetFormat: format } : {}),
      ...(releaseId ? { targetReleaseId: releaseId } : {}),
      notes,
    }
    void commit(
      () =>
        editing
          ? library.updatePurchaseWish(editing, target)
          : library.addPurchaseWish(entryId, target),
      editing ? 'Deseo actualizado.' : 'Deseo registrado.',
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
  return (
    <section className="owned-panel" aria-labelledby="wishes-title">
      <h3 id="wishes-title" className="text-xl font-semibold">
        Deseos de compra
      </h3>
      <p className="mt-3 text-sm text-muted">
        Elige un formato genérico o una edición exacta. Tus ejemplares y deseos
        son independientes; una compra nunca cumple deseos automáticamente.
      </p>
      <p className="mt-4 text-sm">
        {activeCount} {activeCount === 1 ? 'deseo activo' : 'deseos activos'}
      </p>
      {visible.length ? (
        <ul aria-label="Deseos de este álbum" className="mt-4 grid gap-4">
          {visible.map((wish) => {
            const release = releases.find(
              (row) => row.id === wish.targetReleaseId,
            )
            const matches = items.filter((item) =>
              wishMatchesOwnedItem(wish, item),
            )
            const label = `Deseo ${wish.id.slice(-8)}`
            return (
              <li key={wish.id} className="owned-card">
                <h4 className="font-semibold wrap-anywhere">
                  {release
                    ? releaseLabel(release)
                    : wish.targetFormat
                      ? formatLabels[wish.targetFormat]
                      : 'Objetivo sin determinar'}{' '}
                  · {label}
                </h4>
                <p className="mt-2 text-sm">{statusLabels[wish.status]}</p>
                {wish.notes ? (
                  <p className="mt-3 text-sm whitespace-pre-wrap wrap-anywhere">
                    {wish.notes}
                  </p>
                ) : null}
                {matches.length ? (
                  <div className="mt-4">
                    <p className="text-sm">
                      Tienes una compra coincidente. Puedes marcar este deseo
                      como cumplido.
                    </p>
                    <label
                      className="field-label mt-3"
                      htmlFor={`wish-copy-${wish.id}`}
                    >
                      Compra para {label}
                    </label>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault()
                        const id = new FormData(event.currentTarget).get(
                          'ownedItemId',
                        )
                        void commit(
                          () =>
                            library.setPurchaseWishStatus(
                              wish,
                              'fulfilled',
                              id,
                            ),
                          'Deseo cumplido. Los demás deseos se conservan.',
                        )
                      }}
                    >
                      <select
                        id={`wish-copy-${wish.id}`}
                        name="ownedItemId"

                        disabled={disabled}
                        required
                      >
                        {matches.map((item) => (
                          <option key={item.id} value={item.id}>
                            {itemNames.get(item.id)}
                          </option>
                        ))}
                      </select>
                      <button
                        className="primary-button mt-3"
                        disabled={disabled}
                        type="submit"
                        aria-label={`Marcar cumplido ${label}`}
                      >
                        Marcar cumplido
                      </button>
                    </form>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  {wish.status === 'active' ? (
                    <>
                      <button
                        className="text-button"
                        disabled={disabled}
                        onClick={() => begin(wish)}
                        aria-label={`Editar ${label}`}
                      >
                        Editar deseo
                      </button>
                      <button
                        className="text-button"
                        disabled={disabled}
                        onClick={() =>
                          void commit(
                            () =>
                              library.setPurchaseWishStatus(wish, 'cancelled'),
                            'Deseo cancelado. Puedes reactivarlo.',
                          )
                        }
                        aria-label={`Cancelar ${label}`}
                      >
                        Cancelar deseo
                      </button>
                    </>
                  ) : (
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() =>
                        void commit(
                          () => library.setPurchaseWishStatus(wish, 'active'),
                          'Deseo reactivado.',
                        )
                      }
                      aria-label={`Reactivar ${label}`}
                    >
                      Reactivar deseo
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          No has registrado deseos para este álbum.
        </p>
      )}
      {notice ? (
        <p role="status" className="mt-4 text-sm">
          {notice}
        </p>
      ) : null}
      {failure ? (
        <p
          role="alert"
          ref={error}
          tabIndex={-1}
          className="mt-4 text-sm wrap-anywhere"
        >
          {failure}
        </p>
      ) : null}
      {pending && failure ? (
        <button
          ref={retry}
          className="primary-button mt-4"
          disabled={busy}
          onClick={() => void retryRead()}
        >
          Reintentar lectura de deseos
        </button>
      ) : null}
      {!formOpen ? (
        <button
          ref={add}
          className="primary-button mt-4"
          disabled={disabled}
          onClick={() => begin()}
        >
          Registrar deseo
        </button>
      ) : (
        <form
          ref={form}
          className="grid gap-4 mt-5"
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !disabled) {
              event.preventDefault()
              cancel()
            }
          }}
        >
          <h4 className="font-semibold">
            {editing ? 'Editar deseo de compra' : 'Nuevo deseo de compra'}
          </h4>
          <div className="owned-fields">
            <div>
              <label className="field-label" htmlFor="wish-format">
                Formato deseado
              </label>
              <select
                ref={input}
                id="wish-format"

                value={format}
                disabled={disabled}
                onChange={(event) => {
                  setFormat(event.target.value)
                  setReleaseId('')
                }}
              >
                <option value="">Solo edición exacta</option>
                {releaseFormatSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {formatLabels[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="wish-release">
                Edición deseada
              </label>
              <select
                id="wish-release"

                value={releaseId}
                required={!format}
                disabled={disabled}
                onChange={(event) => setReleaseId(event.target.value)}
              >
                <option value="">
                  {format
                    ? 'Cualquier edición de este formato'
                    : 'Selecciona una edición'}
                </option>
                {compatible.map((release) => (
                  <option key={release.id} value={release.id}>
                    {releaseLabel(release)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="field-label" htmlFor="wish-notes">
            Notas del deseo
          </label>
          <textarea
            id="wish-notes"

            value={notes}
            disabled={disabled}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
          />
          <div className="flex flex-wrap gap-3">
            <button
              className="primary-button"
              disabled={disabled}
              type="submit"
            >
              Guardar deseo
            </button>
            <button
              className="text-button"
              disabled={disabled}
              type="button"
              onClick={cancel}
            >
              Cancelar formulario de deseo
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
