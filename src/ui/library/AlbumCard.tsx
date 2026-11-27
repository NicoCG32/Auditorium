import { albumScore, type LibraryAlbum } from '../../application/library-query'
import { genreKey } from '../../domain/catalog/genre-key'
import { AlbumCover } from './AlbumCover'
import { formatScore, listeningLabels } from './labels'
import { ArtistLinks } from './ArtistLinks'
import type { Artist } from '../../domain/catalog/schemas'
import type { AlbumHolding } from '../../application/library-holdings'
import { ownedFormatLabels } from './owned-labels'

export function AlbumCard({
  album,
  view,
  onOpen,
  ratingGenre,
  collection,
  artists,
  onArtist,
  details = true,
  selection,
  onActions,
}: {
  album: LibraryAlbum
  view: 'grid' | 'list'
  onOpen: () => void
  ratingGenre?: string
  collection?: AlbumHolding
  artists: Artist[]
  onArtist: (id: string) => void
  details?: boolean
  selection?: { checked: boolean; onToggle: () => void }
  onActions?: (source: HTMLButtonElement) => void
}) {
  const score = albumScore(album, ratingGenre)
  const context = ratingGenre
    ? (album.genres?.find((label) => genreKey(label) === ratingGenre) ??
      ratingGenre)
    : 'General'
  return (
    <li
      data-entry-id={album.id}
      className={`album-card ${view === 'list' ? 'album-row' : ''}${selection?.checked ? ' album-selected' : ''}`}
    >
      {selection ? (
        <label className="album-cover-button album-selection-cover">
          <input
            type="checkbox"
            className="album-selection-input"
            checked={selection.checked}
            aria-label={`Seleccionar ${album.title}${album.artist ? ` de ${album.artist}` : ''}`}
            onChange={selection.onToggle}
          />
          <AlbumCover
            title={album.title}
            {...(album.coverUrl ? { url: album.coverUrl } : {})}
            {...(album.coverImage ? { image: album.coverImage } : {})}
            compact
          />
        </label>
      ) : (
        <button
          id={`album-cover-${album.id}`}
          type="button"
          className="album-cover-button"
          aria-label={`Abrir ficha de ${album.title}`}
          onClick={(event) => {
            event.currentTarget.focus()
            onOpen()
          }}
        >
          <AlbumCover
            title={album.title}
            {...(album.coverUrl ? { url: album.coverUrl } : {})}
            {...(album.coverImage ? { image: album.coverImage } : {})}
            compact
          />
        </button>
      )}
      {!selection && onActions ? (
        <button
          type="button"
          className="album-actions-button"
          aria-label={`Acciones de ${album.title}`}
          title="Acciones del álbum"
          onClick={(event) => onActions(event.currentTarget)}
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      ) : null}
      <div className="album-copy">
        <h2 className="text-xl font-semibold leading-tight wrap-anywhere">
          <button
            id={`album-open-${album.id}`}
            type="button"
            className="album-title-button"
            onClick={(event) => {
              event.currentTarget.focus()
              if (selection) selection.onToggle()
              else onOpen()
            }}
          >
            {album.title}
          </button>
        </h2>
        <p className="album-artist mt-2 text-sm leading-relaxed wrap-anywhere">
          {selection ? (
            album.artist || 'Sin artista'
          ) : (
            <ArtistLinks
              artists={artists}
              fallback={album.artist}
              onOpen={onArtist}
              focusKey={`album-${album.id}`}
            />
          )}
        </p>
        {album.originalYear ? (
          <p className="mt-2 text-xs tracking-wider text-muted">
            {album.originalYear}
          </p>
        ) : null}
        {collection ? (
          <ul className="album-collection-badges" aria-label="En tu colección">
            {collection.copies > 0 ? (
              <li>
                {collection.copies}{' '}
                {collection.copies === 1 ? 'ejemplar' : 'ejemplares'}
              </li>
            ) : null}
            {collection.formats.map((format) => (
              <li key={format}>
                {format === 'digital_download'
                  ? 'Digital'
                  : ownedFormatLabels[format]}
              </li>
            ))}
            {collection.wishes > 0 ? <li>En deseos</li> : null}
          </ul>
        ) : null}
        {details && album.countries?.length ? (
          <p className="mt-2 text-xs text-muted wrap-anywhere">
            País de origen: {album.countries.join(' · ')}
          </p>
        ) : null}
        {details && album.genres?.length ? (
          <ul
            aria-label="Géneros del álbum"
            className="album-genres mt-3 flex flex-wrap gap-2"
          >
            {album.genres.map((genre) => (
              <li key={genre} className="genre-badge wrap-anywhere">
                {genre}
              </li>
            ))}
          </ul>
        ) : null}
        {(details &&
          (album.listeningStatus !== 'untracked' || score !== undefined)) ||
        ratingGenre ? (
          <dl className="album-personal">
            {album.listeningStatus !== 'untracked' ? (
              <div>
                <dt>Escucha</dt>
                <dd className="listening-badge">
                  {listeningLabels[album.listeningStatus]}
                </dd>
              </div>
            ) : null}
            {score !== undefined || ratingGenre ? (
              <div>
                <dt className="wrap-anywhere">Mi nota · {context}</dt>
                <dd className="text-sm font-semibold">
                  {score === undefined ? (
                    <span className="font-normal text-muted">
                      {ratingGenre
                        ? 'Sin valoración en este género'
                        : 'Sin nota'}
                    </span>
                  ) : (
                    <>
                      <span className="text-accent-text">
                        {formatScore(score)}
                      </span>
                      <span className="text-muted"> / 10</span>
                    </>
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </li>
  )
}
