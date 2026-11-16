import { z } from 'zod'
import { entityIdSchema } from '../domain/shared/scalars'
import type { AlbumClassification } from '../domain/catalog/classification'

const text = z.string().trim().min(1).max(500)
export const discographyArtistSchema = z.strictObject({
  id: entityIdSchema.transform((value) => value.toLowerCase()),
  name: text,
  country: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
})
export const discographyAlbumSchema = z.strictObject({
  id: entityIdSchema.transform((value) => value.toLowerCase()),
  title: text,
  primaryType: z.string().max(100),
  secondaryTypes: z.array(z.string().max(100)).max(20),
  firstReleaseDate: z.string().max(30).optional(),
  artists: z.array(discographyArtistSchema).min(1).max(50),
})
export type DiscographyArtist = z.output<typeof discographyArtistSchema>
export type DiscographyAlbum = z.output<typeof discographyAlbumSchema>
export interface DiscographyPage {
  albums: DiscographyAlbum[]
  total: number
  nextOffset?: number
}
export interface DiscographyCatalog {
  readonly available: boolean
  searchArtists(
    query: string,
    signal: AbortSignal,
  ): Promise<DiscographyArtist[]>
  browseAlbums(
    artistId: string,
    offset: number,
    signal: AbortSignal,
  ): Promise<DiscographyPage>
}
export class DiscographyError extends Error {
  constructor(
    message = 'No pudimos consultar el catálogo musical. Puedes volver a intentar o añadir el álbum manualmente.',
  ) {
    super(message)
    this.name = 'DiscographyError'
  }
}
const categoryMap = {
  Live: 'live',
  Compilation: 'compilation',
  Soundtrack: 'soundtrack',
  Demo: 'demo',
} as const
export function unmappedDiscographyTypes(album: DiscographyAlbum) {
  return [
    ...(['Album', 'EP', 'Single', 'Other', 'Unknown'].includes(
      album.primaryType,
    )
      ? []
      : [album.primaryType]),
    ...album.secondaryTypes.filter((type) => !Object.hasOwn(categoryMap, type)),
  ]
}
export function discographyClassification(
  album: DiscographyAlbum,
): AlbumClassification {
  return {
    primaryType:
      album.primaryType === 'Album'
        ? 'full_length'
        : album.primaryType === 'EP'
          ? 'ep'
          : album.primaryType === 'Single'
            ? 'single'
            : album.primaryType === 'Unknown' || !album.primaryType
              ? 'unspecified'
              : 'other',
    categories: [
      ...new Set(
        album.secondaryTypes.flatMap((type) =>
          Object.hasOwn(categoryMap, type)
            ? [categoryMap[type as keyof typeof categoryMap]]
            : [],
        ),
      ),
    ],
    publicationStatus: 'unknown',
  }
}
export type DiscographyFilter =
  'studio' | 'all' | 'ep' | 'single' | 'live' | 'compilation'
export function filterDiscography(
  albums: DiscographyAlbum[],
  filter: DiscographyFilter,
) {
  return albums
    .filter(
      (album) =>
        filter === 'all' ||
        (filter === 'studio' &&
          album.primaryType === 'Album' &&
          album.secondaryTypes.length === 0) ||
        (filter === 'ep' && album.primaryType === 'EP') ||
        (filter === 'single' && album.primaryType === 'Single') ||
        (filter === 'live' && album.secondaryTypes.includes('Live')) ||
        (filter === 'compilation' &&
          album.secondaryTypes.includes('Compilation')),
    )
    .toSorted(
      (a, b) =>
        (a.firstReleaseDate || '9999').localeCompare(
          b.firstReleaseDate || '9999',
        ) || a.title.localeCompare(b.title),
    )
}
