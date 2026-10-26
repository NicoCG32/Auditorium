import { z } from 'zod'
import { albumSchema } from '../domain/catalog/schemas'
import { genreKey } from '../domain/catalog/genre-key'
import {
  albumGenreRatingSchema,
  displayScoreSchema,
} from '../domain/library/schemas'
import { entityIdSchema } from '../domain/shared/scalars'
import type { LocalSnapshot } from '../domain/repositories/local-repository'
import { catalogNameInputSchema } from './catalog-names'

export const rateAlbumGenreInputSchema = z.strictObject({
  userAlbumId: entityIdSchema,
  genre: z.string().trim().min(1).max(80),
  score: displayScoreSchema,
  referenceReleaseId: entityIdSchema.nullable().optional(),
  expected: albumGenreRatingSchema.nullable(),
})
export const removeAlbumGenreRatingInputSchema = z.strictObject({
  userAlbumId: entityIdSchema,
  genre: z.string().trim().min(1).max(80),
  expected: albumGenreRatingSchema,
})
export const genreRenameExpectedSchema = z.strictObject({
  album: albumSchema,
  ratings: z.array(albumGenreRatingSchema),
})
export const renameAlbumGenreInputSchema = z.strictObject({
  albumId: entityIdSchema,
  fromGenre: z.string().trim().min(1).max(80),
  toGenre: catalogNameInputSchema.pipe(z.string().max(80)),
  expected: genreRenameExpectedSchema,
})

export function genreRenameExpected(
  snapshot: LocalSnapshot,
  albumId: string,
  source: string,
) {
  const album = snapshot.catalog.albums.find((row) => row.id === albumId)
  if (!album) throw new Error('No existe el álbum.')
  const entries = new Set(
    snapshot.library.userAlbums
      .filter((row) => row.albumId === albumId)
      .map((row) => row.id),
  )
  return genreRenameExpectedSchema.parse({
    album,
    ratings: snapshot.library.albumGenreRatings
      .filter(
        (row) =>
          entries.has(row.userAlbumId) && row.genreKey === genreKey(source),
      )
      .toSorted((a, b) => a.userAlbumId.localeCompare(b.userAlbumId)),
  })
}

export function referencedRemovedGenres(
  snapshot: LocalSnapshot,
  albumId: string,
  nextGenres: string[],
) {
  const entries = new Set(
    snapshot.library.userAlbums
      .filter((row) => row.albumId === albumId)
      .map((row) => row.id),
  )
  const next = new Set(nextGenres.map(genreKey))
  return [
    ...new Set(
      snapshot.library.albumGenreRatings
        .filter(
          (row) => entries.has(row.userAlbumId) && !next.has(row.genreKey),
        )
        .map((row) => row.genreKey),
    ),
  ]
}
