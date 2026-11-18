import { albumScore, type LibraryAlbum } from '../../application/library-query'
import { genreKey } from '../../domain/catalog/genre-key'
import { AlbumCover } from './AlbumCover'
import { formatScore, listeningLabels } from './labels'
import { ArtistLinks } from './ArtistLinks'
import type { Artist } from '../../domain/catalog/schemas'

export function AlbumCard({
  album,
  view,
  onOpen,
  ratingGenre,
  collection,
  artists,
  onArtist,
}: {
  album: LibraryAlbum
  view: 'grid' | 'list'
  onOpen: () => void
  ratingGenre?: string
  collection?: { copies: number; wishes: number }
  artists: Artist[]
  onArtist: (id: string) => void
}) {
  const score = albumScore(album, ratingGenre)
  const context = ratingGenre
    ? (album.genres?.find((label) => genreKey(label) === ratingGenre) ??
      ratingGenre)
    : 'General'
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
          <ArtistLinks
            artists={artists}
            fallback={album.artist}
            onOpen={onArtist}
            focusKey={`album-${album.id}`}
          />
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
            {collection.wishes > 0 ? <li>En deseos</li> : null}
          </ul>
        ) : null}
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
        {album.listeningStatus !== 'untracked' ||
        score !== undefined ||
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
