import { useEffect, useState } from 'react'
import {
  defaultLibraryFilters,
  projectLibrary,
  queryLibrary,
  type LibraryAlbum,
} from '../../application/library-query'
import type { LocalRepository } from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { AlbumCard } from './AlbumCard'
import { LibraryControls } from './LibraryControls'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; albums: LibraryAlbum[] }
function errorMessage(error: unknown) {
  if (error instanceof LocalStorageError) {
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

export function LibraryPage({ repository }: { repository: LocalRepository }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [request, setRequest] = useState(0)
  const [filters, setFilters] = useState(defaultLibraryFilters)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  useEffect(() => {
    let active = true
    void repository
      .readSnapshot()
      .then((snapshot) => {
        const albums = projectLibrary(snapshot)
        if (active) setState({ status: 'ready', albums })
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', message: errorMessage(error) })
      })
    return () => {
      active = false
    }
  }, [repository, request])
  function refresh() {
    setState({ status: 'loading' })
    setRequest((previous) => previous + 1)
  }
  const visible =
    state.status === 'ready' ? queryLibrary(state.albums, filters) : []
  return (
    <>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
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
        <button
          type="button"
          className="action-button"
          onClick={refresh}
          disabled={state.status === 'loading'}
        >
          Actualizar biblioteca
        </button>
      </div>
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
      ) : state.albums.length === 0 ? (
        <section className="library-empty" aria-labelledby="empty-title">
          <span className="empty-record" aria-hidden="true" />
          <p className="mb-3 text-xs tracking-widest text-accent-text uppercase">
            Tu archivo comienza aquí
          </p>
          <h2 id="empty-title" className="text-3xl font-semibold">
            Aún no hay álbumes
          </h2>
          <p className="mt-4 max-w-md text-muted">
            Los álbumes que registres aparecerán en este espacio. Actualiza la
            biblioteca para consultar los últimos cambios guardados.
          </p>
          <button
            type="button"
            className="action-button mt-6"
            onClick={refresh}
          >
            Consultar cambios guardados
          </button>
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
                <AlbumCard key={album.id} album={album} view={view} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
