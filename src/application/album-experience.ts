import { z } from 'zod'
import {
  albumRatingSchema,
  displayScoreSchema,
  listeningStatusSchema,
  userAlbumSchema,
} from '../domain/library/schemas'
import { entityIdSchema } from '../domain/shared/scalars'
import type { LocalSnapshot } from '../domain/repositories/local-repository'

export const experienceExpectedSchema = z.strictObject({
  listeningStatus: listeningStatusSchema,
  personalNotes: userAlbumSchema.shape.personalNotes,
  rating: albumRatingSchema.optional(),
})
export type ExperienceExpected = z.output<typeof experienceExpectedSchema>
export const saveAlbumExperienceSchema = z.strictObject({
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
})
export function experienceExpected(
  snapshot: LocalSnapshot,
  entryId: string,
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
  ]
  return JSON.stringify(values(a)) === JSON.stringify(values(b))
}
