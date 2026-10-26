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
import { ownedFormatLabels } from './owned-labels'

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

export function CollectionDestination({
  albums,
  snapshot,
  medium,
  onMedium,
  onOpen,
}: {
  albums: LibraryAlbum[]
  snapshot: LocalSnapshot
  medium: 'all' | 'physical' | 'purchased_digital'
  onMedium: (value: 'all' | 'physical' | 'purchased_digital') => void
  onOpen: (id: string) => void
}) {
  const byId = new Map(albums.map((album) => [album.id, album]))
  const items = snapshot.library.ownedItems.filter((item) =>
    byId.has(item.userAlbumId),
  )
  const visible = items.filter(
    (item) => medium === 'all' || item.medium === medium,
  )
  return (
    <section aria-label="Adquisiciones de mi colección">
      <p className="mb-5 text-sm text-muted">
        {items.filter((item) => item.medium === 'physical').length} ejemplares
        físicos ·{' '}
        {items.filter((item) => item.medium === 'purchased_digital').length}{' '}
        adquisiciones digitales. El streaming por suscripción no registra una
        compra.
      </p>
      <label className="field-label">
        Medio de la colección
        <select
          id="collection-medium"
          value={medium}
          onChange={(event) => onMedium(event.target.value as typeof medium)}
        >
          <option value="all">Todos los medios</option>
          <option value="physical">Físico</option>
          <option value="purchased_digital">Digital adquirido</option>
        </select>
      </label>
      {!visible.length ? (
        <p role="status" className="my-6 text-muted">
          No hay adquisiciones en esta vista.
        </p>
      ) : (
        <ul className="destination-list" aria-label="Adquisiciones registradas">
          {visible.map((item, index) => {
            const album = byId.get(item.userAlbumId)!
            const release = snapshot.catalog.releases.find(
              (row) => row.id === item.releaseId,
            )
            return (
              <li key={item.id}>
                <div>
                  <h2 className="text-lg font-semibold">{album.title}</h2>
                  <p className="text-sm text-muted">
                    {[
                      ownedFormatLabels[item.format] +
                        ' · Adquisición ' +
                        (index + 1),
                      release?.editionLabel,
                      release?.releaseYear,
                    ]
                      .filter((value) => value !== undefined && value !== '')
                      .join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-button"
                  data-focus-key={`owned-${item.id}`}
                  onClick={() => onOpen(album.id)}
                >
                  Ver álbum {album.title}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <h2 className="text-xl font-semibold mt-8">Registrar una adquisición</h2>
      <p className="mt-3 text-sm text-muted">
        Elige un álbum de tu biblioteca para abrir su colección.
      </p>
      <ul
        className="destination-list"
        aria-label="Elegir álbum para la colección"
      >
        {albums.map((album) => (
          <li key={album.id}>
            <span>
              {album.title} · {album.artist}
            </span>
            <button
              type="button"
              className="text-button"
              data-focus-key={`collection-${album.id}`}
              onClick={() => onOpen(album.id)}
            >
              Abrir colección de {album.title}
            </button>
          </li>
        ))}
      </ul>
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
