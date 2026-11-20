import {
  defaultLibraryFilters,
  queryLibrary,
  ratingGenre,
  type LibraryAlbum,
  type LibraryFilters,
} from '../../application/library-query'
import { AlbumCard } from './AlbumCard'
import { LibraryControls } from './LibraryControls'
import { useMemo } from 'react'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { albumArtistIndex } from '../../application/catalog-artists'
import {
  indexLibraryHoldings,
  inCollectionMedium,
  type CollectionMedium,
} from '../../application/library-holdings'

export function LibraryView({
  albums,
  snapshot,
  filters,
  onFiltersChange,
  view,
  onViewChange,
  onOpen,
  onAdd,
  onArtist,
  medium,
  onMediumChange,
  covers,
  details,
}: {
  albums: LibraryAlbum[]
  snapshot: LocalSnapshot
  filters: LibraryFilters
  onFiltersChange: (filters: LibraryFilters) => void
  view: 'grid' | 'list'
  onViewChange: (view: 'grid' | 'list') => void
  onOpen: (id: string) => void
  onAdd: () => void
  onArtist: (id: string) => void
  medium: CollectionMedium
  onMediumChange: (medium: CollectionMedium) => void
  covers: 'small' | 'medium' | 'large'
  details: boolean
}) {
  const artists = useMemo(
    () => albumArtistIndex(snapshot.catalog),
    [snapshot.catalog],
  )
  const collection = useMemo(
    () => indexLibraryHoldings(snapshot, albums),
    [snapshot, albums],
  )
  const visible = queryLibrary(albums, filters).filter((album) =>
    inCollectionMedium(collection.holdings.get(album.id), medium),
  )
  const context = ratingGenre(filters)
  const narrowed = Boolean(
    medium !== 'all' ||
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
    <section
      className="collection-gallery"
      data-covers={covers}
      aria-label="Tu colección"
    >
      <div
        className="collection-medium"
        role="group"
        aria-label="Mostrar en mi colección"
      >
        {(
          [
            ['all', 'Todos'],
            ['physical', 'Físico'],
            ['digital', 'Digital'],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={medium === value}
            onClick={() => onMediumChange(value)}
          >
            {label} <span>{collection.counts[value]}</span>
          </button>
        ))}
      </div>
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
        </p>
        {narrowed ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onFiltersChange({
                ...defaultLibraryFilters,
                order: filters.order,
              })
              onMediumChange('all')
            }}
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
            {medium === 'all'
              ? 'Prueba otro título o artista, o limpia los filtros.'
              : `Aquí aparecen los álbumes con ${medium === 'physical' ? 'ejemplares físicos' : 'ejemplares digitales'} registrados en su ficha.`}
          </p>
          <button
            type="button"
            className="action-button mt-6"
            onClick={() => {
              onFiltersChange({
                ...defaultLibraryFilters,
                order: filters.order,
              })
              onMediumChange('all')
            }}
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
              artists={artists.get(album.albumId) ?? []}
              onArtist={onArtist}
              {...(collection.holdings.has(album.id)
                ? { collection: collection.holdings.get(album.id)! }
                : {})}
              details={
                details ||
                Boolean(
                  filters.genre ||
                  filters.country ||
                  filters.listening !== 'all' ||
                  filters.rating !== 'all' ||
                  ['rating', 'genre', 'country'].includes(filters.order),
                )
              }
              {...(context ? { ratingGenre: context } : {})}
              onOpen={() => onOpen(album.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
