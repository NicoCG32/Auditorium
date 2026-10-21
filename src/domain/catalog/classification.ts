import { z } from 'zod'

export const primaryTypeSchema = z.enum([
  'unspecified',
  'full_length',
  'ep',
  'single',
  'other',
])
export const albumCategorySchema = z.enum([
  'demo',
  'split',
  'compilation',
  'live',
  'soundtrack',
])
export const publicationStatusSchema = z.enum([
  'unknown',
  'published',
  'unreleased',
])
export const classificationFields = {
  primaryType: primaryTypeSchema.default('unspecified'),
  categories: z
    .array(albumCategorySchema)
    .max(5)
    .refine(
      (values) => new Set(values).size === values.length,
      'No repitas categorías.',
    )
    .default([]),
  publicationStatus: publicationStatusSchema.default('unknown'),
}
export type AlbumClassification = {
  primaryType: z.output<typeof primaryTypeSchema>
  categories: z.output<typeof albumCategorySchema>[]
  publicationStatus: z.output<typeof publicationStatusSchema>
}
export const primaryTypeLabels: Record<
  AlbumClassification['primaryType'],
  string
> = {
  unspecified: 'Sin especificar',
  full_length: 'Full-length',
  ep: 'EP',
  single: 'Single',
  other: 'Otro',
}
export const categoryLabels: Record<
  AlbumClassification['categories'][number],
  string
> = {
  demo: 'Demo',
  split: 'Split',
  compilation: 'Recopilación',
  live: 'En vivo',
  soundtrack: 'Banda sonora',
}
export const publicationLabels: Record<
  AlbumClassification['publicationStatus'],
  string
> = {
  unknown: 'Desconocido',
  published: 'Publicado',
  unreleased: 'Inédito',
}
export function classificationLabel(value: AlbumClassification): string {
  return [
    primaryTypeLabels[value.primaryType],
    ...value.categories.map((category) => categoryLabels[category]),
    ...(value.publicationStatus === 'unknown'
      ? []
      : [publicationLabels[value.publicationStatus]]),
  ].join(' · ')
}
