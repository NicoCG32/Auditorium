import { z } from 'zod'
import {
  albumArtistSchema,
  albumSchema,
  artistRoleSchema,
  artistSchema,
  releaseSchema,
  releaseTrackSchema,
  trackSchema,
} from '../domain/catalog/schemas'
import { entityIdSchema, utcTimestampSchema } from '../domain/shared/scalars'
import {
  listeningStatusSchema,
  userAlbumSchema,
} from '../domain/library/schemas'

export const personalExperienceInputSchema = z.strictObject({
  listeningStatus: listeningStatusSchema,
  personalNotes: z
    .string()
    .transform((value) => (value.trim() ? value : undefined))
    .optional(),
  expected: z
    .strictObject({
      listeningStatus: listeningStatusSchema,
      personalNotes: userAlbumSchema.shape.personalNotes,
      updatedAt: utcTimestampSchema,
    })
    .optional(),
})

const credit = {
  role: artistRoleSchema.default('primary'),
  creditedAs: albumArtistSchema.shape.creditedAs,
}
const artistInput = z.union([
  z.strictObject({ artistId: entityIdSchema, ...credit }),
  artistSchema
    .omit({ id: true, catalogScope: true, createdBy: true })
    .extend(credit),
])
export const createAlbumInputSchema = albumSchema
  .omit({ id: true, catalogScope: true, createdBy: true })
  .extend({
    artists: z
      .array(artistInput)
      .min(1)
      .refine(
        (artists) => artists.some((artist) => artist.role === 'primary'),
        'Debe existir un artista principal.',
      ),
    addToLibrary: z.boolean().default(true),
  })

export const manualAlbumInputSchema = createAlbumInputSchema.omit({
  addToLibrary: true,
})
export type CreateAlbumInput = z.output<typeof createAlbumInputSchema>
export type ManualAlbumInput = z.output<typeof manualAlbumInputSchema>

export const addReleaseInputSchema = releaseSchema
  .omit({ id: true })
  .extend({ copyCoreTracks: z.boolean().default(true) })

const appearance = releaseTrackSchema.omit({ id: true, trackId: true }).extend({
  corePosition: z
    .strictObject({
      discNumber: z.int().positive(),
      trackNumber: z.int().positive(),
    })
    .optional(),
})
export const addTrackInputSchema = z.union([
  appearance.extend({ trackId: entityIdSchema }),
  appearance.extend({ track: trackSchema.omit({ id: true, albumId: true }) }),
])
