import { useMemo } from 'react'
import type { LibraryAlbum } from '../../application/library-query'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { metadataKey } from '../../domain/catalog/metadata'

export function ArtistsDirectory({
  snapshot,
  albums,
  search,
  onSearch,
  onArtist,
  onSearchCatalog,
}: {
  snapshot: LocalSnapshot
  albums: LibraryAlbum[]
  search: string
  onSearch: (value: string) => void
  onArtist: (id: string) => void
  onSearchCatalog: () => void
}) {
  const artists = useMemo(() => {
    const active = new Set(albums.map((album) => album.albumId))
    const credits = new Map<string, Set<string>>()
    for (const credit of snapshot.catalog.albumArtists) {
      if (!active.has(credit.albumId)) continue
      const works = credits.get(credit.artistId) ?? new Set<string>()
      works.add(credit.albumId)
      credits.set(credit.artistId, works)
    }
    return snapshot.catalog.artists
      .filter((artist) => credits.has(artist.id))
      .map((artist) => ({ ...artist, albums: credits.get(artist.id)!.size }))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) ||
          a.id.localeCompare(b.id),
      )
  }, [snapshot.catalog, albums])
  const query = metadataKey(search)
  const visible = artists.filter((artist) =>
    metadataKey(`${artist.name} ${artist.country ?? ''}`).includes(query),
  )
  return (
    <section
      className="artists-directory"
      aria-label="Artistas de tu colección"
    >
      <div className="directory-controls">
        <label className="search-field">
          Buscar en tus artistas
          <input
            type="search"
            className="text-input"
            value={search}
            onChange={(event) => onSearch(event.currentTarget.value)}
            placeholder="Nombre o país"
          />
        </label>
        <button
          type="button"
          className="action-button"
          onClick={onSearchCatalog}
        >
          Buscar en catálogo
        </button>
      </div>
      <p role="status" className="text-muted">
        {visible.length} {visible.length === 1 ? 'artista' : 'artistas'}
      </p>
      {visible.length ? (
        <ul className="artist-directory-grid">
          {visible.map((artist) => (
            <li key={artist.id}>
              <button
                type="button"
                className="artist-directory-card"
                id={`artist-open-${artist.id}`}
                aria-label={`Ver artista ${artist.name}`}
                onClick={(event) => {
                  event.currentTarget.focus()
                  onArtist(artist.id)
                }}
              >
                <span className="artist-avatar" aria-hidden="true">
                  {Array.from(artist.name)
                    .slice(0, 2)
                    .join('')
                    .toLocaleUpperCase('es')}
                </span>
                <strong>{artist.name}</strong>
                <span>
                  {artist.albums} {artist.albums === 1 ? 'álbum' : 'álbumes'}
                  {artist.country ? ` · ${artist.country}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="library-empty">
          <h2>
            {artists.length
              ? 'No encontramos ese artista'
              : 'Aquí estarán tus artistas'}
          </h2>
          <p>
            {artists.length
              ? 'Prueba con otro nombre o país.'
              : 'Los artistas de los álbumes que guardes aparecerán aquí.'}
          </p>
          {!artists.length && (
            <button
              type="button"
              className="primary-button"
              onClick={onSearchCatalog}
            >
              Buscar una banda
            </button>
          )}
        </div>
      )}
    </section>
  )
}
