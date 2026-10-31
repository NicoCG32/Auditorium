import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LibraryImports,
  reviewImport,
  type ImportChoices,
  type PreparedImport,
} from '../../application/library-imports'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../../domain/repositories/local-repository'
import { downloadCatalog } from '../../infrastructure/browser/backup-download'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { listeningLabels, formatScore } from './labels'
import {
  primaryTypeLabels,
  categoryLabels,
  publicationLabels,
} from '../../domain/catalog/classification'

function DataPreview({
  value,
  context,
}: {
  value: unknown
  context: LocalSnapshot[]
}) {
  const row =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined
  return (
    <div className="min-w-0">
      {Array.isArray(value) ? (
        <ul className="list-disc pl-4 text-sm">
          {value.map((candidate: unknown, index) => {
            const item = candidate as Record<string, unknown>
            return (
              <li key={index}>
                {typeof item.name === 'string'
                  ? item.name
                  : typeof item.title === 'string'
                    ? item.title
                    : 'Registro'}
                {typeof item.country === 'string' ? ` · ${item.country}` : ''}
                {typeof item.originalYear === 'number'
                  ? ` · ${item.originalYear}`
                  : ''}
              </li>
            )
          })}
        </ul>
      ) : null}
      {row ? (
        <dl className="space-y-2 text-sm">
          {(
            [
              'name',
              'title',
              'country',
              'originalYear',
              'editionLabel',
              'format',
              'medium',
              'description',
              'notes',
              'acquiredAt',
              'discNumber',
              'trackNumber',
              'position',
              'role',
            ] as const
          ).map((key) => {
            const value = row[key]
            const labels = {
              name: 'Nombre',
              title: 'Título',
              country: 'País',
              originalYear: 'Año original',
              editionLabel: 'Edición',
              format: 'Formato',
              medium: 'Adquisición',
              description: 'Descripción',
              notes: 'Anotación',
              acquiredAt: 'Fecha de adquisición',
              discNumber: 'Disco',
              trackNumber: 'Posición de pista',
              position: 'Orden del crédito',
              role: 'Rol',
            }
            return typeof value === 'string' || typeof value === 'number' ? (
              <div key={key}>
                <dt className="font-semibold">{labels[key]}</dt>
                <dd className="wrap-anywhere">
                  {String(value).slice(0, 1000)}
                </dd>
              </div>
            ) : null
          })}
          {typeof row.primaryType === 'string' ? (
            <>
              <div>
                <dt className="font-semibold">Clasificación</dt>
                <dd>
                  {
                    primaryTypeLabels[
                      row.primaryType as keyof typeof primaryTypeLabels
                    ]
                  }
                  {Array.isArray(row.categories)
                    ? row.categories
                        .map(
                          (value) =>
                            ` · ${categoryLabels[value as keyof typeof categoryLabels]}`,
                        )
                        .join('')
                    : ''}
                  {typeof row.publicationStatus === 'string'
                    ? ` · ${publicationLabels[row.publicationStatus as keyof typeof publicationLabels]}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Géneros</dt>
                <dd>
                  {Array.isArray(row.genres) && row.genres.length
                    ? row.genres.join(', ')
                    : 'Sin géneros'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Portada</dt>
                <dd className="wrap-anywhere">
                  {row.coverImage
                    ? 'Imagen guardada'
                    : typeof row.coverUrl === 'string'
                      ? row.coverUrl
                      : 'Sin portada'}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
      ) : null}
      {typeof row?.scoreUnits === 'number' ? (
        <p className="font-semibold">
          Nota: {formatScore(row.scoreUnits / 2)} / 10
        </p>
      ) : null}
      {row?.listeningStatus ? (
        <p>
          Escucha:{' '}
          {listeningLabels[row.listeningStatus as keyof typeof listeningLabels]}
        </p>
      ) : null}
      {row && 'addedAt' in row ? (
        <>
          <p>{row.deletedAt ? 'Álbum retirado' : 'Álbum activo'}</p>
          <p className="wrap-anywhere">
            Comentario:{' '}
            {typeof row.personalNotes === 'string'
              ? row.personalNotes.slice(0, 1000)
              : 'Sin comentario'}
          </p>
          <p>
            {Array.isArray(row.links) ? row.links.length : 0} enlaces
            personales.
          </p>
        </>
      ) : null}
      {row ? (
        <dl className="mt-2 space-y-2 text-sm">
          {(
            [
              'artistId',
              'albumId',
              'trackId',
              'releaseId',
              'referenceReleaseId',
              'targetReleaseId',
            ] as const
          ).map((key) => {
            const id = row[key]
            if (typeof id !== 'string') return null
            const catalogs = context.map((snapshot) => snapshot.catalog)
            const artist = catalogs
              .flatMap((catalog) => catalog.artists)
              .find((row) => row.id === id)
            const album = catalogs
              .flatMap((catalog) => catalog.albums)
              .find((row) => row.id === id)
            const track = catalogs
              .flatMap((catalog) => catalog.tracks)
              .find((row) => row.id === id)
            const release = catalogs
              .flatMap((catalog) => catalog.releases)
              .find((row) => row.id === id)
            const labels = {
              artistId: 'Artista',
              albumId: 'Álbum',
              trackId: 'Pista',
              releaseId: 'Edición',
              referenceReleaseId: 'Edición de referencia',
              targetReleaseId: 'Edición deseada',
            }
            return (
              <div key={key}>
                <dt className="font-semibold">{labels[key]}</dt>
                <dd className="wrap-anywhere">
                  {artist?.name ??
                    album?.title ??
                    track?.title ??
                    (release
                      ? [
                          release.editionLabel ?? 'Sin nombre de edición',
                          release.format,
                          release.releaseYear,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : id)}
                </dd>
              </div>
            )
          })}
        </dl>
      ) : null}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm">Ver campos JSON</summary>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap wrap-anywhere text-xs">
          {JSON.stringify(
            value,
            (key, value: unknown) =>
              key === 'coverImage' && typeof value === 'string'
                ? `[Portada local: ${value.length} caracteres]`
                : value,
            2,
          )}
        </pre>
      </details>
    </div>
  )
}

export function JsonImportPanel({
  repository,
  blocked,
  onBusyChange,
  onReviewChange,
  onCommitted,
  onImported,
}: {
  repository: TransactionalLocalRepository
  blocked: boolean
  onBusyChange: (busy: boolean) => void
  onReviewChange: (prepared: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
  onImported: () => void
}) {
  const imports = useMemo(() => new LibraryImports(repository), [repository])
  const [prepared, setPrepared] = useState<PreparedImport>()
  const [choices, setChoices] = useState<ImportChoices>({})
  const [busy, setBusy] = useState(false)
  const [committed, setCommitted] = useState(false)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const [page, setPage] = useState(0)
  const lock = useRef(false),
    focusFile = useRef(false),
    file = useRef<HTMLInputElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    error = useRef<HTMLParagraphElement>(null)
  const review = useMemo(
    () => (prepared ? reviewImport(prepared, choices) : undefined),
    [prepared, choices],
  )
  const pageSize = 20,
    currentPage = Math.min(
      page,
      Math.max(0, Math.ceil((review?.conflicts.length ?? 0) / pageSize) - 1),
    )
  const disabled = blocked || busy || committed
  useEffect(() => {
    if (prepared) cancel.current?.focus()
    else if (!busy && focusFile.current) {
      file.current?.focus()
      focusFile.current = false
    }
  }, [prepared, busy])
  useEffect(() => {
    if (failure && !busy) error.current?.focus()
  }, [failure, busy])
  function start() {
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    setNotice('')
  }
  function finish() {
    lock.current = false
    setBusy(false)
    onBusyChange(false)
  }
  function message(cause: unknown) {
    if (cause instanceof LocalStorageError && cause.code === 'quota_exceeded')
      return 'No hay espacio para importar. No se cambió ningún dato; libera espacio y vuelve a intentar.'
    return cause instanceof Error
      ? cause.message
      : 'No se pudo completar la importación. La biblioteca se conserva.'
  }
  async function select(value: File | undefined) {
    if (lock.current || disabled || prepared || !value) return
    onReviewChange(true)
    start()
    try {
      setPrepared(await imports.prepare(value))
      setChoices({})
      setPage(0)
    } catch (cause) {
      setFailure(message(cause))
      onReviewChange(false)
      if (file.current) file.current.value = ''
    }
    finish()
  }
  function cancelImport() {
    if (lock.current || disabled) return
    setPrepared(undefined)
    setChoices({})
    setFailure('')
    onReviewChange(false)
    if (file.current) {
      file.current.value = ''
      focusFile.current = true
    }
  }
  async function read() {
    try {
      await onCommitted()
      onBusyChange(false)
      onReviewChange(false)
      onImported()
    } catch {
      setFailure(
        'La importación se confirmó, pero no pudimos leer la biblioteca. Reintenta sólo la lectura; los datos ya están guardados.',
      )
    }
  }
  async function confirm() {
    if (lock.current || disabled || !prepared || !review?.snapshot) return
    start()
    try {
      await imports.confirm(prepared, choices)
    } catch (cause) {
      setFailure(message(cause))
      finish()
      return
    }
    setCommitted(true)
    setNotice(
      'Importación confirmada. La identidad de esta biblioteca se conserva.',
    )
    await read()
    lock.current = false
    setBusy(false)
  }
  async function retry() {
    if (lock.current || busy || !committed) return
    lock.current = true
    setBusy(true)
    await read()
    lock.current = false
    setBusy(false)
  }
  async function template() {
    if (lock.current || disabled || prepared) return
    onReviewChange(true)
    start()
    try {
      downloadCatalog(await imports.exportCatalog(), new Date().toISOString())
      setNotice(
        'Descarga de catálogo iniciada. Incluye artistas y álbumes, sin identidad, notas, valoraciones, adquisiciones ni audio. Comprueba el archivo en tu equipo.',
      )
    } catch (cause) {
      setFailure(message(cause))
    }
    onReviewChange(false)
    finish()
  }
  return (
    <section className="owned-panel" aria-labelledby="json-import-title">
      <h3 id="json-import-title" className="text-xl font-semibold">
        Incorporar datos desde JSON
      </h3>
      <p className="mt-3 text-sm text-muted" id="json-import-help">
        Añade un respaldo o un catálogo a esta biblioteca, aunque ya tenga
        música. Revisarás los datos y decidirás entre versiones si hay
        conflictos. Los registros ausentes del archivo y el audio local se
        conservan; tu identidad no se sustituye. Máximo 20 MiB.
      </p>
      <p className="mt-3 text-sm text-muted">
        El catálogo sencillo incorpora álbumes sin calificación ni escucha
        registrada. Para ampliarlo, descarga la plantilla con los
        identificadores de tus artistas y álbumes; no es un respaldo completo.
        Puede revelar tus gustos musicales si decides compartirla.
      </p>
      <button
        type="button"
        className="action-button mt-4"
        disabled={disabled || Boolean(prepared)}
        onClick={() => void template()}
      >
        Descargar plantilla de catálogo
      </button>
      <label className="field-label mt-4" htmlFor="json-import-file">
        Seleccionar JSON para incorporar
      </label>
      <input
        ref={file}
        id="json-import-file"
        className="max-w-full min-w-0 text-sm"
        type="file"
        accept=".json,application/json"
        aria-describedby="json-import-help"
        disabled={disabled || Boolean(prepared)}
        onChange={(event) => void select(event.currentTarget.files?.[0])}
      />
      {prepared && review && !committed ? (
        <div
          className="owned-confirm mt-5"
          role="dialog"
          aria-labelledby="json-import-review-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !disabled) {
              event.preventDefault()
              cancelImport()
            }
          }}
        >
          <h4 id="json-import-review-title" className="text-lg font-semibold">
            Revisar importación
          </h4>
          <p className="mt-3 text-sm">
            {review.additions} registros nuevos · {review.unchanged}{' '}
            coincidentes · {review.skippedAlbums} álbumes omitidos.
          </p>
          <p className="mt-3 text-sm">
            {review.conflicts.length} conflictos o coincidencias que revisar;{' '}
            {review.unresolved} sin decidir. Elegir el dato del archivo
            sustituye ese registro completo, incluidos sus campos opcionales.
            Los datos no incluidos en el archivo no se eliminan.
          </p>
          {review.conflicts.some((row) => row.kind === 'record') ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="action-button"
                disabled={disabled}
                onClick={() =>
                  setChoices((previous) => ({
                    ...previous,
                    ...Object.fromEntries(
                      review.conflicts
                        .filter((row) => row.kind === 'record')
                        .map((row) => [row.key, 'current']),
                    ),
                  }))
                }
              >
                Conservar todos los datos actuales en conflicto
              </button>
              <button
                type="button"
                className="action-button"
                disabled={disabled}
                onClick={() =>
                  setChoices((previous) => ({
                    ...previous,
                    ...Object.fromEntries(
                      review.conflicts
                        .filter((row) => row.kind === 'record')
                        .map((row) => [row.key, 'incoming']),
                    ),
                  }))
                }
              >
                Usar todos los datos del archivo en conflicto
              </button>
            </div>
          ) : null}
          {review.conflicts
            .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
            .map((conflict) => (
              <fieldset
                key={conflict.key}
                className="mt-5 min-w-0 border-t border-border pt-4"
                disabled={disabled}
              >
                <legend className="font-semibold wrap-anywhere">
                  {conflict.label}
                </legend>
                {conflict.kind === 'duplicate' ? (
                  <p className="text-sm mt-2">
                    El título y los artistas coinciden, pero la identidad es
                    distinta. Omitir excluye este álbum y sus datos del archivo.
                    Para actualizar el álbum existente, conserva sus
                    identificadores al completar la plantilla.
                  </p>
                ) : null}
                <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Actual</p>
                    <DataPreview
                      value={conflict.current}
                      context={[prepared.expected, prepared.incoming]}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Archivo</p>
                    <DataPreview
                      value={conflict.incoming}
                      context={[prepared.incoming, prepared.expected]}
                    />
                  </div>
                </div>
                <label className="field-label mt-3">
                  Decisión: {conflict.label}
                  <select
                    className="mt-2 w-full min-w-0"
                    value={choices[conflict.key] ?? ''}
                    onChange={(event) =>
                      setChoices((previous) => ({
                        ...previous,
                        [conflict.key]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Elegir…</option>
                    {conflict.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            ))}
          {review.conflicts.length > pageSize ? (
            <nav
              aria-label="Páginas de conflictos"
              className="mt-4 flex flex-wrap items-center gap-3"
            >
              <button
                type="button"
                className="action-button"
                disabled={disabled || currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Conflictos anteriores
              </button>
              <span>
                Página {currentPage + 1} de{' '}
                {Math.ceil(review.conflicts.length / pageSize)}
              </span>
              <button
                type="button"
                className="action-button"
                disabled={
                  disabled ||
                  (currentPage + 1) * pageSize >= review.conflicts.length
                }
                onClick={() => setPage(currentPage + 1)}
              >
                Conflictos siguientes
              </button>
            </nav>
          ) : null}
          {review.problem ? (
            <p className="mt-4 text-sm" role="alert">
              {review.problem}
            </p>
          ) : null}
          <p className="mt-4 text-sm">
            Confirmar aplicará la vista previa en una sola operación. No asigna
            valoraciones ni adquisiciones a partir de un catálogo. Si otra
            pestaña cambia la biblioteca, tendrás que revisarla de nuevo.
            Conserva un respaldo antes de incorporar datos.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              ref={cancel}
              type="button"
              className="action-button"
              disabled={disabled}
              onClick={cancelImport}
            >
              Cancelar importación
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={disabled || !review.snapshot}
              onClick={() => void confirm()}
            >
              Confirmar importación
            </button>
          </div>
        </div>
      ) : null}
      {busy ? (
        <p className="mt-4 text-sm" role="status">
          Procesando importación…
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 text-sm" role="status">
          {notice}
        </p>
      ) : null}
      {failure ? (
        <p
          ref={error}
          tabIndex={-1}
          className="mt-4 text-sm wrap-anywhere"
          role="alert"
        >
          {failure}
        </p>
      ) : null}
      {committed && failure ? (
        <button
          type="button"
          className="primary-button mt-4"
          disabled={busy}
          onClick={() => void retry()}
        >
          Reintentar lectura tras importación
        </button>
      ) : null}
    </section>
  )
}
