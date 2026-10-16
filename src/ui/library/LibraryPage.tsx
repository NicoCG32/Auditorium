import { useEffect, useMemo, useRef, useState } from 'react'
import {
  defaultLibraryFilters,
  projectLibrary,
  queryLibrary,
  type LibraryAlbum,
} from '../../application/library-query'
import { MusicLibrary } from '../../application/music-library'
import type {
  LocalSnapshot,
  BackupLocalRepository,
} from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { AlbumCard } from './AlbumCard'
import { AlbumForm } from './AlbumForm'
import { AlbumSummary } from './AlbumSummary'
import { LibraryControls } from './LibraryControls'
import { RemovedAlbumsPanel } from './RemovedAlbumsPanel'
import { BackupPanel } from './BackupPanel'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; albums: LibraryAlbum[]; snapshot: LocalSnapshot }
function errorMessage(error: unknown) {
  if (error instanceof LocalStorageError) {
    if (error.code === 'quota_exceeded')
      return 'No hay espacio para abrir tu biblioteca. Los datos existentes se conservan; libera espacio y vuelve a intentar.'
    if (error.code === 'aborted')
      return 'La apertura de tu biblioteca no pudo completarse. Los datos existentes se conservan; vuelve a intentar.'
    if (error.code === 'blocked')
      return 'Otra pestaña impide abrir tu biblioteca. Ciérrala y vuelve a intentar.'
    if (error.code === 'unavailable')
      return 'Este navegador no permite acceder al almacenamiento local. Revisa sus permisos y vuelve a intentar.'
    if (
      ['corrupt_data', 'identity_missing', 'version_mismatch'].includes(
        error.code,
      )
    )
      return 'No se puede abrir esta biblioteca con seguridad. Los datos se conservan; comprueba que utilizas la versión adecuada antes de volver a intentar.'
  }
  return 'No se pudo leer tu biblioteca. Vuelve a intentar.'
}

export function LibraryPage({
  repository,
}: {
  repository: BackupLocalRepository
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [request, setRequest] = useState(0)
  const [filters, setFilters] = useState(defaultLibraryFilters)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string>()
  const [notice, setNotice] = useState('')
  const [detailBusy, setDetailBusy] = useState(false)
  const [removedOpen, setRemovedOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const backupButton = useRef<HTMLButtonElement>(null)
  const focusBackup = useRef(false)
  const removedButton = useRef<HTMLButtonElement>(null)
  const focusRemoved = useRef(false)
  const addButton = useRef<HTMLButtonElement>(null)
  const focusAdd = useRef(false)
  const focusEntry = useRef<string | undefined>(undefined)
  const content = useRef<HTMLDivElement>(null)
  const library = useMemo(() => new MusicLibrary(repository), [repository])
  useEffect(() => {
    let active = true
    void repository
      .readSnapshot()
      .then((snapshot) => {
        const albums = projectLibrary(snapshot)
        if (active) setState({ status: 'ready', albums, snapshot })
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', message: errorMessage(error) })
      })
    return () => {
      active = false
    }
  }, [repository, request])
  useEffect(() => {
    if (!backupOpen && focusBackup.current) {
      backupButton.current?.focus()
      focusBackup.current = false
    }
    if (!removedOpen && focusRemoved.current) {
      removedButton.current?.focus()
      focusRemoved.current = false
    }
    if (!formOpen && focusAdd.current) {
      addButton.current?.focus()
      focusAdd.current = false
    }
    if (
      state.status === 'ready' &&
      selectedId === undefined &&
      !formOpen &&
      focusEntry.current
    ) {
      const target = content.current?.querySelector<HTMLButtonElement>(
        `[data-entry-id="${focusEntry.current}"] button`,
      )
      const nextFocus =
        target ??
        content.current?.querySelector<HTMLInputElement>(
          'input[type="search"]',
        ) ??
        addButton.current
      nextFocus?.focus()
      focusEntry.current = undefined
    }
  }, [state, selectedId, formOpen, removedOpen, backupOpen])
  function refresh() {
    setState({ status: 'loading' })
    setRequest((previous) => previous + 1)
  }
  function complete(entryId: string, openExisting: boolean) {
    setBackupOpen(false)
    setRemovedOpen(false)
    setFormOpen(false)
    setFilters(defaultLibraryFilters)
    setSelectedId(openExisting ? entryId : undefined)
    focusEntry.current = openExisting ? undefined : entryId
    setNotice(
      openExisting
        ? 'Álbum disponible en tu biblioteca.'
        : 'Álbum guardado en tu biblioteca.',
    )
    refresh()
  }
  async function synchronizeDetail() {
    const snapshot = await repository.readSnapshot()
    setState({ status: 'ready', albums: projectLibrary(snapshot), snapshot })
    return snapshot
  }
  async function synchronizeRating() {
    await synchronizeDetail()
  }
  const visible =
    state.status === 'ready' ? queryLibrary(state.albums, filters) : []
  const selected =
    state.status === 'ready'
      ? state.albums.find((entry) => entry.id === selectedId)
      : undefined
  const selectedAlbum =
    state.status === 'ready' && selected
      ? state.snapshot.catalog.albums.find(
          (album) => album.id === selected.albumId,
        )
      : undefined
  const personalEntry =
    state.status === 'ready' && selected
      ? state.snapshot.library.userAlbums.find((row) => row.id === selected.id)
      : undefined
  return (
    <div ref={content}>
      <div className="library-intro mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 wrap-anywhere">
          <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-accent-text uppercase">
            El archivo de tu música
          </p>
          <h1 className="library-title font-display font-black">
            Tu biblioteca
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
            Los álbumes que te acompañan y los que te quedan por descubrir.
          </p>
        </div>
        <div className="library-actions flex flex-wrap gap-3">
          <button
            ref={addButton}
            type="button"
            className="primary-button"
            disabled={state.status !== 'ready' || formOpen || detailBusy}
            onClick={() => {
              setSelectedId(undefined)
              setRemovedOpen(false)
              setBackupOpen(false)
              setNotice('')
              setFormOpen(true)
            }}
          >
            Añadir álbum
          </button>
          <button
            type="button"
            className="action-button"
            onClick={refresh}
            disabled={state.status === 'loading' || formOpen || detailBusy}
          >
            Actualizar biblioteca
          </button>
          <button
            ref={removedButton}
            type="button"
            className="action-button"
            disabled={state.status !== 'ready' || formOpen || detailBusy}
            onClick={() => {
              setSelectedId(undefined)
              setRemovedOpen(true)
              setBackupOpen(false)
              setNotice('')
            }}
          >
            Álbumes retirados
            {state.status === 'ready'
              ? ` (${
                  state.snapshot.library.userAlbums.filter(
                    (row) => row.deletedAt !== undefined,
                  ).length
                })`
              : ''}
          </button>
          <button
            ref={backupButton}
            type="button"
            className="action-button"
            disabled={state.status !== 'ready' || formOpen || detailBusy}
            onClick={() => {
              setSelectedId(undefined)
              setRemovedOpen(false)
              setBackupOpen(true)
              setNotice('')
            }}
          >
            Respaldos
          </button>
        </div>
      </div>
      {notice ? (
        <p className="mb-6 text-sm text-accent-text" role="status">
          {notice}
        </p>
      ) : null}
      {state.status === 'loading' ? (
        <div className="library-empty" role="status">
          <p>Cargando tu biblioteca…</p>
        </div>
      ) : state.status === 'error' ? (
        <section className="library-empty" aria-labelledby="error-title">
          <h2 id="error-title" className="text-2xl font-semibold">
            No pudimos abrir la biblioteca
          </h2>
          <p className="mt-4 max-w-lg text-muted" role="alert">
            {state.message}
          </p>
          <button
            type="button"
            className="action-button mt-6"
            onClick={refresh}
          >
            Volver a intentar
          </button>
        </section>
      ) : formOpen ? (
        <AlbumForm
          snapshot={state.snapshot}
          library={library}
          onComplete={complete}
          onCancel={() => {
            focusAdd.current = true
            setFormOpen(false)
          }}
        />
      ) : backupOpen ? (
        <BackupPanel
          repository={repository}
          snapshot={state.snapshot}
          blocked={detailBusy}
          onBusyChange={setDetailBusy}
          onCommitted={synchronizeDetail}
          onRestored={() => {
            setBackupOpen(false)
            setFilters(defaultLibraryFilters)
            setSelectedId(undefined)
            focusAdd.current = true
            setNotice('Biblioteca restaurada con sus datos e identidad local.')
          }}
          onBack={() => {
            focusBackup.current = true
            setBackupOpen(false)
          }}
        />
      ) : removedOpen ? (
        <RemovedAlbumsPanel
          snapshot={state.snapshot}
          library={library}
          blocked={detailBusy}
          onBusyChange={setDetailBusy}
          onCommitted={synchronizeDetail}
          onRestored={(entryId) => {
            setRemovedOpen(false)
            setSelectedId(entryId)
            setNotice('Álbum restaurado con sus datos personales.')
          }}
          onOpenActive={(entryId) => {
            setRemovedOpen(false)
            setSelectedId(entryId)
          }}
          onBack={() => {
            focusRemoved.current = true
            setRemovedOpen(false)
          }}
        />
      ) : selected && selectedAlbum && personalEntry ? (
        <AlbumSummary
          key={selected.id}
          album={selectedAlbum}
          entry={selected}
          library={library}
          onRatingCommitted={synchronizeRating}
          busy={detailBusy}
          onBusyChange={setDetailBusy}
          personalEntry={personalEntry}
          catalog={state.snapshot.catalog}
          trackRatings={state.snapshot.library.trackRatings}
          ownedItems={state.snapshot.library.ownedItems}
          purchaseWishes={state.snapshot.library.purchaseWishes}
          personalLibrary={state.snapshot.library}
          onRemoved={() => {
            focusEntry.current = selected.id
            setSelectedId(undefined)
            setNotice(
              'Álbum retirado. Puedes restaurarlo desde «Álbumes retirados» con todos sus datos personales.',
            )
          }}
          onExperienceCommitted={synchronizeDetail}
          onBack={() => {
            focusEntry.current = selected.id
            setSelectedId(undefined)
          }}
        />
      ) : state.albums.length === 0 ? (
        <section
          className="library-empty library-welcome"
          aria-labelledby="empty-title"
        >
          <div className="welcome-art" aria-hidden="true">
            <img
              src={`${import.meta.env.BASE_URL}auditorium/brand/logo-stacked.webp`}
              alt=""
              width={1254}
              height={1254}
            />
          </div>
          <div className="welcome-copy">
            <p className="mb-3 text-xs tracking-widest text-accent-text uppercase">
              Tu archivo comienza aquí
            </p>
            <h2 id="empty-title" className="text-3xl font-semibold">
              Aún no hay álbumes
            </h2>
            <p className="mt-4 max-w-md text-muted">
              Empieza con un artista y un título. Después podrás completar el
              resto.
            </p>
            <button
              type="button"
              className="primary-button mt-6"
              onClick={() => setFormOpen(true)}
            >
              Añadir tu primer álbum
            </button>
          </div>
        </section>
      ) : (
        <>
          <LibraryControls
            filters={filters}
            onChange={setFilters}
            view={view}
            onViewChange={setView}
          />
          <div className="my-6 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-muted">
              {visible.length} de {state.albums.length}{' '}
              {state.albums.length === 1 ? 'álbum' : 'álbumes'}
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => setFilters(defaultLibraryFilters)}
            >
              Limpiar búsqueda y filtros
            </button>
          </div>
          {visible.length === 0 ? (
            <section
              className="library-empty"
              aria-labelledby="no-results-title"
            >
              <h2 id="no-results-title" className="text-2xl font-semibold">
                No encontramos coincidencias
              </h2>
              <p className="mt-3 text-muted">
                Prueba otro título o artista, o limpia los filtros.
              </p>
              <button
                type="button"
                className="action-button mt-6"
                onClick={() => setFilters(defaultLibraryFilters)}
              >
                Mostrar todos los álbumes
              </button>
            </section>
          ) : (
            <ul
              aria-label="Álbumes de tu biblioteca"
              className={view === 'grid' ? 'album-grid' : 'album-list'}
            >
              {visible.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  view={view}
                  onOpen={() => setSelectedId(album.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
