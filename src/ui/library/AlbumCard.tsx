import type { LibraryAlbum } from '../../application/library-query'
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
      <div className="album-art" aria-hidden="true">
        <div className="album-disc">
          <span className="album-disc-center" />
        </div>
        <span className="album-initial">{Array.from(album.title)[0]}</span>
      </div>
      <div className="album-copy">
        <p className="mb-3 text-xs tracking-wider text-muted">
          {album.originalYear ?? 'Año sin registrar'}
        </p>
        <h2 className="text-xl font-semibold leading-tight wrap-anywhere">
          <button type="button" className="album-title-button" onClick={onOpen}>
            {album.title}
          </button>
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted wrap-anywhere">
          {album.artist}
        </p>
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
