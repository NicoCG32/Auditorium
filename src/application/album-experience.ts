import { z } from 'zod'
import {
  albumRatingSchema,
  albumGenreRatingSchema,
  displayScoreSchema,
  listeningStatusSchema,
  userAlbumSchema,
} from '../domain/library/schemas'
import { entityIdSchema } from '../domain/shared/scalars'
import type { LocalSnapshot } from '../domain/repositories/local-repository'
import { genreKeySchema } from '../domain/catalog/genre-key'

const contextualInputSchema = z.strictObject({
  genreKey: genreKeySchema,
  score: displayScoreSchema,
  referenceReleaseId: entityIdSchema.optional(),
})

export const experienceExpectedSchema = z.strictObject({
  listeningStatus: listeningStatusSchema,
  personalNotes: userAlbumSchema.shape.personalNotes,
  rating: albumRatingSchema.optional(),
  genres: z
    .strictObject({
      labels: z.array(z.string().min(1).max(80)).max(20),
      ratings: z.array(albumGenreRatingSchema).max(20),
    })
    .optional(),
})
export type ExperienceExpected = z.output<typeof experienceExpectedSchema>
export const saveAlbumExperienceSchema = z
  .strictObject({
    listeningStatus: listeningStatusSchema,
    personalNotes: z
      .string()
      .transform((value) => (value.trim() ? value : undefined))
      .optional(),
    rating: z
      .strictObject({
        score: displayScoreSchema,
        referenceReleaseId: entityIdSchema.optional(),
      })
      .optional(),
    expected: experienceExpectedSchema,
    genreRatings: z
      .array(contextualInputSchema)
      .max(20)
      .refine(
        (rows) => new Set(rows.map((row) => row.genreKey)).size === rows.length,
        'No se permiten notas de género duplicadas.',
      )
      .optional(),
  })
  .refine(
    (request) =>
      (request.genreRatings !== undefined) ===
      (request.expected.genres !== undefined),
    'Las notas por género requieren su estado esperado completo.',
  )
export function experienceExpected(
  snapshot: LocalSnapshot,
  entryId: string,
  includeGenres = false,
): ExperienceExpected {
  const entry = snapshot.library.userAlbums.find((row) => row.id === entryId)
  if (!entry) throw new Error('No existe la entrada personal.')
  const rating = snapshot.library.albumRatings.find(
    (row) => row.userAlbumId === entryId,
  )
  return experienceExpectedSchema.parse({
    listeningStatus: entry.listeningStatus,
    personalNotes: entry.personalNotes,
    ...(rating ? { rating } : {}),
    ...(includeGenres
      ? {
          genres: {
            labels:
              snapshot.catalog.albums.find((row) => row.id === entry.albumId)
                ?.genres ?? [],
            ratings: snapshot.library.albumGenreRatings.filter(
              (row) => row.userAlbumId === entryId,
            ),
          },
        }
      : {}),
  })
}
export function sameExperience(a: ExperienceExpected, b: ExperienceExpected) {
  const values = (value: ExperienceExpected) => [
    value.listeningStatus,
    value.personalNotes,
    value.rating?.userAlbumId,
    value.rating?.scoreUnits,
    value.rating?.updatedAt,
    value.rating?.referenceReleaseId,
    value.genres?.labels,
    value.genres?.ratings
      .toSorted((a, b) => a.genreKey.localeCompare(b.genreKey))
      .map((row) => [
        row.userAlbumId,
        row.genreKey,
        row.scoreUnits,
        row.updatedAt,
        row.referenceReleaseId,
      ]),
  ]
  return JSON.stringify(values(a)) === JSON.stringify(values(b))
}
