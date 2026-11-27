import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ZodError } from 'zod'
import {
  sameCollectionView,
  type CollectionViewSettings,
  type SavedCollectionView,
} from '../../application/collection-views'
import type { SavedCollectionViewsState } from '../appearance/use-saved-collection-views'
import { useDraftGuard } from '../navigation/draft-context'

export function CollectionViewsDialog({
  saved,
  current,
  onApply,
  onClose,
  onNotice,
}: {
  saved: SavedCollectionViewsState
  current: CollectionViewSettings
  onApply: (settings: CollectionViewSettings) => void
  onClose: () => void
  onNotice: (notice: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    form = useRef<HTMLFormElement>(null),
    input = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<{ view?: SavedCollectionView }>()
  const [name, setName] = useState(''),
    [failure, setFailure] = useState('')
  const [removed, setRemoved] = useState<SavedCollectionView>()
  const headingId = useId()
  useDraftGuard({
    id: 'collection-view-name',
    label: 'Nombre de la vista',
    dirty: Boolean(editing && name !== (editing.view?.name ?? '')),
    busy: false,
    pendingRead: false,
    form,
  })
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => {
      if (element?.open) element.close()
    }
  }, [])
  useEffect(() => {
    if (editing) input.current?.focus()
  }, [editing])
  function fail(cause: unknown) {
    setFailure(
      cause instanceof ZodError
        ? (cause.issues[0]?.message ?? 'Revisa el nombre.')
        : cause instanceof Error
          ? cause.message
          : 'No pudimos guardar la vista.',
    )
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    try {
      const view = editing.view
        ? saved.rename(editing.view, name)
        : saved.create(name, current)
      setName('')
      setEditing(undefined)
      onNotice(`Vista «${view.name}» guardada.`)
      onClose()
    } catch (cause) {
      fail(cause)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="collection-dialog"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header className="collection-dialog-heading">
        <h2 id={headingId}>Vistas guardadas</h2>
        <button
          type="button"
          className="settings-close"
          aria-label="Cerrar vistas guardadas"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {editing ? (
        <form ref={form} onSubmit={submit}>
          <p className="text-sm text-muted">
            {editing.view
              ? 'Elige otro nombre para esta vista.'
              : 'Guarda los filtros, el orden y la presentación que estás usando.'}
          </p>
          <label className="collection-action-field">
            <span>Nombre de la vista</span>
            <input
              ref={input}
              type="text"
              required
              maxLength={60}
              value={name}
              placeholder="Por ejemplo, Mis vinilos"
              onChange={(event) => {
                setName(event.currentTarget.value)
                setFailure('')
              }}
            />
          </label>
          {failure ? (
            <p role="alert" className="mt-4 text-sm">
              {failure}
            </p>
          ) : null}
          <div className="collection-dialog-actions">
            <button className="primary-button" type="submit">
              {editing.view ? 'Guardar nombre' : 'Guardar vista'}
            </button>
            <button
              className="action-button"
              type="button"
              onClick={() => {
                setEditing(undefined)
                setName('')
                setFailure('')
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          {saved.views.length ? (
            <ul className="collection-saved-list" aria-label="Tus vistas">
              {saved.views.map((view) => (
                <li key={view.id}>
                  <button
                    type="button"
                    className="collection-saved-open"
                    onClick={() => {
                      onApply(view.settings)
                      onNotice(`Vista «${view.name}».`)
                      onClose()
                    }}
                  >
                    <span className="wrap-anywhere">{view.name}</span>
                    {sameCollectionView(view.settings, current) ? (
                      <small>En uso</small>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="collection-icon-button"
                    aria-label={`Cambiar nombre de ${view.name}`}
                    title="Cambiar nombre"
                    onClick={() => {
                      setEditing({ view })
                      setName(view.name)
                      setFailure('')
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      aria-hidden="true"
                    >
                      <path d="m16 4 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="collection-icon-button"
                    aria-label={`Eliminar vista ${view.name}`}
                    title="Eliminar vista"
                    onClick={() => {
                      try {
                        saved.remove(view)
                        setRemoved(view)
                        setFailure('')
                      } catch (cause) {
                        fail(cause)
                      }
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Guarda una combinación de filtros para volver a ella con un clic.
            </p>
          )}
          {removed ? (
            <div className="collection-view-undo">
              <p role="status">Vista «{removed.name}» eliminada.</p>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  try {
                    saved.restore(removed)
                    setRemoved(undefined)
                    setFailure('')
                  } catch (cause) {
                    fail(cause)
                  }
                }}
              >
                Deshacer
              </button>
            </div>
          ) : null}
          {failure ? (
            <p role="alert" className="mt-4 text-sm">
              {failure}
            </p>
          ) : null}
          <div className="collection-dialog-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setEditing({})
                setName('')
                setFailure('')
              }}
            >
              Guardar vista actual
            </button>
          </div>
          <p className="mt-4 text-xs text-muted">
            Las vistas se conservan en este navegador.
          </p>
        </>
      )}
    </dialog>
  )
}
