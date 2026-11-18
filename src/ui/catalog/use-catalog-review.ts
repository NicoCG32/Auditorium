import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  EditionImports,
  type PreparedCatalogDetails,
} from '../../application/edition-imports'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../../domain/repositories/local-repository'
import { useDraftGuard } from '../navigation/draft-context'
import { LocalStorageError } from '../../infrastructure/db/errors'

export function useCatalogReview({
  id,
  repository,
  dirty,
  onBusyChange,
  onCommitted,
  onComplete,
}: {
  id: string
  repository: TransactionalLocalRepository
  dirty: boolean
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
  onComplete: () => void
}) {
  const service = useMemo(() => new EditionImports(repository), [repository])
  const [prepared, setPrepared] = useState<PreparedCatalogDetails>()
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [failure, setFailure] = useState('')
  const locked = useRef(false),
    form = useRef<HTMLFormElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    retry = useRef<HTMLButtonElement>(null)
  useDraftGuard({
    id,
    label: 'Datos del catálogo',
    dirty: !pending && (dirty || Boolean(prepared)),
    busy,
    pendingRead: pending,
    form,
    focus: () => (pending ? retry.current : heading.current)?.focus(),
  })
  useEffect(() => {
    if (prepared && !pending) heading.current?.focus()
  }, [prepared, pending])
  useEffect(() => {
    if (pending && !busy) retry.current?.focus()
  }, [pending, busy])
  async function preview(action: () => Promise<PreparedCatalogDetails>) {
    if (locked.current || pending) return
    locked.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    try {
      setPrepared(await action())
    } catch (cause) {
      setFailure(
        cause instanceof Error
          ? cause.message
          : 'No pudimos preparar la revisión.',
      )
    } finally {
      locked.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  async function read() {
    try {
      await onCommitted()
      setPending(false)
      setPrepared(undefined)
      setFailure('')
      onBusyChange(false)
      onComplete()
    } catch {
      setFailure(
        'Los datos se guardaron, pero no pudimos actualizar la vista. Reintenta sólo la lectura para continuar.',
      )
    }
  }
  async function confirm(event?: FormEvent) {
    event?.preventDefault()
    if (locked.current || pending || !prepared) return
    locked.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    try {
      await service.confirm(prepared)
    } catch (cause) {
      setPrepared(undefined)
      setFailure(
        cause instanceof LocalStorageError && cause.code === 'quota_exceeded'
          ? 'No hay espacio para guardar. No se cambió ningún dato; libera espacio y vuelve a revisar.'
          : cause instanceof Error
            ? cause.message
            : 'No se pudieron guardar los datos.',
      )
      locked.current = false
      setBusy(false)
      onBusyChange(false)
      return
    }
    setPending(true)
    await read()
    locked.current = false
    setBusy(false)
  }
  async function retryRead() {
    if (locked.current || !pending) return
    locked.current = true
    setBusy(true)
    await read()
    locked.current = false
    setBusy(false)
  }
  return {
    service,
    prepared,
    busy,
    pending,
    failure,
    form,
    heading,
    retry,
    preview,
    confirm,
    retryRead,
    clear: () => {
      if (!pending && !locked.current) setPrepared(undefined)
    },
    setFailure,
  }
}
