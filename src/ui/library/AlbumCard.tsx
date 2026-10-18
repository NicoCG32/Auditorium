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
      <AlbumCover
        title={album.title}
        {...(album.coverUrl ? { url: album.coverUrl } : {})}
        {...(album.coverImage ? { image: album.coverImage } : {})}
        compact
      />
      <div className="album-copy">
        <p className="mb-3 text-xs tracking-wider text-muted">
          {album.originalYear ?? 'Año sin registrar'}
        </p>
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
        <p className="mt-2 text-sm leading-relaxed text-muted wrap-anywhere">
          {album.artist}
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
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="listening-badge">
            {listeningLabels[album.listeningStatus]}
          </span>
          <p className="text-sm font-semibold">
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
          </p>
        </div>
      </div>
    </li>
  )
}
