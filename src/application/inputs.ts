import { z } from 'zod'
import { checkCoverFields } from '../domain/catalog/metadata'
import { personalLinksInputSchema } from '../domain/library/personal-links'
import { ownedItemDataSchema } from '../domain/library/owned-items'
import { wishTargetSchema } from '../domain/library/purchase-wishes'
import {
  catalogGenresInputSchema,
  catalogNameInputSchema,
} from './catalog-names'

import {
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

export const purchaseWishInputSchema = wishTargetSchema
  .extend({
    notes: z
      .string()
      .transform((value) => (value.trim() ? value : undefined))
      .optional(),
  })
  .refine((wish) => Boolean(wish.targetReleaseId || wish.targetFormat), {
    path: ['targetFormat'],
    message: 'Selecciona formato o edición.',
  })

export const addOwnedItemInputSchema = ownedItemDataSchema
  .omit({ id: true, userAlbumId: true, createdAt: true })
  .extend({
    notes: z
      .string()
      .transform((value) => (value.trim() ? value : undefined))
      .optional(),
  })

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
  creditedAs: catalogNameInputSchema.optional(),
}
const artistInput = z.union([
  z.strictObject({ artistId: entityIdSchema, ...credit }),
  artistSchema
    .omit({ id: true, catalogScope: true, createdBy: true })
    .extend({ ...credit, name: catalogNameInputSchema }),
])
const albumInputSchema = albumSchema
  .omit({ id: true, catalogScope: true, createdBy: true })
  .extend({
    personalLinks: personalLinksInputSchema.optional(),
    title: catalogNameInputSchema,
    genres: catalogGenresInputSchema.optional(),
    artists: z
      .array(artistInput)
      .min(1)
      .refine(
        (artists) => artists.some((artist) => artist.role === 'primary'),
        'Debe existir un artista principal.',
      ),
  })

export const createAlbumInputSchema = albumInputSchema
  .extend({
    addToLibrary: z.boolean().default(true),
  })
  .superRefine(checkCoverFields)
export const manualAlbumInputSchema =
  albumInputSchema.superRefine(checkCoverFields)
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
