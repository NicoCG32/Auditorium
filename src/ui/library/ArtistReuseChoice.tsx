import { useId } from 'react'
import { matchingArtists } from '../../application/album-candidates'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'

export function ArtistReuseChoice({
  snapshot,
  name,
  selectedId,
  confirmedNew,
  onChange,
}: {
  snapshot: LocalSnapshot
  name: string
  selectedId: string | undefined
  confirmedNew: boolean
  onChange: (id: string | undefined) => void
}) {
  const group = useId()
  const artists = matchingArtists(snapshot.catalog.artists, name)
  if (!artists.length) return null
  return (
    <fieldset className="artist-options">
      <legend className="text-sm font-semibold">
        Hay artistas con este nombre: {name}
      </legend>
      <p className="my-3 text-sm text-muted">
        Selecciona el artista correcto para conservar sus datos. Si es un
        homónimo, confirma un artista nuevo.
      </p>
      {artists.map((artist) => {
        const albums = new Set(
          snapshot.catalog.albumArtists
            .filter((credit) => credit.artistId === artist.id)
            .map((credit) => credit.albumId),
        )
        const titles = snapshot.catalog.albums
          .filter((album) => albums.has(album.id))
          .slice(0, 3)
          .map((album) => album.title)
          .join(', ')
        return (
          <label key={artist.id} className="radio-option">
            <input
              type="radio"
              name={`artist-choice-${group}`}
              checked={selectedId === artist.id}
              onChange={() => onChange(artist.id)}
            />
            <span>
              Usar {artist.name}
              <small className="mt-1 block text-muted">
                {[artist.country, titles || 'Sin álbumes registrados']
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            </span>
          </label>
        )
      })}
      <label className="radio-option">
        <input
          type="radio"
          name={`artist-choice-${group}`}
          checked={!selectedId && confirmedNew}
          onChange={() => onChange(undefined)}
        />
        <span>Es otro artista con este nombre (crear uno nuevo)</span>
      </label>
    </fieldset>
  )
}
