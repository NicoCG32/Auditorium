import type { ListeningStatus } from '../domain/library/schemas'
import { classificationLabel } from '../domain/catalog/classification'
import { unitsToScore } from '../domain/library/scores'
import type { LocalSnapshot } from '../domain/repositories/local-repository'
import { genreKey } from '../domain/catalog/genre-key'

export interface LibraryAlbum {
  id: string
  albumId: string
  title: string
  artist: string
  searchText: string
  originalYear?: number
  score?: number
  genreScores?: Record<string, number>
  genres?: string[]
  countries?: string[]
  coverUrl?: string
  coverImage?: string
  listeningStatus: ListeningStatus
  addedAt: string
}

export type RatingFilter = 'all' | 'unrated' | 'rated' | 'high'
export type LibraryOrder =
  'added' | 'title' | 'artist' | 'rating' | 'genre' | 'country'
export interface LibraryFilters {
  search: string
  listening: ListeningStatus | 'all'
  rating: RatingFilter
  order: LibraryOrder
  genre?: string
  country?: string
  ratingBasis?: 'auto' | 'general'
}

/** The general projection stays unchanged for recommendations and other consumers. */
export function ratingGenre(
  filters: Pick<LibraryFilters, 'genre' | 'ratingBasis'>,
): string | undefined {
  return filters.genre && filters.ratingBasis !== 'general'
    ? genreKey(filters.genre)
    : undefined
}
export function albumScore(
  album: LibraryAlbum,
  genre?: string,
): number | undefined {
  if (!genre) return album.score
  const key = genreKey(genre)
  return album.genreScores && Object.hasOwn(album.genreScores, key)
    ? album.genreScores[key]
    : undefined
}

export const defaultLibraryFilters: LibraryFilters = {
  search: '',
  listening: 'all',
  rating: 'all',
  order: 'added',
  genre: '',
  country: '',
  ratingBasis: 'auto',
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })
function normalized(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/gu, ' ')
}

function distinctLabels(labels: string[]) {
  const distinct = new Map<string, string>()
  for (const label of labels) {
    const clean = label.trim().replace(/\s+/gu, ' ')
    const key = normalized(clean)
    if (key && !distinct.has(key)) distinct.set(key, clean)
  }
  return [...distinct.values()].toSorted(collator.compare)
}

export interface LibraryFilterOption {
  value: string
  label: string
}

export function libraryFilterOptions(albums: LibraryAlbum[]): {
  genres: LibraryFilterOption[]
  countries: LibraryFilterOption[]
} {
  const options = (labels: string[]) =>
    distinctLabels(labels).map((label) => ({ value: normalized(label), label }))
  return {
    genres: options(albums.flatMap((album) => album.genres ?? [])),
    countries: options(albums.flatMap((album) => album.countries ?? [])),
  }
}

function compareLabels(a: string[] | undefined, b: string[] | undefined) {
  const first = distinctLabels(a ?? []).join(' · ')
  const second = distinctLabels(b ?? []).join(' · ')
  if (!first) return second ? 1 : 0
  if (!second) return -1
  return collator.compare(first, second)
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
          country: artist.country,
        }
      })
      const genres = distinctLabels(album.genres ?? [])
      const countries = distinctLabels(
        names.flatMap((name) => (name.country ? [name.country] : [])),
      )
      const rating = ratings.get(entry.id)
      const genreRatings = snapshot.library.albumGenreRatings.filter(
        (row) => row.userAlbumId === entry.id,
      )
      return {
        id: entry.id,
        albumId: album.id,
        title: album.title,
        artist: names.map((name) => name.display).join(' · '),
        searchText: normalized(
          [
            album.title,
            classificationLabel(album),
            ...names.flatMap((name) => [name.display, name.canonical]),
            ...genres,
            ...countries,
          ].join(' '),
        ),
        ...(album.originalYear === undefined
          ? {}
          : { originalYear: album.originalYear }),
        ...(rating === undefined
          ? {}
          : { score: unitsToScore(rating.scoreUnits) }),
        ...(genreRatings.length
          ? {
              genreScores: Object.fromEntries(
                genreRatings.map((row) => [
                  row.genreKey,
                  unitsToScore(row.scoreUnits),
                ]),
              ),
            }
          : {}),
        ...(genres.length ? { genres } : {}),
        ...(countries.length ? { countries } : {}),
        ...(album.coverUrl === undefined ? {} : { coverUrl: album.coverUrl }),
        ...(album.coverImage === undefined
          ? {}
          : { coverImage: album.coverImage }),
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
  const genre = normalized(filters.genre ?? '')
  const country = normalized(filters.country ?? '')
  const context = ratingGenre(filters)
  return albums
    .filter((album) => {
      if (!words.every((word) => album.searchText.includes(word))) return false
      if (genre && !album.genres?.some((label) => normalized(label) === genre))
        return false
      if (
        country &&
        !album.countries?.some((label) => normalized(label) === country)
      )
        return false
      if (
        filters.listening !== 'all' &&
        filters.listening !== album.listeningStatus
      )
        return false
      const score = albumScore(album, context)
      if (filters.rating === 'unrated' && score !== undefined) return false
      if (filters.rating === 'rated' && score === undefined) return false
      if (filters.rating === 'high' && (score === undefined || score < 8))
        return false
      return true
    })
    .toSorted((a, b) => {
      let order = 0
      if (filters.order === 'added') order = b.addedAt.localeCompare(a.addedAt)
      if (filters.order === 'title') order = collator.compare(a.title, b.title)
      if (filters.order === 'artist')
        order = collator.compare(a.artist, b.artist)
      if (filters.order === 'rating')
        order = (albumScore(b, context) ?? -1) - (albumScore(a, context) ?? -1)
      if (filters.order === 'genre') order = compareLabels(a.genres, b.genres)
      if (filters.order === 'country')
        order = compareLabels(a.countries, b.countries)
      return (
        order || collator.compare(a.title, b.title) || a.id.localeCompare(b.id)
      )
    })
}
