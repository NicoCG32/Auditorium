// @vitest-environment node
import { expect, test } from 'vitest'
import { makeBackup } from '../domain/backup.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import {
  albumScore,
  defaultLibraryFilters,
  projectLibrary,
  queryLibrary,
} from './library-query'
import {
  buildRecommendationContext,
  recommendationPayload,
} from './recommendations'
function library() {
  const snapshot = makeBackup().data
  delete snapshot.library.userAlbums[1]!.deletedAt
  snapshot.catalog.albums.forEach((row) => {
    row.genres = ['Death Metal', 'Power Metal', 'Constructor']
  })
  snapshot.library.albumGenreRatings = [
    {
      userAlbumId: libraryIds.entry,
      genreKey: 'death metal',
      scoreUnits: 2,
      updatedAt: times.updated,
    },
    {
      userAlbumId: libraryIds.entry,
      genreKey: 'power metal',
      scoreUnits: 20,
      updatedAt: times.updated,
    },
    {
      userAlbumId: libraryIds.otherEntry,
      genreKey: 'death metal',
      scoreUnits: 20,
      updatedAt: times.updated,
    },
  ]
  return projectLibrary(snapshot)
}
test('orden, umbral y presencia usan género; General explícita conserva su cifra sin fallback', () => {
  const albums = library(),
    before = structuredClone(albums)
  const filters = {
    ...defaultLibraryFilters,
    genre: 'death metal',
    order: 'rating' as const,
  }
  expect(queryLibrary(albums, filters).map((row) => row.id)).toEqual([
    libraryIds.otherEntry,
    libraryIds.entry,
  ])
  expect(
    queryLibrary(albums, { ...filters, rating: 'high' }).map((row) => row.id),
  ).toEqual([libraryIds.otherEntry])
  expect(
    queryLibrary(albums, {
      ...filters,
      ratingBasis: 'general',
      rating: 'high',
    }),
  ).toHaveLength(2)
  expect(
    queryLibrary(albums, {
      ...filters,
      genre: 'power metal',
      rating: 'unrated',
    }).map((row) => row.id),
  ).toEqual([libraryIds.otherEntry])
  expect(
    queryLibrary(albums, {
      ...filters,
      genre: 'power metal',
      rating: 'rated',
    }).map((row) => row.id),
  ).toEqual([libraryIds.entry])
  expect(albumScore(albums[1]!, 'power metal')).toBeUndefined()
  expect(albums).toEqual(before)
})
test('géneros sin nota con nombres de propiedades de objeto siguen sin valoración', () => {
  const albums = library()
  for (const genre of ['constructor', '__proto__'])
    expect(albumScore(albums[0]!, genre)).toBeUndefined()
  expect(
    queryLibrary(albums, {
      ...defaultLibraryFilters,
      genre: 'constructor',
      rating: 'unrated',
    }),
  ).toHaveLength(2)
})
test('filtrar por género no amplía el payload ni sustituye notas generales del proveedor', () => {
  const albums = library(),
    before = recommendationPayload(buildRecommendationContext(albums))
  queryLibrary(albums, {
    ...defaultLibraryFilters,
    genre: 'death metal',
    rating: 'high',
  })
  const payload = recommendationPayload(buildRecommendationContext(albums))
  expect(payload).toEqual(before)
  expect(JSON.stringify(payload)).not.toContain('genre')
  expect(before.candidates.map((row) => row.score)).toEqual([9.5, 8])
})
