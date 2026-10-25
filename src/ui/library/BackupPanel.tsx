import { useEffect, useMemo, useRef, useState } from 'react'
import { LibraryBackups } from '../../application/library-backups'
import {
  BackupError,
  isEmptySnapshot,
  type LibraryBackup,
} from '../../domain/backup'
import type { LocalIdentity } from '../../domain/identity'
import type {
  BackupLocalRepository,
  LocalSnapshot,
} from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { downloadBackup } from '../../infrastructure/browser/backup-download'
import { formatCount } from './labels'
import { hasAudioRepository } from '../../domain/audio'
import { CompleteAudioBackupPanel } from './CompleteAudioBackupPanel'

function Counts({ snapshot }: { snapshot: LocalSnapshot }) {
  const library = snapshot.library
  return (
    <ul className="mt-3 list-disc pl-5 space-y-2 text-sm">
      <li>
        {formatCount(
          library.userAlbums.filter((row) => !row.deletedAt).length,
          'álbum activo',
          'álbumes activos',
        )}{' '}
        y{' '}
        {formatCount(
          library.userAlbums.filter((row) => row.deletedAt).length,
          'álbum retirado',
          'álbumes retirados',
        )}
        .
      </li>
      <li>
        {formatCount(
          snapshot.catalog.albums.length,
          'álbum de catálogo',
          'álbumes de catálogo',
        )}
        ,{' '}
        {formatCount(snapshot.catalog.releases.length, 'edición', 'ediciones')}{' '}
        y {formatCount(snapshot.catalog.tracks.length, 'pista', 'pistas')} con
        sus relaciones.
      </li>
      <li>
        {formatCount(library.ownedItems.length, 'ejemplar', 'ejemplares')} y{' '}
        {formatCount(library.purchaseWishes.length, 'deseo', 'deseos')}.
      </li>
      <li>
        {formatCount(
          library.albumRatings.length,
          'valoración de álbum',
          'valoraciones de álbum',
        )}{' '}
        y{' '}
        {formatCount(
          library.trackRatings.length,
          'valoración de pista',
          'valoraciones de pistas',
        )}
        .
      </li>
      <li>Identidad local, fechas, escucha y notas personales incluidas.</li>
    </ul>
  )
}

function failureMessage(cause: unknown) {
  if (cause instanceof BackupError) {
    if (cause.code === 'not_empty')
      return 'La biblioteca contiene datos y no se puede restaurar aquí. No se cambió nada; actualiza la biblioteca para revisarla.'
    if (cause.code === 'destination_changed')
      return 'La identidad local cambió desde la preparación. No se cambió nada; actualiza la biblioteca y vuelve a seleccionar el archivo.'
    return `${cause.message} No se restauró ningún dato.`
  }
  if (cause instanceof LocalStorageError && cause.code === 'quota_exceeded')
    return 'No hay espacio para completar la restauración. La biblioteca y su identidad se conservan; libera espacio y vuelve a intentar.'
  return 'No se pudo completar la operación. La biblioteca se conserva; vuelve a intentar.'
}

export function BackupPanel({
  repository,
  snapshot,
  blocked,
  onBusyChange,
  onCommitted,
  onRestored,
  onBack,
}: {
  repository: BackupLocalRepository
  snapshot: LocalSnapshot
  blocked: boolean
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
  onRestored: () => void
  onBack: () => void
}) {
  const backups = useMemo(() => new LibraryBackups(repository), [repository])
  const [prepared, setPrepared] = useState<{
    backup: LibraryBackup
    expectedIdentity: LocalIdentity
    name: string
  }>()
  const [pending, setPending] = useState<LocalSnapshot>()
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('')
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  const focusFile = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const error = useRef<HTMLParagraphElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  useEffect(() => {
    if (prepared) cancel.current?.focus()
  }, [prepared])
  useEffect(() => {
    if (busy) return
    if (pending && failure) retry.current?.focus()
    else if (failure) error.current?.focus()
    else if (!prepared && focusFile.current) {
      fileInput.current?.focus()
      focusFile.current = false
    }
  }, [busy, pending, failure, prepared])
  const disabled = busy || blocked || Boolean(pending)
  const empty = isEmptySnapshot(snapshot)
  function start(message: string) {
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setPhase(message)
    setFailure('')
    setNotice('')
  }
  function finish() {
    setBusy(false)
    onBusyChange(false)
    lock.current = false
  }
  async function download() {
    if (lock.current || disabled) return
    start('Preparando descarga…')
    try {
      const exported = await backups.export()
      downloadBackup(exported.text, exported.document.exportedAt)
      setNotice(
        'Descarga de respaldo iniciada. Comprueba el archivo descargado en tu equipo.',
      )
    } catch (cause) {
      setFailure(failureMessage(cause))
    }
    finish()
  }
  async function selectFile(file: File | undefined) {
    if (lock.current || disabled || !empty) return
    setPrepared(undefined)
    setFailure('')
    if (!file) return
    start('Validando archivo…')
    try {
      const backup = await backups.readFile(file)
      setPrepared({
        backup,
        expectedIdentity: { ...snapshot.identity },
        name: file.name,
      })
    } catch (cause) {
      setFailure(failureMessage(cause))
      if (fileInput.current) fileInput.current.value = ''
    }
    finish()
  }
  function cancelRestore() {
    setPrepared(undefined)
    setFailure('')
    if (fileInput.current) {
      fileInput.current.value = ''
    }
    focusFile.current = true
  }
  async function read() {
    try {
      await onCommitted()
      onBusyChange(false)
      onRestored()
    } catch {
      setFailure(
        'La restauración se confirmó con sus datos e identidad, pero no pudimos actualizar la biblioteca. Reintenta la lectura para continuar.',
      )
    }
  }
  async function restore() {
    if (lock.current || disabled || !prepared) return
    start('Restaurando biblioteca…')
    try {
      setPending(
        await backups.restore(prepared.backup, prepared.expectedIdentity),
      )
    } catch (cause) {
      setFailure(failureMessage(cause))
      finish()
      return
    }
    setPrepared(undefined)
    if (fileInput.current) fileInput.current.value = ''
    setNotice(
      'Restauración confirmada. Datos e identidad local del archivo recuperados.',
    )
    await read()
    setBusy(false)
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
  return (
    <section aria-labelledby="backup-title">
      <button
        type="button"
        className="text-button mb-6"
        disabled={disabled}
        onClick={onBack}
      >
        Volver a biblioteca
      </button>
      <h2
        id="backup-title"
        ref={heading}
        tabIndex={-1}
        className="text-3xl font-semibold"
      >
        Respaldos de tu biblioteca
      </h2>
      <p className="mt-3 text-sm text-muted">
        Descarga tu biblioteca con notas y valoraciones. El JSON excluye el
        audio local; el ZIP completo lo incluye. Los archivos se procesan en tu
        equipo, sin enviarlos a servicios externos.
      </p>
      <section className="owned-panel" aria-labelledby="backup-export-title">
        <h3 id="backup-export-title" className="text-xl font-semibold">
          Exportar respaldo
        </h3>
        <Counts snapshot={pending ?? snapshot} />
        <p className="mt-3 text-sm text-muted">
          El JSON incluye los datos de biblioteca y portadas locales. Excluye
          archivos y nombres de audio; utiliza el ZIP completo para conservarlos
          o trasladarlos.
        </p>
        <button
          type="button"
          className="primary-button mt-4"
          disabled={disabled || Boolean(prepared)}
          onClick={() => void download()}
        >
          Descargar respaldo JSON sin audio
        </button>
      </section>
      <section className="owned-panel" aria-labelledby="backup-import-title">
        <h3 id="backup-import-title" className="text-xl font-semibold">
          Restaurar desde un archivo
        </h3>
        <p className="mt-3 text-sm text-muted" id="backup-import-help">
          Archivo JSON de hasta 20 MiB. La restauración requiere una biblioteca
          completamente vacía, incluidos catálogo, álbumes retirados y audio
          local, y recupera la identidad local del archivo para conservar sus
          relaciones.
        </p>
        {!empty && !pending ? (
          <p className="mt-3 text-sm">
            Esta biblioteca contiene datos. Puedes exportarla; la restauración
            en este destino no está disponible.
          </p>
        ) : null}
        <label htmlFor="backup-file" className="field-label mt-4">
          Seleccionar respaldo JSON
        </label>
        <input
          ref={fileInput}
          id="backup-file"
          type="file"
          accept=".json,application/json"
          aria-describedby="backup-import-help"
          disabled={disabled || !empty || Boolean(prepared)}
          onChange={(event) => void selectFile(event.currentTarget.files?.[0])}
          className="max-w-full min-w-0 text-sm"
        />
        {prepared ? (
          <div
            className="owned-confirm mt-5"
            role="dialog"
            aria-labelledby="backup-confirm-title"
            aria-describedby="backup-confirm-effects"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !disabled) {
                event.preventDefault()
                cancelRestore()
              }
            }}
          >
            <h4 id="backup-confirm-title" className="text-lg font-semibold">
              Confirmar restauración
            </h4>
            <p className="mt-3 text-sm wrap-anywhere">
              Archivo validado: {prepared.name}
            </p>
            <p className="mt-2 text-sm">
              Exportado el {prepared.backup.exportedAt}.
            </p>
            <Counts snapshot={prepared.backup.data} />
            <p id="backup-confirm-effects" className="mt-4 text-sm">
              Se importarán estos datos y se adoptará la identidad local
              guardada en el archivo. La biblioteca de destino debe seguir vacía
              al confirmar. Los IDs, notas, valoraciones, deseos y copias se
              conservan; no se mezclan bibliotecas.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                ref={cancel}
                type="button"
                className="action-button"
                disabled={disabled}
                onClick={cancelRestore}
              >
                Cancelar restauración
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={disabled}
                onClick={() => void restore()}
              >
                Confirmar restauración
              </button>
            </div>
          </div>
        ) : null}
        {pending ? (
          <div className="mt-5">
            <p role="status" className="text-sm">
              Biblioteca restaurada con la identidad y los datos del archivo.
            </p>
            <Counts snapshot={pending} />
          </div>
        ) : null}
      </section>
      {hasAudioRepository(repository) ? (
        <CompleteAudioBackupPanel
          repository={repository}
          snapshot={snapshot}
          blocked={disabled || Boolean(prepared)}
          onBusyChange={onBusyChange}
          onCommitted={onCommitted}
          onRestored={onRestored}
        />
      ) : null}
      {busy ? (
        <p role="status" className="mt-4 text-sm">
          {phase}
        </p>
      ) : null}
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
          type="button"
          className="primary-button mt-4"
          disabled={busy}
          onClick={() => void retryRead()}
        >
          Reintentar lectura tras restauración
        </button>
      ) : null}
    </section>
  )
}
