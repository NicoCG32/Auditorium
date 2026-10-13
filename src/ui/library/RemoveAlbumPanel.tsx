import { useEffect, useRef, useState } from 'react'
import type { MusicLibrary } from '../../application/music-library'
import type { Library } from '../../domain/library/schemas'
import {
  personalEntryData,
  personalEntryToken,
} from '../../domain/library/personal-entry'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { formatCount } from './labels'

export function RemoveAlbumPanel({
  entryId,
  title,
  data,
  library,
  blocked,
  onBusyChange,
  onCommitted,
  onRemoved,
}: {
  entryId: string
  title: string
  data: Library
  library: MusicLibrary
  blocked: boolean
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
  onRemoved: () => void
}) {
  const [confirmation, setConfirmation] = useState<{
    token: string
    personal: ReturnType<typeof personalEntryData>
  }>()
  const [pending, setPending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const lock = useRef(false)
  const focusRemove = useRef(false)
  const remove = useRef<HTMLButtonElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const error = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (confirmation) keep.current?.focus()
  }, [confirmation])
  useEffect(() => {
    if (busy) return
    if (pending && failure) retry.current?.focus()
    else if (failure) error.current?.focus()
    else if (!confirmation && focusRemove.current) {
      remove.current?.focus()
      focusRemove.current = false
    }
  }, [busy, failure, pending, confirmation])
  function cancel() {
    setConfirmation(undefined)
    setFailure('')
    focusRemove.current = true
  }
  async function read() {
    try {
      await onCommitted()
      onBusyChange(false)
      onRemoved()
    } catch {
      setFailure(
        'El álbum ya se retiró y sus datos se conservan, pero no pudimos actualizar la biblioteca. Reintenta la lectura para continuar.',
      )
    }
  }
  async function confirm() {
    if (lock.current || blocked || pending || !confirmation) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    try {
      await library.removePersonalAlbum(entryId, confirmation.token)
    } catch (cause) {
      setFailure(
        cause instanceof LocalStorageError && cause.code === 'quota_exceeded'
          ? 'No hay espacio para guardar la baja. El álbum y sus datos siguen intactos; libera espacio y vuelve a intentar.'
          : 'No se pudo retirar el álbum. Sus datos se conservan. Si cambiaron desde la confirmación, revisa los datos antes de volver a confirmar.',
      )
      onBusyChange(false)
      setBusy(false)
      lock.current = false
      return
    }
    setPending(true)
    setConfirmation(undefined)
    await read()
    setBusy(false)
    lock.current = false
  }
  async function refreshConfirmation() {
    if (lock.current || blocked || pending) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    try {
      await onCommitted()
      setConfirmation(undefined)
      setFailure('')
      focusRemove.current = true
    } catch {
      setFailure(
        'No pudimos leer los datos actuales. El álbum se conserva; vuelve a intentar la lectura.',
      )
    }
    setBusy(false)
    onBusyChange(false)
    lock.current = false
  }
  async function retryRead() {
    if (lock.current || !pending) return
    lock.current = true
    setBusy(true)
    await read()
    setBusy(false)
    lock.current = false
  }
  const disabled = busy || blocked || pending
  return (
    <section className="owned-panel" aria-labelledby="remove-personal-title">
      <h3 id="remove-personal-title" className="text-xl font-semibold">
        Retirar de tu biblioteca
      </h3>
      <p className="mt-3 text-sm text-muted">
        Puedes quitar este álbum de la biblioteca visible y restaurarlo desde
        «Álbumes retirados». Se conservan todos tus datos personales y el
        catálogo.
      </p>
      {pending ? (
        <p className="mt-4 text-sm" role="status">
          Álbum retirado. Notas, valoraciones, deseos y ejemplares conservados.
        </p>
      ) : null}
      {failure ? (
        <p
          ref={error}
          role="alert"
          tabIndex={-1}
          className="mt-4 text-sm wrap-anywhere"
        >
          {failure}
        </p>
      ) : null}
      {pending && failure ? (
        <button
          className="primary-button mt-4"
          ref={retry}
          disabled={busy}
          onClick={() => void retryRead()}
        >
          Reintentar lectura tras retirar
        </button>
      ) : null}
      {!pending && !confirmation ? (
        <button
          type="button"
          ref={remove}
          className="text-button mt-4"
          disabled={disabled}
          onClick={() => {
            setFailure('')
            setConfirmation({
              token: personalEntryToken(data, entryId),
              personal: personalEntryData(data, entryId),
            })
          }}
        >
          Quitar álbum de biblioteca
        </button>
      ) : null}
      {confirmation ? (
        <div
          className="owned-confirm mt-5"
          role="dialog"
          aria-labelledby="remove-album-title"
          aria-describedby="remove-album-effects"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !disabled) {
              event.preventDefault()
              cancel()
            }
          }}
        >
          <h4 id="remove-album-title" className="font-semibold wrap-anywhere">
            Quitar «{title}» de tu biblioteca
          </h4>
          <div id="remove-album-effects" className="mt-3 text-sm">
            <p>
              Dejará de aparecer en la biblioteca activa. Sus datos quedarán
              guardados con el álbum retirado:
            </p>
            <ul className="mt-3 list-disc pl-5 space-y-2">
              <li>Escucha y notas personales: se conservan.</li>
              <li>
                Nota del álbum:{' '}
                {confirmation.personal.albumRating
                  ? 'se conserva'
                  : 'sin registrar'}
                .{' '}
                {formatCount(
                  confirmation.personal.trackRatings.length,
                  'valoración de pista conservada',
                  'valoraciones de pistas conservadas',
                )}
                .
              </li>
              <li>
                {formatCount(
                  confirmation.personal.ownedItems.length,
                  'ejemplar conservado',
                  'ejemplares conservados',
                )}
                .
              </li>
              <li>
                {formatCount(
                  confirmation.personal.purchaseWishes.length,
                  'deseo conservado',
                  'deseos conservados',
                )}{' '}
                con sus estados.
              </li>
            </ul>
            <p className="mt-3">
              El catálogo, las ediciones y las pistas se conservan. Puedes
              restaurar la misma entrada y sus datos desde «Álbumes retirados».
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="action-button"
              ref={keep}
              disabled={disabled}
              onClick={cancel}
            >
              Conservar en biblioteca
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={disabled}
              onClick={() => void confirm()}
            >
              Confirmar retirada
            </button>
            {failure ? (
              <button
                type="button"
                className="text-button"
                disabled={disabled}
                onClick={() => void refreshConfirmation()}
              >
                Revisar datos antes de quitar
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
