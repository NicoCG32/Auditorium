import { z } from 'zod'
import { entityIdSchema as id, utcTimestampSchema } from '../shared/scalars'
import { ownedItemDataSchema, ownedItemSchema } from './owned-items'

export const listeningStatusSchema = z.enum([
  'untracked',
  'queued',
  'in_progress',
  'completed',
])
export const scoreUnitsSchema = z.int().min(2).max(20)
export const displayScoreSchema = z.number().min(1).max(10).multipleOf(0.5)

export const userAlbumSchema = z
  .strictObject({
    id,
    userId: id,
    albumId: id,
    listeningStatus: listeningStatusSchema.default('untracked'),
    personalNotes: z
      .string()
      .refine((value) => value.trim().length > 0, 'Omitir una nota vacía.')
      .optional(),
    addedAt: utcTimestampSchema,
    updatedAt: utcTimestampSchema,
    deletedAt: utcTimestampSchema.optional(),
  })
  .superRefine((entry, context) => {
    if (entry.updatedAt < entry.addedAt) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'La actualización no puede preceder al alta.',
      })
    }
    if (
      entry.deletedAt !== undefined &&
      (entry.deletedAt < entry.addedAt || entry.deletedAt > entry.updatedAt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['deletedAt'],
        message: 'La baja debe estar entre el alta y la última actualización.',
      })
    }
  })

export const albumRatingSchema = z.strictObject({
  userAlbumId: id,
  scoreUnits: scoreUnitsSchema,
  updatedAt: utcTimestampSchema,
})
export const trackRatingSchema = z.strictObject({
  userAlbumId: id,
  trackId: id,
  scoreUnits: scoreUnitsSchema,
  updatedAt: utcTimestampSchema,
})
export const libraryDataSchema = z.strictObject({
  userAlbums: z.array(userAlbumSchema),
  albumRatings: z.array(albumRatingSchema),
  trackRatings: z.array(trackRatingSchema),
  ownedItems: z.array(ownedItemSchema).default([]),
})

const target = { userAlbumId: id }
const rating = {
  ...target,
  scoreUnits: scoreUnitsSchema,
  updatedAt: utcTimestampSchema,
}
export const libraryChangeSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('add_owned_item'),
    ...ownedItemDataSchema.shape,
  }),
  z.strictObject({
    type: z.literal('remove_owned_item'),
    ...target,
    ownedItemId: id,
  }),
  z.strictObject({ type: z.literal('set_album_rating'), ...rating }),
  z.strictObject({
    type: z.literal('set_track_rating'),
    ...rating,
    trackId: id,
  }),
  z.strictObject({ type: z.literal('remove_album_rating'), ...target }),
  z.strictObject({
    type: z.literal('remove_track_rating'),
    ...target,
    trackId: id,
  }),
  z.strictObject({
    type: z.literal('set_listening_status'),
    ...target,
    listeningStatus: listeningStatusSchema,
    updatedAt: utcTimestampSchema,
  }),
  z.strictObject({
    type: z.literal('set_personal_experience'),
    ...target,
    listeningStatus: listeningStatusSchema,
    personalNotes: userAlbumSchema.shape.personalNotes,
    updatedAt: utcTimestampSchema,
  }),
])

export type UserAlbum = z.output<typeof userAlbumSchema>
export type ListeningStatus = z.output<typeof listeningStatusSchema>
export type AlbumRating = z.output<typeof albumRatingSchema>
export type TrackRating = z.output<typeof trackRatingSchema>
export type Library = z.output<typeof libraryDataSchema>
export type LibraryInput = z.input<typeof libraryDataSchema>
export type LibraryChange = z.output<typeof libraryChangeSchema>
