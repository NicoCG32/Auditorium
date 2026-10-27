import { z } from 'zod'
import type { Release } from '../catalog/schemas'
import { entityIdSchema, utcTimestampSchema } from '../shared/scalars'

export const ownedMediumSchema = z.enum(['physical', 'purchased_digital'])
export const ownedFormatSchema = z.enum([
  'vinyl',
  'cd',
  'cassette',
  'digital_download',
  'other',
])
export const conditionSchema = z.enum([
  'mint',
  'near_mint',
  'very_good',
  'good',
  'fair',
  'poor',
])
export const acquisitionDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00.000Z`)
    return (
      !value.startsWith('0000') &&
      Number.isFinite(time) &&
      new Date(time).toISOString().slice(0, 10) === value
    )
  }, 'La fecha de adquisición debe ser un día válido.')

export const ownedItemDataSchema = z.strictObject({
  id: entityIdSchema,
  userAlbumId: entityIdSchema,
  releaseId: entityIdSchema.optional(),
  medium: ownedMediumSchema,
  format: ownedFormatSchema,
  mediaCondition: conditionSchema.optional(),
  sleeveCondition: conditionSchema.optional(),
  acquiredAt: acquisitionDateSchema.optional(),
  notes: z
    .string()
    .refine((value) => value.trim().length > 0, 'Omitir una nota vacía.')
    .optional(),
  createdAt: utcTimestampSchema,
})
export const ownedItemSchema = ownedItemDataSchema.superRefine(
  (item, context) => {
    if (
      (item.medium === 'purchased_digital') !==
      (item.format === 'digital_download')
    )
      context.addIssue({
        code: 'custom',
        path: ['format'],
        message: 'El medio y formato del ejemplar no son compatibles.',
      })
    if (
      item.medium === 'purchased_digital' &&
      (item.mediaCondition || item.sleeveCondition)
    )
      context.addIssue({
        code: 'custom',
        path: ['mediaCondition'],
        message: 'La condición física no corresponde a una compra digital.',
      })
  },
)
export type OwnedItem = z.output<typeof ownedItemSchema>

export function sameOwnedItem(a: OwnedItem, b: OwnedItem): boolean {
  return (
    a.id === b.id &&
    a.userAlbumId === b.userAlbumId &&
    a.createdAt === b.createdAt &&
    a.medium === b.medium &&
    a.format === b.format &&
    a.releaseId === b.releaseId &&
    a.acquiredAt === b.acquiredAt &&
    a.mediaCondition === b.mediaCondition &&
    a.sleeveCondition === b.sleeveCondition &&
    a.notes === b.notes
  )
}

export function ownedItemMatchesRelease(
  item: Pick<OwnedItem, 'medium' | 'format'>,
  release: Release,
): boolean {
  return item.medium === 'purchased_digital'
    ? item.format === 'digital_download' && release.format === 'digital'
    : item.format !== 'digital_download' && release.format === item.format
}
