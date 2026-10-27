import {
  albumScore,
  libraryFilterOptions,
  queryLibrary,
  defaultLibraryFilters,
  ratingGenre,
  type LibraryAlbum,
} from '../../application/library-query'
import { RatingBasisControl } from './RatingBasisControl'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { formatScore } from './labels'

export function RatingsDestination({
  albums,
  search,
  onSearch,
  mode,
  onMode,
  onOpen,
  genre,
  basis,
  onGenre,
  onBasis,
}: {
  albums: LibraryAlbum[]
  search: string
  onSearch: (value: string) => void
  mode: 'unrated' | 'rated'
  onMode: (mode: 'unrated' | 'rated') => void
  onOpen: (id: string) => void
  genre: string
  basis: 'auto' | 'general'
  onGenre: (value: string) => void
  onBasis: (value: 'auto' | 'general') => void
}) {
  const options = libraryFilterOptions(albums).genres
  const context = ratingGenre({ genre, ratingBasis: basis })
  const visible = queryLibrary(albums, {
    ...defaultLibraryFilters,
    search,
    rating: mode,
    genre,
    ratingBasis: basis,
    order: 'rating',
  })
  return (
    <section aria-label="Álbumes por calificar o calificados">
      <div className="mb-5 grid gap-4">
        <label className="ratings-genre-filter">
          <span className="field-label">Género a valorar</span>
          <select
            value={genre}
            onChange={(event) => onGenre(event.target.value)}
          >
            <option value="">Todos los géneros</option>
            {genre && !options.some((item) => item.value === genre) ? (
              <option value={genre}>{genre} (sin coincidencias)</option>
            ) : null}
            {options.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <RatingBasisControl
          {...(genre
            ? {
                genre,
                label:
                  options.find((item) => item.value === genre)?.label ?? genre,
              }
            : {})}
          basis={basis}
          onChange={onBasis}
        />
      </div>
      <div
        className="flex flex-wrap gap-3 mb-5"
        role="group"
        aria-label="Filtrar calificaciones"
      >
        <button
          type="button"
          className="action-button"
          aria-pressed={mode === 'unrated'}
          onClick={() => onMode('unrated')}
        >
          Por calificar
        </button>
        <button
          type="button"
          className="action-button"
          aria-pressed={mode === 'rated'}
          onClick={() => onMode('rated')}
        >
          Calificados
        </button>
      </div>
      <label className="field-label">
        Buscar calificaciones
        <input
          id="rating-search"
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
      {!visible.length ? (
        <p role="status" className="my-6 text-muted">
          No hay álbumes que coincidan.
        </p>
      ) : (
        <ul className="destination-list" aria-label="Calificaciones de álbumes">
          {visible.map((album) => (
            <li key={album.id}>
              <div>
                <h2 className="text-lg font-semibold">{album.title}</h2>
                <p className="text-sm text-muted">
                  {album.artist} ·{' '}
                  {context
                    ? `En ${options.find((item) => item.value === genre)?.label ?? genre}: `
                    : 'General: '}
                  {albumScore(album, context) === undefined
                    ? context
                      ? 'Sin valoración en este género'
                      : 'Sin nota'
                    : formatScore(albumScore(album, context)!)}
                </p>
              </div>
              <button
                type="button"
                className="action-button"
                data-focus-key={`rating-${album.id}`}
                onClick={() => onOpen(album.id)}
              >
                {albumScore(album, context) === undefined
                  ? 'Calificar'
                  : 'Recalificar'}{' '}
                {album.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function WishesDestination({
  albums,
  snapshot,
  onOpen,
}: {
  albums: LibraryAlbum[]
  snapshot: LocalSnapshot
  onOpen: (id: string) => void
}) {
  return (
    <section aria-label="Deseos de la biblioteca">
      <p className="text-sm text-muted">
        Los deseos no cuentan como adquisiciones. Abre un álbum para consultar o
        registrar sus deseos.
      </p>
      <ul className="destination-list">
        {albums.map((album) => (
          <li key={album.id}>
            <div>
              <h2 className="font-semibold">{album.title}</h2>
              <p className="text-sm text-muted">
                {
                  snapshot.library.purchaseWishes.filter(
                    (wish) =>
                      wish.userAlbumId === album.id && wish.status === 'active',
                  ).length
                }{' '}
                deseos activos
              </p>
            </div>
            <button
              type="button"
              className="text-button"
              data-focus-key={`wish-${album.id}`}
              onClick={() => onOpen(album.id)}
            >
              Ver deseos de {album.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
