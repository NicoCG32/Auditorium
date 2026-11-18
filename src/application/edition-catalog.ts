import { z } from 'zod'
import { entityIdSchema } from '../domain/shared/scalars'
import type { Release } from '../domain/catalog/schemas'

const id = entityIdSchema.transform((value) => value.toLowerCase())
const text = z.string().trim().min(1).max(500)
export const editionSummarySchema = z.strictObject({
  id,
  title: text,
  date: z.string().max(30).optional(),
  country: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  label: text.optional(),
  catalogNumber: text.optional(),
  barcode: text.optional(),
  formats: z.array(z.string().max(100)).max(100),
  trackCount: z.int().nonnegative().max(10000),
})
export const editionTrackSchema = z.strictObject({
  recordingId: id.optional(),
  title: text,
  discNumber: z.int().positive(),
  trackNumber: z.int().positive(),
  durationMs: z.int().positive().optional(),
})
export const editionDetailsSchema = editionSummarySchema
  .extend({
    groupId: id,
    tracks: z.array(editionTrackSchema).max(1000),
    completeTracks: z.boolean(),
  })
  .superRefine((edition, context) => {
    const positions = new Set<string>()
    for (const track of edition.tracks) {
      const position = `${track.discNumber}:${track.trackNumber}`
      if (positions.has(position))
        context.addIssue({
          code: 'custom',
          message: 'La edición repite una posición de pista.',
        })
      positions.add(position)
    }
    if (edition.completeTracks && edition.tracks.length !== edition.trackCount)
      context.addIssue({
        code: 'custom',
        message: 'La lista de la edición está incompleta.',
      })
  })
export type EditionSummary = z.output<typeof editionSummarySchema>
export type EditionDetails = z.output<typeof editionDetailsSchema>
export interface EditionPage {
  editions: EditionSummary[]
  total: number
  nextOffset?: number
}
export interface EditionCatalog {
  readonly available: boolean
  browseEditions(
    groupId: string,
    offset: number,
    signal: AbortSignal,
  ): Promise<EditionPage>
  edition(id: string, signal: AbortSignal): Promise<EditionDetails>
}
export function editionFormat(formats: string[]): Release['format'] {
  const values = formats.map((format) =>
    /^(CD|CD-R|8cm CD|SACD|SHM-CD|Blu-spec CD)$/u.test(format)
      ? 'cd'
      : /Vinyl/u.test(format)
        ? 'vinyl'
        : format === 'Cassette'
          ? 'cassette'
          : format === 'Digital Media'
            ? 'digital'
            : 'other',
  )
  return values.length && new Set(values).size === 1 ? values[0]! : 'other'
}
export function catalogCoverUrl(
  kind: 'release' | 'release-group',
  externalId: string,
) {
  return `https://coverartarchive.org/${kind}/${id.parse(externalId)}/front-500`
}
export function editionPosition(track: {
  discNumber: number
  trackNumber: number
}) {
  return `${track.discNumber}:${track.trackNumber}`
}
