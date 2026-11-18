import type { Artist, Catalog } from '../domain/catalog/schemas'

export function albumArtistIndex(catalog: Catalog): Map<string, Artist[]> {
  const artists = new Map(catalog.artists.map((row) => [row.id, row]))
  const result = new Map<string, Artist[]>()
  for (const credit of catalog.albumArtists.toSorted(
    (a, b) => a.position - b.position,
  )) {
    const artist = artists.get(credit.artistId)
    if (!artist) continue
    const album = result.get(credit.albumId) ?? []
    if (!album.some((row) => row.id === artist.id)) album.push(artist)
    result.set(credit.albumId, album)
  }
  return result
}
