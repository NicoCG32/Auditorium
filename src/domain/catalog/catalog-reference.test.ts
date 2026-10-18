import { expect, test } from 'vitest'
import { catalogReferenceSchema } from './catalog-reference'
import { albumSchema } from './schemas'
import { ids } from './catalog.fixture'

const reference = {
  provider: 'wikidata',
  entityId: 'Q999999999',
  retrievedAt: '2026-10-16T12:00:00.000Z',
} as const

test('referencia mínima conserva ausencia de enlaces y no modifica la identidad local', () => {
  const album = albumSchema.parse({
    id: ids.album,
    title: 'Referencia ficticia',
    catalogReference: reference,
  })
  expect(album.id).toBe(ids.album)
  expect(album.catalogReference).toEqual(reference)
  expect(album.coverUrl).toBeUndefined()
  expect(album.catalogReference).not.toHaveProperty('spotifyAlbumIds')
  expect(
    albumSchema.parse({ id: ids.album, title: 'Manual' }),
  ).not.toHaveProperty('catalogReference')
})

test('identificadores de servicios válidos quedan tipados, sin aceptar URL redundante', () => {
  const enriched = {
    ...reference,
    musicBrainzReleaseGroupId: ids.album.toUpperCase(),
    spotifyAlbumIds: ['a'.repeat(22)],
    youtubeVideoIds: ['ficticio_01'],
  }
  expect(catalogReferenceSchema.parse(enriched)).toEqual({
    ...enriched,
    musicBrainzReleaseGroupId: ids.album,
  })
  expect(
    catalogReferenceSchema.safeParse({
      ...enriched,
      sourceUrl: 'https://www.wikidata.org/wiki/Q999999999',
    }).success,
  ).toBe(false)
})

test.each([
  { provider: 'other' },
  { entityId: 'q1' },
  { entityId: 'Q0' },
  { entityId: 'Q01' },
  { entityId: ' Q123' },
  { entityId: 'Q123/extra' },
  { retrievedAt: '2026-02-30T12:00:00.000Z' },
  { retrievedAt: '2026-10-16T12:00:00+00:00' },
  { musicBrainzReleaseGroupId: 'not-a-uuid' },
  { spotifyAlbumIds: ['https://open.spotify.com/album/' + 'a'.repeat(22)] },
  { spotifyAlbumIds: ['a'.repeat(21)] },
  { youtubeVideoIds: ['https://youtu.be/ficticio_01'] },
  { youtubeVideoIds: ['ficticio_0!'] },
  { extra: 'Campo ajeno' },
])('rechaza referencia externa inválida %#', (change) => {
  expect(
    catalogReferenceSchema.safeParse({ ...reference, ...change }).success,
  ).toBe(false)
})

test.each(['spotifyAlbumIds', 'youtubeVideoIds'] as const)(
  '%s limita ocho valores únicos sin corregir ni truncar la entrada',
  (field) => {
    const width = field === 'spotifyAlbumIds' ? 22 : 11
    const values = Array.from({ length: 8 }, (_, index) =>
      String(index).padStart(width, 'a'),
    )
    expect(
      catalogReferenceSchema.parse({ ...reference, [field]: values })[field],
    ).toEqual(values)
    expect(
      catalogReferenceSchema.safeParse({
        ...reference,
        [field]: [...values, 'z'.repeat(width)],
      }).success,
    ).toBe(false)
    expect(
      catalogReferenceSchema.safeParse({
        ...reference,
        [field]: [values[0], values[0]],
      }).success,
    ).toBe(false)
  },
)
