import {
  defaultCollectionFilters,
  queryCollection,
  type CollectionFilters,
} from '../../application/collection-query'
import {
  defaultLibraryFilters,
  queryLibrary,
  type LibraryAlbum,
} from '../../application/library-query'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { ownedFormatSchema } from '../../domain/library/owned-items'
import {
  ownedFormatLabels,
  ownedItemLabels,
  ownedMediumLabels,
  conditionLabels,
} from './owned-labels'
import { releaseLabels } from './release-labels'
import { AlbumCover } from './AlbumCover'

export function CollectionDestination({
  albums,
  snapshot,
  filters,
  onFilters,
  onOpen,
  onWishes,
  onAdd,
  albumSearch,
  onAlbumSearch,
  registerOpen,
  onRegisterOpen,
}: {
  albums: LibraryAlbum[]
  snapshot: LocalSnapshot
  filters: CollectionFilters
  onFilters: (value: CollectionFilters) => void
  onOpen: (id: string) => void
  onWishes: () => void
  onAdd: () => void
  albumSearch: string
  onAlbumSearch: (value: string) => void
  registerOpen: boolean
  onRegisterOpen: (value: boolean) => void
}) {
  const result = queryCollection(snapshot, albums, filters)
  const names = releaseLabels(snapshot.catalog.releases)
  const itemNames = ownedItemLabels(snapshot.library.ownedItems)
  const narrowed = Boolean(
    filters.search || filters.medium !== 'all' || filters.format !== 'all',
  )
  const choices = queryLibrary(albums, {
    ...defaultLibraryFilters,
    search: albumSearch,
    order: 'title',
  })
  return (
    <section
      className="collection-destination"
      aria-label="Adquisiciones de mi colección"
    >
      <p className="text-sm text-muted">
        Tus copias y compras individuales, agrupadas en una sola colección. Una
        suscripción, un enlace o un archivo de audio no registran una
        adquisición.
      </p>
      <dl className="collection-counts">
        <div>
          <dt>Ejemplares físicos</dt>
          <dd>{result.physical}</dd>
        </div>
        <div>
          <dt>Digital adquirido</dt>
          <dd>{result.digital}</dd>
        </div>
        <div>
          <dt>Álbumes en colección</dt>
          <dd>{result.albumCount}</dd>
        </div>
      </dl>
      <div className="collection-filters">
        <label className="collection-search">
          <span className="field-label">Buscar en mi colección</span>
          <input
            type="search"
            value={filters.search}
            placeholder="Álbum, artista, edición o formato"
            onChange={(event) =>
              onFilters({ ...filters, search: event.target.value })
            }
          />
        </label>
        <label>
          <span className="field-label">Medio de la colección</span>
          <select
            value={filters.medium}
            onChange={(event) =>
              onFilters({
                ...filters,
                medium: event.target.value as CollectionFilters['medium'],
                format: 'all',
              })
            }
          >
            <option value="all">Todos los medios</option>
            <option value="physical">Físico</option>
            <option value="purchased_digital">Digital adquirido</option>
          </select>
        </label>
        <label>
          <span className="field-label">Formato de la colección</span>
          <select
            value={filters.format}
            onChange={(event) =>
              onFilters({
                ...filters,
                format: event.target.value as CollectionFilters['format'],
              })
            }
          >
            <option value="all">Todos los formatos</option>
            {ownedFormatSchema.options
              .filter(
                (format) =>
                  filters.medium === 'all' ||
                  (filters.medium === 'physical'
                    ? format !== 'digital_download'
                    : format === 'digital_download'),
              )
              .map((format) => (
                <option key={format} value={format}>
                  {ownedFormatLabels[format]}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="collection-results">
        <p role="status">
          {result.visible.length} de {result.all.length} adquisiciones
        </p>
        {narrowed ? (
          <button
            type="button"
            className="text-button"
            onClick={() => onFilters(defaultCollectionFilters)}
          >
            Limpiar filtros de colección
          </button>
        ) : null}
      </div>
      {!result.all.length ? (
        <div className="collection-empty">
          <h2 className="text-xl font-semibold">
            Tu colección empieza con una adquisición
          </h2>
          <p className="mt-3 text-muted">
            Registra un ejemplar físico o una compra digital de un álbum de tu
            biblioteca. Puedes conocer y valorar música sin poseerla.
          </p>
        </div>
      ) : !result.visible.length ? (
        <p className="my-6 text-muted">
          No hay adquisiciones que coincidan. Prueba otro formato o limpia los
          filtros.
        </p>
      ) : (
        <ul className="collection-list" aria-label="Adquisiciones registradas">
          {result.visible.map(({ item, album }) => (
            <li key={item.id} className="collection-card">
              <div className="collection-cover">
                <AlbumCover
                  title={album.title}
                  url={album.coverUrl}
                  image={album.coverImage}
                  compact
                />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold wrap-anywhere">
                  {album.title}
                </h2>
                <p className="text-sm text-muted wrap-anywhere">
                  {album.artist}
                </p>
                <h3 className="mt-3 font-semibold">{itemNames.get(item.id)}</h3>
                <p className="text-sm text-muted">
                  {ownedMediumLabels[item.medium]}
                </p>
                <p className="mt-2 text-sm wrap-anywhere">
                  {item.releaseId
                    ? names.get(item.releaseId)
                    : 'Edición sin determinar'}
                </p>
                {item.acquiredAt ? (
                  <p className="mt-2 text-sm">Adquirido: {item.acquiredAt}</p>
                ) : null}
                {item.mediaCondition || item.sleeveCondition ? (
                  <p className="mt-2 text-sm text-muted">
                    {[
                      item.mediaCondition
                        ? `Soporte: ${conditionLabels[item.mediaCondition]}`
                        : undefined,
                      item.sleeveCondition
                        ? `Funda: ${conditionLabels[item.sleeveCondition]}`
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
                {item.notes ? (
                  <p className="mt-2 text-sm whitespace-pre-wrap wrap-anywhere">
                    {item.notes}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="action-button mt-4"
                  data-focus-key={`owned-${item.id}`}
                  onClick={(event) => {
                    event.currentTarget.focus()
                    onOpen(album.id)
                  }}
                >
                  Ver álbum {album.title}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <details
        className="collection-register"
        open={registerOpen}
        onToggle={(event) => onRegisterOpen(event.currentTarget.open)}
      >
        <summary>Registrar una adquisición</summary>
        <p className="mt-3 text-sm text-muted">
          Elige el álbum y registra cada copia por separado. La edición es
          opcional y puede compartirse entre varias copias.
        </p>
        {!albums.length ? (
          <button
            type="button"
            className="action-button mt-4"
            onClick={(event) => {
              event.currentTarget.focus()
              onAdd()
            }}
          >
            Añadir un álbum a la biblioteca
          </button>
        ) : (
          <>
            <label className="mt-4 block">
              <span className="field-label">
                Buscar álbum para registrar una adquisición
              </span>
              <input
                type="search"
                value={albumSearch}
                onChange={(event) => onAlbumSearch(event.target.value)}
              />
            </label>
            {!choices.length ? (
              <p role="status" className="mt-3 text-muted">
                No hay álbumes que coincidan.
              </p>
            ) : (
              <ul
                className="destination-list"
                aria-label="Elegir álbum para la colección"
              >
                {choices.map((album) => (
                  <li key={album.id}>
                    <span>
                      {album.title} · {album.artist}
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      data-focus-key={`collection-${album.id}`}
                      onClick={(event) => {
                        event.currentTarget.focus()
                        onOpen(album.id)
                      }}
                    >
                      Abrir colección de {album.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </details>
      <div className="collection-wishes">
        <p className="text-sm text-muted">
          Los deseos conservan su espacio aparte y no se cuentan como
          adquisiciones.
        </p>
        <button
          type="button"
          className="text-button mt-2"
          onClick={(event) => {
            event.currentTarget.focus()
            onWishes()
          }}
        >
          Consultar deseos de compra
        </button>
      </div>
    </section>
  )
}
