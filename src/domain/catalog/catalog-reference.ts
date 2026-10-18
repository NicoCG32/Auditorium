import { z } from 'zod'
import { entityIdSchema, utcTimestampSchema } from '../shared/scalars'

function uniqueIdentifiers(pattern: RegExp) {
  return z
    .array(z.string().regex(pattern))
    .max(8)
    .refine((identifiers) => new Set(identifiers).size === identifiers.length, {
      message: 'Los identificadores externos no pueden repetirse.',
    })
}

export const catalogReferenceSchema = z.strictObject({
  provider: z.literal('wikidata'),
  entityId: z.string().regex(/^Q[1-9]\d*$/u),
  retrievedAt: utcTimestampSchema,
  musicBrainzReleaseGroupId: entityIdSchema.optional(),
  spotifyAlbumIds: uniqueIdentifiers(/^[A-Za-z0-9]{22}$/u).optional(),
  youtubeVideoIds: uniqueIdentifiers(/^[A-Za-z0-9_-]{11}$/u).optional(),
})

export type CatalogReference = z.output<typeof catalogReferenceSchema>
