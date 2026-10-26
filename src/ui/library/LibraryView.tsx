import {
  defaultLibraryFilters,
  queryLibrary,
  ratingGenre,
  type LibraryAlbum,
  type LibraryFilters,
} from '../../application/library-query'
import { AlbumCard } from './AlbumCard'
import { LibraryControls } from './LibraryControls'

export function LibraryView({
  albums,
  filters,
  onFiltersChange,
  view,
  onViewChange,
  onOpen,
  onAdd,
}: {
  albums: LibraryAlbum[]
  filters: LibraryFilters
  onFiltersChange: (filters: LibraryFilters) => void
  view: 'grid' | 'list'
  onViewChange: (view: 'grid' | 'list') => void
  onOpen: (id: string) => void
  onAdd: () => void
}) {
  const visible = queryLibrary(albums, filters)
  const context = ratingGenre(filters)
  const narrowed = Boolean(
    filters.search ||
    filters.genre ||
    filters.country ||
    filters.listening !== 'all' ||
    filters.rating !== 'all',
  )
  if (!albums.length)
    return (
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
          <button type="button" className="primary-button mt-6" onClick={onAdd}>
            Añadir tu primer álbum
          </button>
        </div>
      </section>
    )
  return (
    <>
      <LibraryControls
        albums={albums}
        filters={filters}
        onChange={onFiltersChange}
        view={view}
        onViewChange={onViewChange}
      />
      <div className="library-results">
        <p role="status" className="text-sm text-muted">
          {visible.length} de {albums.length}{' '}
          {albums.length === 1 ? 'álbum' : 'álbumes'}
          {!context ? ' · Valoración general' : ''}
        </p>
        {narrowed ? (
          <button
            type="button"
            className="text-button"
            onClick={() => onFiltersChange(defaultLibraryFilters)}
          >
            Limpiar búsqueda y filtros
          </button>
        ) : null}
      </div>
      {!visible.length ? (
        <section className="library-empty" aria-labelledby="no-results-title">
          <h2 id="no-results-title" className="text-2xl font-semibold">
            No encontramos coincidencias
          </h2>
          <p className="mt-3 text-muted">
            Prueba otro título o artista, o limpia los filtros.
          </p>
          <button
            type="button"
            className="action-button mt-6"
            onClick={() => onFiltersChange(defaultLibraryFilters)}
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
              {...(context ? { ratingGenre: context } : {})}
              onOpen={() => onOpen(album.id)}
            />
          ))}
        </ul>
      )}
    </>
  )
}
