import { z } from 'zod'
import { entityIdSchema } from '../../domain/shared/scalars'
import {
  editionDetailsSchema,
  editionSummarySchema,
} from '../../application/edition-catalog'

const text = z.string().min(1).max(500)
const recording = z.object({
  id: entityIdSchema.optional(),
  title: text.optional(),
  length: z.int().nonnegative().nullish(),
})
const track = z.object({
  title: text.optional(),
  position: z.int().positive(),
  length: z.int().nonnegative().nullish(),
  recording: recording.optional(),
})
const medium = z.object({
  position: z.int().positive().optional(),
  format: z.string().max(100).nullish(),
  'track-count': z.int().nonnegative().max(10000),
  tracks: z.array(track).max(1000).optional(),
  pregap: z.unknown().optional(),
  'data-tracks': z.array(z.unknown()).max(1000).optional(),
})
export const releaseWireSchema = z.object({
  id: entityIdSchema,
  title: text,
  date: z.string().max(30).nullish(),
  country: z.string().max(100).nullish(),
  disambiguation: z.string().max(500).optional(),
  barcode: z.string().max(500).nullish(),
  media: z.array(medium).max(100).default([]),
  'label-info': z
    .array(
      z.object({
        label: z.object({ name: text }).nullish(),
        'catalog-number': z.string().max(500).nullish(),
      }),
    )
    .max(100)
    .default([]),
})
export function editionSummaryFrom(input: unknown) {
  const row = releaseWireSchema.parse(input)
  const label = [
    ...new Set(
      row['label-info'].flatMap((value) =>
        value.label?.name ? [value.label.name] : [],
      ),
    ),
  ]
    .join(' · ')
    .slice(0, 500)
  const catalogNumber = [
    ...new Set(
      row['label-info'].flatMap((value) =>
        value['catalog-number'] ? [value['catalog-number']] : [],
      ),
    ),
  ]
    .join(' · ')
    .slice(0, 500)
  return editionSummarySchema.parse({
    id: row.id,
    title: row.title,
    ...(row.date ? { date: row.date } : {}),
    ...(row.country ? { country: row.country } : {}),
    ...(row.disambiguation ? { description: row.disambiguation } : {}),
    ...(row.barcode ? { barcode: row.barcode } : {}),
    ...(label ? { label } : {}),
    ...(catalogNumber ? { catalogNumber } : {}),
    formats: row.media.map((value) => value.format ?? 'Desconocido'),
    trackCount: row.media.reduce((sum, value) => sum + value['track-count'], 0),
  })
}
export function editionDetailsFrom(input: unknown) {
  const row = releaseWireSchema
    .extend({ 'release-group': z.object({ id: entityIdSchema }) })
    .parse(input)
  const tracks = row.media.flatMap((disc, index) =>
    (disc.tracks ?? []).map((value) => {
      const duration = value.length ?? value.recording?.length
      return {
        title: value.title ?? value.recording?.title ?? '',
        discNumber: disc.position ?? index + 1,
        trackNumber: value.position,
        ...(value.recording?.id ? { recordingId: value.recording.id } : {}),
        ...(duration && duration > 0 ? { durationMs: duration } : {}),
      }
    }),
  )
  return editionDetailsSchema.parse({
    ...editionSummaryFrom(input),
    groupId: row['release-group'].id,
    tracks,
    completeTracks:
      row.media.length > 0 &&
      row.media.every(
        (disc) =>
          disc.tracks?.length === disc['track-count'] &&
          !disc.pregap &&
          !disc['data-tracks']?.length,
      ),
  })
}
