import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { ZodError } from 'zod'
import {
  CollectionBatches,
  type CollectionBatchAction,
  type CollectionBatchPreview,
  type CollectionBatchReceipt,
} from '../../application/collection-batches'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../../domain/repositories/local-repository'
import { useDraftGuard } from '../navigation/draft-context'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { listeningLabels } from './labels'
import { ownedFormatLabels } from './owned-labels'

function failureMessage(cause: unknown) {
  if (cause instanceof LocalStorageError && cause.code === 'quota_exceeded')
    return 'No hay espacio para guardar. Los álbumes se conservan sin cambios.'
  if (cause instanceof ZodError)
    return cause.issues[0]?.message ?? 'Revisa la selección.'
  return cause instanceof Error
    ? cause.message
    : 'No pudimos guardar los cambios. Vuelve a intentar.'
}

export function CollectionBatchDialog({
  repository,
  ids,
  initialAction,
  onClose,
  onBusyChange,
  onCommitted,
  onDone,
}: {
  repository: TransactionalLocalRepository
  ids: string[]
  initialAction: CollectionBatchAction
  onClose: () => void
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
  onDone: (receipt: CollectionBatchReceipt) => void
}) {
  const service = useMemo(() => new CollectionBatches(repository), [repository])
  const [action, setAction] = useState(initialAction)
  const [prepared, setPrepared] = useState<CollectionBatchPreview>()
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<CollectionBatchReceipt>()
  const [failure, setFailure] = useState(''),
    [revision, setRevision] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null),
    form = useRef<HTMLFormElement>(null)
  const retry = useRef<HTMLButtonElement>(null),
    error = useRef<HTMLParagraphElement>(null)
  const mounted = useRef(true),
    locked = useRef(false)
  const headingId = useId()
  useDraftGuard({
    id: 'collection-batch',
    label: 'Cambios de la selección',
    dirty: false,
    busy: saving,
    pendingRead: Boolean(receipt),
    form,
    focus: () => (receipt ? retry.current : error.current)?.focus(),
  })
  useEffect(() => {
    mounted.current = true
    const element = dialog.current
    element?.showModal()
    return () => {
      mounted.current = false
      if (element?.open) element.close()
      onBusyChange(false)
    }
  }, [onBusyChange])
  useEffect(() => {
    let active = true
    void service
      .prepare(ids, action)
      .then((value) => {
        if (active) setPrepared(value)
      })
      .catch((cause: unknown) => {
        if (active) setFailure(failureMessage(cause))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [service, ids, action, revision])
  useEffect(() => {
    if (!saving && receipt && failure) retry.current?.focus()
    else if (!saving && failure) error.current?.focus()
  }, [saving, receipt, failure])

  async function refresh(value: CollectionBatchReceipt) {
    try {
      await onCommitted()
      if (!mounted.current) return
      onBusyChange(false)
      onDone(value)
    } catch {
      if (mounted.current)
        setFailure(
          'Los cambios se guardaron, pero no pudimos actualizar la colección. Reintenta la lectura; los datos ya están guardados.',
        )
    }
  }
  function resetReview() {
    setLoading(true)
    setPrepared(undefined)
    setFailure('')
  }
  function chooseAction(next: CollectionBatchAction) {
    resetReview()
    setAction(next)
  }
  async function confirm(event: FormEvent) {
    event.preventDefault()
    if (locked.current || receipt || loading || !prepared?.changed) return
    locked.current = true
    setSaving(true)
    onBusyChange(true)
    setFailure('')
    let value: CollectionBatchReceipt
    try {
      value = await service.confirm(prepared)
    } catch (cause) {
      if (mounted.current) {
        setPrepared(undefined)
        setFailure(failureMessage(cause))
        setSaving(false)
        onBusyChange(false)
      }
      locked.current = false
      return
    }
    if (!mounted.current) return
    setReceipt(value)
    await refresh(value)
    locked.current = false
    if (mounted.current) setSaving(false)
  }
  async function retryRead() {
    if (locked.current || !receipt) return
    locked.current = true
    setSaving(true)
    await refresh(receipt)
    locked.current = false
    if (mounted.current) setSaving(false)
  }
  const blocked = saving || Boolean(receipt)
  return (
    <dialog
      ref={dialog}
      className="collection-dialog"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault()
        if (!blocked) onClose()
      }}
    >
      <header className="collection-dialog-heading">
        <h2 id={headingId}>
          {ids.length === 1
            ? 'Actualizar un álbum'
            : `Actualizar ${ids.length} álbumes`}
        </h2>
        <button
          type="button"
          className="settings-close"
          aria-label="Cerrar acciones de colección"
          disabled={blocked}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <form ref={form} onSubmit={(event) => void confirm(event)}>
        <div
          className="collection-action-tabs"
          role="group"
          aria-label="Qué quieres hacer"
        >
          <button
            type="button"
            aria-pressed={action.kind === 'own'}
            disabled={blocked}
            onClick={() => chooseAction({ kind: 'own', format: 'cd' })}
          >
            Lo tengo
          </button>
          <button
            type="button"
            aria-pressed={action.kind === 'wish'}
            disabled={blocked}
            onClick={() => chooseAction({ kind: 'wish', format: 'cd' })}
          >
            Lo quiero
          </button>
          <button
            type="button"
            aria-pressed={action.kind === 'listening'}
            disabled={blocked}
            onClick={() =>
              chooseAction({ kind: 'listening', status: 'completed' })
            }
          >
            Escucha
          </button>
        </div>
        {action.kind === 'listening' ? (
          <label className="collection-action-field">
            <span>Estado de escucha</span>
            <select
              value={action.status}
              disabled={blocked}
              onChange={(event) =>
                chooseAction({
                  kind: 'listening',
                  status: event.currentTarget.value as
                    'untracked' | 'queued' | 'in_progress' | 'completed',
                })
              }
            >
              {(
                ['queued', 'in_progress', 'completed', 'untracked'] as const
              ).map((status) => (
                <option key={status} value={status}>
                  {listeningLabels[status]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="collection-action-field">
            <span>Formato</span>
            <select
              value={action.format}
              disabled={blocked}
              onChange={(event) =>
                chooseAction(
                  action.kind === 'own'
                    ? {
                        kind: 'own',
                        format: event.currentTarget.value as
                          | 'cd'
                          | 'vinyl'
                          | 'cassette'
                          | 'digital_download'
                          | 'other',
                      }
                    : {
                        kind: 'wish',
                        format: event.currentTarget.value as
                          'cd' | 'vinyl' | 'cassette' | 'digital' | 'other',
                      },
                )
              }
            >
              <option value="cd">CD</option>
              <option value="vinyl">Vinilo</option>
              <option value="cassette">Casete</option>
              <option
                value={action.kind === 'own' ? 'digital_download' : 'digital'}
              >
                Digital
              </option>
              <option value="other">Otro</option>
            </select>
          </label>
        )}
        <p className="text-sm text-muted">
          {action.kind === 'own'
            ? 'Se añadirá una copia por álbum que aún no tenga este formato. Puedes completar sus detalles después.'
            : action.kind === 'wish'
              ? 'Se añadirá un deseo para este formato donde todavía no exista uno activo.'
              : 'Se cambiará únicamente el estado de escucha de los álbumes seleccionados.'}
        </p>
        {loading ? (
          <p role="status" className="mt-4 text-sm">
            Revisando la selección…
          </p>
        ) : null}
        {prepared && !receipt ? (
          <>
            <p role="status" className="mt-4 text-sm">
              {prepared.changed}{' '}
              {prepared.changed === 1 ? 'álbum cambiará' : 'álbumes cambiarán'}
              {prepared.unchanged
                ? ` · ${prepared.unchanged} ya ${prepared.unchanged === 1 ? 'está' : 'están'} actualizado${prepared.unchanged === 1 ? '' : 's'}`
                : ''}
              .
            </p>
            <ul
              className="collection-review-list"
              aria-label="Revisión de álbumes seleccionados"
              tabIndex={0}
            >
              {prepared.rows.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong className="wrap-anywhere">{row.title}</strong>
                    <span className="text-muted wrap-anywhere">
                      {row.artist}
                    </span>
                  </div>
                  <span className="text-muted">
                    {row.change
                      ? 'Cambiará'
                      : action.kind === 'own'
                        ? `Ya tienes ${ownedFormatLabels[action.format]}`
                        : action.kind === 'wish'
                          ? 'Ya está en deseos'
                          : 'Mismo estado'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {failure ? (
          <p ref={error} tabIndex={-1} role="alert" className="mt-4 text-sm">
            {failure}
          </p>
        ) : null}
        <div className="collection-dialog-actions">
          {receipt ? (
            <button
              ref={retry}
              type="button"
              className="primary-button"
              disabled={saving}
              onClick={() => void retryRead()}
            >
              Reintentar lectura
            </button>
          ) : prepared ? (
            <button
              type="submit"
              className="primary-button"
              disabled={loading || saving || prepared.changed === 0}
            >
              {saving ? 'Guardando…' : 'Confirmar cambios'}
            </button>
          ) : !loading ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                resetReview()
                setRevision((value) => value + 1)
              }}
            >
              Revisar otra vez
            </button>
          ) : null}
          <button
            type="button"
            className="action-button"
            disabled={blocked}
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </form>
    </dialog>
  )
}
