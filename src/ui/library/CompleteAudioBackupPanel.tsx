import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CompleteAudioBackups,
  type PreparedAudioBackup,
} from '../../application/complete-audio-backups'
import { AudioError, type AudioLocalRepository } from '../../domain/audio'
import { BackupError, isEmptySnapshot } from '../../domain/backup'
import type { LocalIdentity } from '../../domain/identity'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { downloadCompleteBackup } from '../../infrastructure/browser/backup-download'
import { LocalStorageError } from '../../infrastructure/db/errors'

function failureMessage(error: unknown) {
  if (error instanceof AudioError || error instanceof BackupError)
    return `${error.message} La biblioteca anterior se conserva.`
  if (error instanceof LocalStorageError && error.code === 'quota_exceeded')
    return 'No hay espacio para completar la operación. La biblioteca, sus archivos y su identidad anteriores se conservan.'
  return 'No se pudo completar la operación. Los datos anteriores se conservan; vuelve a intentar.'
}
export function CompleteAudioBackupPanel({
  repository,
  snapshot,
  blocked,
  onBusyChange,
  onCommitted,
  onRestored,
}: {
  repository: AudioLocalRepository
  snapshot: LocalSnapshot
  blocked: boolean
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
  onRestored: () => void
}) {
  const service = useMemo(
    () => new CompleteAudioBackups(repository),
    [repository],
  )
  const [prepared, setPrepared] = useState<{
    backup: PreparedAudioBackup
    expected: LocalIdentity
    name: string
  }>()
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [failure, setFailure] = useState(''),
    [confirmDelete, setConfirmDelete] = useState(false)
  const [summary, setSummary] = useState<{ count: number; bytes: number }>(),
    [summaryError, setSummaryError] = useState('')
  const active = useRef<AbortController | undefined>(undefined),
    lock = useRef(false),
    input = useRef<HTMLInputElement>(null),
    confirm = useRef<HTMLButtonElement>(null),
    error = useRef<HTMLParagraphElement>(null),
    retry = useRef<HTMLButtonElement>(null)
  const pendingRestore = useRef(true)
  useEffect(
    () => () => {
      active.current?.abort()
      active.current = undefined
    },
    [],
  )
  useEffect(() => {
    let current = true
    void repository
      .readAudioAttachments()
      .then((rows) => {
        if (current) {
          setSummary({
            count: rows.length,
            bytes: rows.reduce((total, row) => total + row.size, 0),
          })
          setSummaryError('')
        }
      })
      .catch(() => {
        if (current)
          setSummaryError(
            'No se pudo leer el inventario de audio local. Un respaldo completo requiere que todos sus archivos estén disponibles.',
          )
      })
    return () => {
      current = false
    }
  }, [repository, snapshot])
  useEffect(() => {
    if (prepared) confirm.current?.focus()
  }, [prepared])
  useEffect(() => {
    if (!busy && failure) error.current?.focus()
    if (!busy && pending) retry.current?.focus()
  }, [busy, failure, pending])
  const disabled = busy || blocked || pending
  function start(text: string) {
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    setMessage(text)
    const controller = new AbortController()
    active.current = controller
    return controller
  }
  function finish(keepBlocked = false) {
    active.current = undefined
    lock.current = false
    setBusy(false)
    if (!keepBlocked) onBusyChange(false)
  }
  function report(error: unknown, controller: AbortController) {
    if (controller.signal.aborted) {
      setFailure('')
      setMessage('Operación cancelada. La biblioteca anterior se conserva.')
    } else {
      setMessage('')
      setFailure(failureMessage(error))
    }
  }
  async function download() {
    if (lock.current || disabled) return
    const controller = start('Preparando biblioteca y audio para el ZIP…')
    try {
      const result = await service.export(controller.signal)
      controller.signal.throwIfAborted()
      downloadCompleteBackup(result.bytes, result.exportedAt)
      setMessage(
        'Descarga del ZIP completo iniciada. Comprueba que el archivo se guardó en tu equipo.',
      )
    } catch (error) {
      report(error, controller)
    }
    finish()
  }
  async function select(file: File | undefined) {
    if (!file || lock.current || disabled || !isEmptySnapshot(snapshot)) return
    setPrepared(undefined)
    const controller = start('Validando biblioteca, manifiesto y audio…')
    try {
      const backup = await service.readFile(file, controller.signal)
      controller.signal.throwIfAborted()
      setPrepared({
        backup,
        expected: { ...snapshot.identity },
        name: file.name,
      })
      setMessage(
        'Paquete completo validado. Revisa los datos antes de confirmar.',
      )
    } catch (error) {
      report(error, controller)
    }
    if (input.current) input.current.value = ''
    finish()
  }
  async function read() {
    try {
      await onCommitted()
      setPending(false)
      onBusyChange(false)
      if (pendingRestore.current) onRestored()
    } catch {
      setPending(true)
      setFailure(
        'La operación se confirmó. Reintenta la lectura para abrir los datos guardados; no se repetirá la escritura.',
      )
    }
  }
  async function restore() {
    if (!prepared || lock.current || disabled) return
    const controller = start(
      'Restaurando biblioteca y audio en una transacción…',
    )
    try {
      await service.restore(
        prepared.backup,
        prepared.expected,
        controller.signal,
      )
    } catch (error) {
      report(error, controller)
      finish()
      return
    }
    pendingRestore.current = true
    setPrepared(undefined)
    setPending(true)
    setMessage('Biblioteca y audio restaurados con la identidad del archivo.')
    await read()
    finish(true)
  }
  async function remove() {
    if (lock.current || disabled) return
    const controller = start(
      'Eliminando sólo las copias de audio de esta biblioteca local…',
    )
    try {
      await repository.clearLocalAudio(snapshot.identity, controller.signal)
    } catch (error) {
      report(error, controller)
      finish()
      return
    }
    pendingRestore.current = false
    setPending(true)
    setConfirmDelete(false)
    setSummary({ count: 0, bytes: 0 })
    setMessage(
      'Copias de audio eliminadas de Auditorium. Álbumes, experiencias y originales del equipo se conservan.',
    )
    await read()
    finish(true)
  }
  return (
    <section className="owned-panel" aria-labelledby="complete-audio-title">
      <h3 id="complete-audio-title" className="text-xl font-semibold">
        Respaldo completo con audio
      </h3>
      <p className="mt-3 text-sm text-muted">
        Un ZIP de hasta 160 MiB incluye la biblioteca y todos sus archivos de
        audio locales. Se procesa en este equipo y no está cifrado. Guarda la
        copia como un archivo personal. La cuenta no sincroniza audio.
      </p>
      {summary ? (
        <p className="mt-3 text-sm">
          Audio local: {summary.count} archivos ·{' '}
          {(summary.bytes / 1024 / 1024).toFixed(2)} MiB de 128 MiB.
        </p>
      ) : null}
      {summaryError ? <p className="mt-3 text-sm">{summaryError}</p> : null}
      <button
        type="button"
        className="primary-button mt-4"
        disabled={disabled || Boolean(prepared)}
        onClick={() => void download()}
      >
        Descargar respaldo completo con audio (ZIP)
      </button>
      <p className="mt-5 text-sm" id="complete-audio-help">
        Restaura sólo en un destino completamente vacío, incluidos sus adjuntos.
        Se validan identidad, asociaciones, límites e integridad antes de
        guardar. La reproducción dependerá del navegador de destino; los bytes
        válidos se conservan.
      </p>
      <label className="field-label mt-3" htmlFor="complete-audio-file">
        Seleccionar respaldo completo ZIP
      </label>
      <input
        ref={input}
        id="complete-audio-file"
        type="file"
        accept=".zip,application/zip"
        aria-describedby="complete-audio-help"
        disabled={disabled || Boolean(prepared) || !isEmptySnapshot(snapshot)}
        onChange={(event) => void select(event.currentTarget.files?.[0])}
      />
      {prepared ? (
        <div
          className="owned-confirm mt-4"
          role="dialog"
          aria-label="Confirmar restauración completa"
        >
          <p className="font-semibold wrap-anywhere">{prepared.name}</p>
          <p className="mt-3 text-sm">
            {prepared.backup.document.data.library.userAlbums.length} entradas
            de biblioteca y {prepared.backup.state.files.length} archivos de
            audio. Se adoptará la identidad del archivo.
          </p>
          <div className="form-actions mt-3">
            <button
              type="button"
              className="action-button"
              disabled={disabled}
              onClick={() => {
                setPrepared(undefined)
                setMessage('Restauración cancelada. No se cambió ningún dato.')
                input.current?.focus()
              }}
            >
              Cancelar restauración completa
            </button>
            <button
              ref={confirm}
              type="button"
              className="primary-button"
              disabled={disabled}
              onClick={() => void restore()}
            >
              Confirmar restauración completa
            </button>
          </div>
        </div>
      ) : null}
      {busy && !pending ? (
        <button
          type="button"
          className="action-button mt-4"
          onClick={() => active.current?.abort()}
        >
          Cancelar operación de audio
        </button>
      ) : null}
      {message ? (
        <p role="status" className="mt-4 text-sm">
          {message}
        </p>
      ) : null}
      {failure ? (
        <p ref={error} tabIndex={-1} role="alert" className="mt-4 text-sm">
          {failure}
        </p>
      ) : null}
      {pending && !busy ? (
        <button
          ref={retry}
          type="button"
          className="primary-button mt-4"
          onClick={() => {
            if (!lock.current) {
              lock.current = true
              setBusy(true)
              void read().finally(() => finish(true))
            }
          }}
        >
          Reintentar lectura de biblioteca y audio
        </button>
      ) : null}
      <details className="optional-fields mt-5">
        <summary>Administrar copias locales de audio</summary>
        <p className="mt-3 text-sm">
          Esta acción elimina los adjuntos de esta biblioteca en el dispositivo.
          Guarda un ZIP completo primero si quieres recuperarlos; sus originales
          del equipo y la biblioteca musical se conservan.
        </p>
        {!confirmDelete ? (
          <button
            type="button"
            className="text-button mt-3"
            disabled={disabled}
            onClick={() => setConfirmDelete(true)}
          >
            Eliminar todo el audio local
          </button>
        ) : (
          <div
            className="owned-confirm mt-3"
            role="dialog"
            aria-label="Confirmar eliminación del audio local"
          >
            <p>
              Se eliminarán las copias de audio de Auditorium en este
              dispositivo.
            </p>
            <button
              type="button"
              className="action-button mt-3"
              disabled={disabled}
              onClick={() => setConfirmDelete(false)}
            >
              Conservar audio
            </button>
            <button
              type="button"
              className="action-button mt-3"
              disabled={disabled}
              onClick={() => void remove()}
            >
              Confirmar eliminación del audio local
            </button>
          </div>
        )}
      </details>
    </section>
  )
}
