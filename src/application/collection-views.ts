import { z } from 'zod'
import { listeningStatusSchema } from '../domain/library/schemas'
import { entityIdSchema } from '../domain/shared/scalars'

export const physicalFormatSchema = z.enum([
  'all',
  'cd',
  'vinyl',
  'cassette',
  'other',
])
export const collectionViewSettingsSchema = z
  .strictObject({
    filters: z.strictObject({
      search: z.string().max(1000),
      listening: z.enum(['all', ...listeningStatusSchema.options]),
      rating: z.enum(['all', 'unrated', 'rated', 'high']),
      order: z.enum(['added', 'title', 'artist', 'rating', 'genre', 'country']),
      genre: z.string().max(500).default(''),
      country: z.string().max(500).default(''),
      ratingBasis: z.enum(['auto', 'general']).default('auto'),
    }),
    medium: z.enum(['all', 'physical', 'digital']),
    format: physicalFormatSchema,
    view: z.enum(['grid', 'list']),
  })
  .refine((value) => value.medium === 'physical' || value.format === 'all', {
    path: ['format'],
    message: 'El filtro de formato corresponde a los discos físicos.',
  })
export const collectionViewNameSchema = z
  .string()
  .trim()
  .min(1, 'Escribe un nombre para la vista.')
  .max(60, 'El nombre puede tener hasta 60 caracteres.')
  .refine(
    (value) =>
      [...value].every((character) => {
        const code = character.codePointAt(0)!
        return code > 31 && code !== 127 && code !== 0x2028 && code !== 0x2029
      }),
    'Usa un nombre en una sola línea.',
  )
export const savedCollectionViewSchema = z.strictObject({
  version: z.literal(1),
  id: entityIdSchema,
  name: collectionViewNameSchema,
  settings: collectionViewSettingsSchema,
})
export type CollectionViewSettings = z.output<
  typeof collectionViewSettingsSchema
>
export type SavedCollectionView = z.output<typeof savedCollectionViewSchema>

export function sameCollectionView(
  a: CollectionViewSettings,
  b: CollectionViewSettings,
) {
  return (
    JSON.stringify(collectionViewSettingsSchema.parse(a)) ===
    JSON.stringify(collectionViewSettingsSchema.parse(b))
  )
}
