import type { Album, Artist } from '../domain/catalog/schemas'
import type { LocalSnapshot } from '../domain/repositories/local-repository'
import type { CreateAlbumInput } from './inputs'

export function normalizedName(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/gu, ' ')
}

export interface AlbumCandidate {
  album: Album
  artist: string
  activeEntryId?: string
}

export function matchingArtists(artists: Artist[], name: string): Artist[] {
  const term = normalizedName(name)
  return term
    ? artists.filter((artist) => normalizedName(artist.name) === term)
    : []
}

export function albumCandidates(
  snapshot: LocalSnapshot,
  request: CreateAlbumInput,
): AlbumCandidate[] {
  const artists = new Map(
    snapshot.catalog.artists.map((artist) => [artist.id, artist]),
  )
  const active = new Map(
    snapshot.library.userAlbums
      .filter((entry) => entry.deletedAt === undefined)
      .map((entry) => [entry.albumId, entry.id]),
  )
  const credits = new Map<string, typeof snapshot.catalog.albumArtists>()
  for (const credit of snapshot.catalog.albumArtists) {
    const rows = credits.get(credit.albumId) ?? []
    rows.push(credit)
    credits.set(credit.albumId, rows)
  }
  return snapshot.catalog.albums
    .filter(
      (album) => normalizedName(album.title) === normalizedName(request.title),
    )
    .flatMap((album) => {
      const rows = (credits.get(album.id) ?? []).toSorted(
        (a, b) => a.position - b.position,
      )
      const matched = request.artists.some((requested) =>
        rows.some((row) => {
          if ('artistId' in requested)
            return requested.artistId === row.artistId
          const artist = artists.get(row.artistId)
          return (
            (artist !== undefined &&
              normalizedName(artist.name) === normalizedName(requested.name)) ||
            (row.creditedAs !== undefined &&
              normalizedName(row.creditedAs) === normalizedName(requested.name))
          )
        }),
      )
      if (!matched) return []
      const entryId = active.get(album.id)
      return [
        {
          album,
          artist: rows
            .map(
              (row) => row.creditedAs ?? artists.get(row.artistId)?.name ?? '',
            )
            .join(' · '),
          ...(entryId === undefined ? {} : { activeEntryId: entryId }),
        },
      ]
    })
    .toSorted((a, b) => a.album.id.localeCompare(b.album.id))
}
