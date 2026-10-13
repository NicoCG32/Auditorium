import type { ListeningStatus } from '../domain/library/schemas'
import { unitsToScore } from '../domain/library/scores'
import type { LocalSnapshot } from '../domain/repositories/local-repository'

export interface LibraryAlbum {
  id: string
  albumId: string
  title: string
  artist: string
  searchText: string
  originalYear?: number
  score?: number
  listeningStatus: ListeningStatus
  addedAt: string
}

export type RatingFilter = 'all' | 'unrated' | 'rated' | 'high'
export type LibraryOrder = 'added' | 'title' | 'artist' | 'rating'
export interface LibraryFilters {
  search: string
  listening: ListeningStatus | 'all'
  rating: RatingFilter
  order: LibraryOrder
}

export const defaultLibraryFilters: LibraryFilters = {
  search: '',
  listening: 'all',
  rating: 'all',
  order: 'added',
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })
function normalized(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es')
}

export function projectLibrary(snapshot: LocalSnapshot): LibraryAlbum[] {
  return projectEntries(snapshot, false)
}

export function projectRemovedAlbums(snapshot: LocalSnapshot): LibraryAlbum[] {
  return projectEntries(snapshot, true)
}

function projectEntries(
  snapshot: LocalSnapshot,
  removed: boolean,
): LibraryAlbum[] {
  const albums = new Map(
    snapshot.catalog.albums.map((album) => [album.id, album]),
  )
  const artists = new Map(
    snapshot.catalog.artists.map((artist) => [artist.id, artist]),
  )
  const ratings = new Map(
    snapshot.library.albumRatings.map((rating) => [rating.userAlbumId, rating]),
  )
  const credits = new Map<string, typeof snapshot.catalog.albumArtists>()
  for (const credit of snapshot.catalog.albumArtists) {
    const rows = credits.get(credit.albumId) ?? []
    rows.push(credit)
    credits.set(credit.albumId, rows)
  }
  return snapshot.library.userAlbums
    .filter((entry) => (entry.deletedAt !== undefined) === removed)
    .map((entry) => {
      const album = albums.get(entry.albumId)
      if (!album)
        throw new Error('No se encontró un álbum de la biblioteca validada.')
      const albumCredits = (credits.get(album.id) ?? []).toSorted(
        (a, b) => a.position - b.position,
      )
      const names = albumCredits.map((credit) => {
        const artist = artists.get(credit.artistId)
        if (!artist)
          throw new Error('No se encontró un artista del catálogo validado.')
        return {
          display: credit.creditedAs ?? artist.name,
          canonical: artist.name,
        }
      })
      const rating = ratings.get(entry.id)
      return {
        id: entry.id,
        albumId: album.id,
        title: album.title,
        artist: names.map((name) => name.display).join(' · '),
        searchText: normalized(
          [
            album.title,
            ...names.flatMap((name) => [name.display, name.canonical]),
          ].join(' '),
        ),
        ...(album.originalYear === undefined
          ? {}
          : { originalYear: album.originalYear }),
        ...(rating === undefined
          ? {}
          : { score: unitsToScore(rating.scoreUnits) }),
        listeningStatus: entry.listeningStatus,
        addedAt: entry.addedAt,
      }
    })
}

export function queryLibrary(
  albums: LibraryAlbum[],
  filters: LibraryFilters,
): LibraryAlbum[] {
  const words = normalized(filters.search.trim()).split(/\s+/u).filter(Boolean)
  return albums
    .filter((album) => {
      if (!words.every((word) => album.searchText.includes(word))) return false
      if (
        filters.listening !== 'all' &&
        filters.listening !== album.listeningStatus
      )
        return false
      if (filters.rating === 'unrated' && album.score !== undefined)
        return false
      if (filters.rating === 'rated' && album.score === undefined) return false
      if (
        filters.rating === 'high' &&
        (album.score === undefined || album.score < 8)
      )
        return false
      return true
    })
    .toSorted((a, b) => {
      let order = 0
      if (filters.order === 'added') order = b.addedAt.localeCompare(a.addedAt)
      if (filters.order === 'title') order = collator.compare(a.title, b.title)
      if (filters.order === 'artist')
        order = collator.compare(a.artist, b.artist)
      if (filters.order === 'rating') order = (b.score ?? -1) - (a.score ?? -1)
      return (
        order || collator.compare(a.title, b.title) || a.id.localeCompare(b.id)
      )
    })
}
