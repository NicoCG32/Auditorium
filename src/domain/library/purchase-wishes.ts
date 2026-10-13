import { z } from 'zod'
import { releaseFormatSchema } from '../catalog/schemas'
import { entityIdSchema, utcTimestampSchema } from '../shared/scalars'
import type { OwnedItem } from './owned-items'

export const wishStatusSchema = z.enum(['active', 'fulfilled', 'cancelled'])
export const wishTargetSchema = z.strictObject({
  targetReleaseId: entityIdSchema.optional(),
  targetFormat: releaseFormatSchema.optional(),
  notes: z
    .string()
    .refine((value) => value.trim().length > 0, 'Omitir una nota vacía.')
    .optional(),
})
export const purchaseWishDataSchema = wishTargetSchema.extend({
  id: entityIdSchema,
  userAlbumId: entityIdSchema,
  status: wishStatusSchema,
  createdAt: utcTimestampSchema,
})
export const purchaseWishSchema = purchaseWishDataSchema.refine(
  (wish) => Boolean(wish.targetReleaseId || wish.targetFormat),
  {
    path: ['targetFormat'],
    message: 'El deseo requiere un formato o una edición objetivo.',
  },
)
export type PurchaseWish = z.output<typeof purchaseWishSchema>

export function wishMatchesOwnedItem(
  wish: PurchaseWish,
  item: OwnedItem,
): boolean {
  return (
    wish.status === 'active' &&
    wish.userAlbumId === item.userAlbumId &&
    (!wish.targetReleaseId || wish.targetReleaseId === item.releaseId) &&
    (!wish.targetFormat ||
      wish.targetFormat ===
        (item.format === 'digital_download' ? 'digital' : item.format))
  )
}
