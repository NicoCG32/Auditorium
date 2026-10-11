import { z } from 'zod'

const id = z.uuid().transform((value) => value.toLowerCase())
const text = z.string().trim().min(1, 'El texto no puede estar vacío.')
const position = z.int().positive()
const year = z.int().min(1).max(9999)
const duration = z.int().positive()
const personalCatalog = {
  catalogScope: z.literal('personal').default('personal'),
  createdBy: id.optional(),
}

export const releaseTypeSchema = z.enum([
  'album',
  'ep',
  'single',
  'live',
  'demo',
  'compilation',
  'soundtrack',
  'other',
])
export const artistRoleSchema = z.enum([
  'primary',
  'collaborator',
  'featured',
  'other',
])
export const releaseFormatSchema = z.enum([
  'vinyl',
  'cd',
  'cassette',
  'digital',
  'other',
])
export const contentRoleSchema = z.enum([
  'standard',
  'bonus',
  'alternate',
  'other',
])

export const artistSchema = z.strictObject({
  id,
  name: text,
  sortName: text.optional(),
  ...personalCatalog,
})
export const albumSchema = z.strictObject({
  id,
  title: text,
  releaseType: releaseTypeSchema.default('album'),
  originalYear: year.optional(),
  coverUrl: z.url({ protocol: /^https$/ }).optional(),
  description: text.optional(),
  ...personalCatalog,
})
export const albumArtistSchema = z.strictObject({
  albumId: id,
  artistId: id,
  role: artistRoleSchema,
  position,
  creditedAs: text.optional(),
})
export const trackSchema = z.strictObject({
  id,
  albumId: id,
  title: text,
  variantOfTrackId: id.optional(),
  versionLabel: text.optional(),
  referenceDurationMs: duration.optional(),
})
export const coreTrackSchema = z.strictObject({
  albumId: id,
  trackId: id,
  discNumber: position,
  trackNumber: position,
})
export const releaseSchema = z.strictObject({
  id,
  albumId: id,
  format: releaseFormatSchema,
  editionLabel: text.optional(),
  releaseTitleOverride: text.optional(),
  releaseYear: year.optional(),
  label: text.optional(),
  catalogNumber: text.optional(),
  barcode: text.optional(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  mediaDescription: text.optional(),
})
export const releaseTrackSchema = z.strictObject({
  id,
  releaseId: id,
  trackId: id,
  discNumber: position,
  trackNumber: position,
  durationMs: duration.optional(),
  contentRole: contentRoleSchema.default('standard'),
  displayTitleOverride: text.optional(),
})

export const catalogDataSchema = z.strictObject({
  artists: z.array(artistSchema),
  albums: z.array(albumSchema),
  albumArtists: z.array(albumArtistSchema),
  tracks: z.array(trackSchema),
  coreTracks: z.array(coreTrackSchema),
  releases: z.array(releaseSchema),
  releaseTracks: z.array(releaseTrackSchema),
})

export type Artist = z.output<typeof artistSchema>
export type Album = z.output<typeof albumSchema>
export type AlbumArtist = z.output<typeof albumArtistSchema>
export type Track = z.output<typeof trackSchema>
export type CoreTrack = z.output<typeof coreTrackSchema>
export type Release = z.output<typeof releaseSchema>
export type ReleaseTrack = z.output<typeof releaseTrackSchema>
export type Catalog = z.output<typeof catalogDataSchema>
export type CatalogInput = z.input<typeof catalogDataSchema>
