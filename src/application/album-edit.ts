import { z } from 'zod'
import {
  albumArtistSchema,
  albumSchema,
  artistRoleSchema,
  artistSchema,
  type Album,
} from '../domain/catalog/schemas'
import { checkCoverFields } from '../domain/catalog/metadata'
import { entityIdSchema } from '../domain/shared/scalars'
import type { LocalSnapshot } from '../domain/repositories/local-repository'
import {
  catalogGenresInputSchema,
  catalogNameInputSchema,
  catalogNameKey,
} from './catalog-names'

export const albumEditExpectedSchema = z.strictObject({
  album: albumSchema,
  credits: z.array(albumArtistSchema),
  artists: z.array(artistSchema),
})
export type AlbumEditExpected = z.output<typeof albumEditExpectedSchema>

const editArtistSchema = artistSchema
  .omit({ id: true, sortName: true, catalogScope: true, createdBy: true })
  .extend({
    name: catalogNameInputSchema,
    artistId: entityIdSchema.optional(),
    role: artistRoleSchema.default('primary'),
    creditedAs: catalogNameInputSchema.optional(),
  })
export const updateAlbumInputSchema = albumSchema
  .omit({ id: true, catalogScope: true, createdBy: true })
  .extend({
    title: catalogNameInputSchema,
    genres: catalogGenresInputSchema.optional(),
    albumId: entityIdSchema,
    expected: albumEditExpectedSchema,
    artists: z
      .array(editArtistSchema)
      .min(1)
      .max(50)
      .refine(
        (artists) => artists.some((artist) => artist.role === 'primary'),
        'Debe existir un artista principal.',
      )
      .refine((artists) => {
        const countries = new Map<string, string | undefined>()
        for (const artist of artists) {
          if (!artist.artistId) continue
          const key = `${artist.artistId}:${artist.name}`
          if (countries.has(key) && countries.get(key) !== artist.country)
            return false
          countries.set(key, artist.country)
        }
        return true
      }, 'El país de un mismo artista debe coincidir en todos sus créditos.')
      .refine((artists) => {
        const credits = new Set<string>()
        for (const artist of artists) {
          if (!artist.artistId) continue
          const key = JSON.stringify([
            artist.artistId,
            artist.name,
            artist.role,
          ])
          if (credits.has(key)) return false
          credits.add(key)
        }
        return true
      }, 'Un mismo artista no puede repetir el mismo rol.'),
  })
  .superRefine(checkCoverFields)
export type UpdateAlbumInput = z.output<typeof updateAlbumInputSchema>

export function buildAlbumEditExpected(
  snapshot: LocalSnapshot,
  albumId: string,
): AlbumEditExpected {
  const album = snapshot.catalog.albums.find((row) => row.id === albumId)
  if (!album) throw new Error('No existe el álbum seleccionado.')
  const credits = snapshot.catalog.albumArtists
    .filter((row) => row.albumId === albumId)
    .sort((a, b) => a.position - b.position)
  const ids = new Set(credits.map((credit) => credit.artistId))
  const artists = snapshot.catalog.artists
    .filter((artist) => ids.has(artist.id))
    .sort((a, b) => a.id.localeCompare(b.id))
  return structuredClone({ album, credits, artists })
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    )
  return value
}
export function sameAlbumEditExpected(
  a: AlbumEditExpected,
  b: AlbumEditExpected,
): boolean {
  const ordered = (value: AlbumEditExpected) => ({
    ...value,
    credits: [...value.credits].sort((x, y) => x.position - y.position),
    artists: [...value.artists].sort((x, y) => x.id.localeCompare(y.id)),
  })
  return (
    JSON.stringify(stable(ordered(a))) === JSON.stringify(stable(ordered(b)))
  )
}

export function albumIdentityChanged(
  expected: AlbumEditExpected,
  request: UpdateAlbumInput,
): boolean {
  if (
    catalogNameKey(request.title) !== catalogNameKey(expected.album.title) ||
    request.artists.length !== expected.credits.length
  )
    return true
  const previousArtists = new Map(
    expected.artists.map((artist) => [artist.id, artist]),
  )
  return request.artists.some((artist, index) => {
    const oldCredit = expected.credits[index]
    return (
      !oldCredit ||
      artist.artistId !== oldCredit.artistId ||
      catalogNameKey(artist.name) !==
        catalogNameKey(previousArtists.get(oldCredit.artistId)?.name ?? '') ||
      catalogNameKey(artist.creditedAs ?? '') !==
        catalogNameKey(oldCredit.creditedAs ?? '') ||
      artist.role !== oldCredit.role
    )
  })
}

export function editedAlbumFields(
  request: UpdateAlbumInput,
  existing: Album,
): Album {
  const fields = Object.fromEntries(
    Object.entries(request).filter(
      ([key]) => !['albumId', 'expected', 'artists'].includes(key),
    ),
  )
  const updated = albumSchema.parse({
    ...fields,
    id: existing.id,
    catalogScope: existing.catalogScope,
    createdBy: existing.createdBy,
  })
  if (albumIdentityChanged(request.expected, request))
    delete updated.catalogReference
  return updated
}
