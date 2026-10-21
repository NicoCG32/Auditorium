import { z } from 'zod'
import { albumSchema } from './schemas'
import type { AlbumClassification } from './classification'

// Frozen album contract used by backup formats 1–4 and IndexedDB versions 1–7.
export const legacyReleaseTypeSchema = z.enum([
  'album',
  'ep',
  'single',
  'live',
  'demo',
  'compilation',
  'soundtrack',
  'other',
])
export const legacyAlbumV4Schema = z.strictObject({
  id: albumSchema.shape.id,
  title: albumSchema.shape.title,
  releaseType: legacyReleaseTypeSchema.default('album'),
  originalYear: albumSchema.shape.originalYear,
  coverUrl: albumSchema.shape.coverUrl,
  coverImage: albumSchema.shape.coverImage,
  genres: albumSchema.shape.genres,
  catalogReference: albumSchema.shape.catalogReference,
  description: albumSchema.shape.description,
  catalogScope: albumSchema.shape.catalogScope,
  createdBy: albumSchema.shape.createdBy,
})
export function classificationFromLegacy(
  type: z.output<typeof legacyReleaseTypeSchema>,
): AlbumClassification {
  return {
    primaryType:
      type === 'album'
        ? 'full_length'
        : type === 'ep' || type === 'single' || type === 'other'
          ? type
          : 'unspecified',
    categories:
      type === 'live' ||
      type === 'demo' ||
      type === 'compilation' ||
      type === 'soundtrack'
        ? [type]
        : [],
    publicationStatus: 'unknown',
  }
}
export function migrateLegacyAlbum(input: unknown) {
  const { releaseType, ...album } = legacyAlbumV4Schema.parse(input)
  return albumSchema.parse({
    ...album,
    ...classificationFromLegacy(releaseType),
  })
}
