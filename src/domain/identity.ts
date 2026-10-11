import { z } from 'zod'
import { entityIdSchema, utcTimestampSchema } from './shared/scalars'

export const localIdentitySchema = z.strictObject({
  userId: entityIdSchema,
  createdAt: utcTimestampSchema,
})

export type LocalIdentity = z.output<typeof localIdentitySchema>
