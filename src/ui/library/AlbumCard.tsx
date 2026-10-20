import type { LibraryAlbum } from '../../application/library-query'
import { AlbumCover } from './AlbumCover'
import { formatScore, listeningLabels } from './labels'

export function AlbumCard({
  album,
  view,
  onOpen,
}: {
  album: LibraryAlbum
  view: 'grid' | 'list'
  onOpen: () => void
}) {
  return (
    <li
      data-entry-id={album.id}
      className={`album-card ${view === 'list' ? 'album-row' : ''}`}
    >
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
      <div className="album-copy">
        <h2 className="text-xl font-semibold leading-tight wrap-anywhere">
          <button
            id={`album-open-${album.id}`}
            type="button"
            className="album-title-button"
            onClick={(event) => {
              event.currentTarget.focus()
              onOpen()
            }}
          >
            {album.title}
          </button>
        </h2>
        <p className="album-artist mt-2 text-sm leading-relaxed wrap-anywhere">
          {album.artist}
        </p>
        <p className="mt-2 text-xs tracking-wider text-muted">
          {album.originalYear ?? 'Año sin registrar'}
        </p>
        {album.countries?.length ? (
          <p className="mt-2 text-xs text-muted wrap-anywhere">
            País de origen: {album.countries.join(' · ')}
          </p>
        ) : null}
        {album.genres?.length ? (
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
        <dl className="album-personal">
          <div>
            <dt>Escucha</dt>
            <dd className="listening-badge">
              {listeningLabels[album.listeningStatus]}
            </dd>
          </div>
          <div>
            <dt>Mi nota</dt>
            <dd className="text-sm font-semibold">
              {album.score === undefined ? (
                <span className="font-normal text-muted">Sin nota</span>
              ) : (
                <>
                  <span className="text-accent-text">
                    {formatScore(album.score)}
                  </span>
                  <span className="text-muted"> / 10</span>
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </li>
  )
}
