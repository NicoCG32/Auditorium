import { z } from 'zod'
import { entityIdSchema, utcTimestampSchema } from '../shared/scalars'

/** External identity; the local entity always retains its own UUID. */
export const musicBrainzReferenceSchema = z.strictObject({
  id: entityIdSchema.transform((value) => value.toLowerCase()),
  retrievedAt: utcTimestampSchema,
})
