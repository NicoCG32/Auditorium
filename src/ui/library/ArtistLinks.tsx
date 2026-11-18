import type { Artist } from '../../domain/catalog/schemas'
export function ArtistLinks({
  artists,
  fallback,
  onOpen,
  focusKey,
  disabled = false,
}: {
  artists: Artist[]
  fallback: string
  onOpen: (id: string) => void
  focusKey: string
  disabled?: boolean
}) {
  return (
    <span className="artist-links">
      {artists.length
        ? artists.map((artist, index) => (
            <span key={artist.id}>
              {index ? ' · ' : ''}
              <button
                type="button"
                className="artist-link"
                aria-label={`Ver artista ${artist.name}`}
                disabled={disabled}
                data-focus-key={`${focusKey}-artist-${artist.id}`}
                onClick={(event) => {
                  event.currentTarget.focus()
                  onOpen(artist.id)
                }}
              >
                {artist.name}
              </button>
            </span>
          ))
        : fallback}
    </span>
  )
}
