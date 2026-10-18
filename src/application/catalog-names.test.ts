// @vitest-environment node
import { expect, test } from 'vitest'
import { capitalizeCatalogName, catalogNameKey } from './catalog-names'
import { manualAlbumInputSchema } from './inputs'
import { albumSchema, artistSchema } from '../domain/catalog/schemas'
import { fixtureId } from '../domain/catalog/catalog.fixture'

test.each([
  ['system of a down', 'System Of A Down'],
  ['System of A down', 'System Of A Down'],
  ['  SYSTEM   OF A\tDOWN ', 'System Of A Down'],
  ['metal progresivo', 'Metal Progresivo'],
  ['ROCK / JAZZ; post-rock', 'Rock / Jazz; Post-Rock'],
  ['pop/rock', 'Pop/Rock'],
  ['canción del océano', 'Canción Del Océano'],
  ['cancio\u0301n', 'Canción'],
  ['straße y ß', 'Straße Y ẞ'],
  ['ﬃ', 'Ffi'],
  ['(ac/dc) — r.e.m. & u2', '(AC/DC) — R.E.M. & U2'],
  ['r&b y edm', 'R&B Y EDM'],
  ['ABBA, NIN, UFO; ep / lp', 'ABBA, NIN, UFO; EP / LP'],
  ['volumen ii: the mix', 'Volumen II: The Mix'],
  ["don't stop", "Don't Stop"],
  ['東京の音楽', '東京の音楽'],
  ['  ', ''],
])('capitaliza %s de forma estable', (input, expected) => {
  expect(capitalizeCatalogName(input)).toBe(expected)
  expect(capitalizeCatalogName(expected)).toBe(expected)
})

test('la entrada normaliza sólo nombres de álbum, artistas, alias y géneros', () => {
  const input = {
    title: 'obra del océano',
    artists: [
      {
        name: 'banda del sur',
        creditedAs: 'banda invitada',
        country: 'de aquí',
      },
    ],
    genres: ['metal progresivo', 'edm'],
    description: 'Texto con estilo PROPIO.',
    coverUrl: 'https://example.invalid/MiPortada.jpg?version=aB',
  }
  const before = structuredClone(input)
  expect(manualAlbumInputSchema.parse(input)).toMatchObject({
    title: 'Obra Del Océano',
    artists: [
      {
        name: 'Banda Del Sur',
        creditedAs: 'Banda Invitada',
        country: 'de aquí',
      },
    ],
    genres: ['Metal Progresivo', 'EDM'],
    description: input.description,
    coverUrl: input.coverUrl,
  })
  expect(input).toEqual(before)
})

test('no convierte los lectores del catálogo o los respaldos en una migración de nombres', () => {
  expect(
    albumSchema.parse({
      id: fixtureId(1),
      title: 'álbum histórico',
      genres: ['metal progresivo'],
    }),
  ).toMatchObject({
    title: 'álbum histórico',
    genres: ['metal progresivo'],
  })
  expect(
    artistSchema.parse({ id: fixtureId(2), name: 'artista histórico' }).name,
  ).toBe('artista histórico')
})

test('las coincidencias de identidad ignoran caso/espacios y conservan diferencias de acentos', () => {
  expect(catalogNameKey(' System of A  down ')).toBe(
    catalogNameKey('system of a down'),
  )
  expect(catalogNameKey('Cancio\u0301n')).toBe(catalogNameKey('Canción'))
  expect(catalogNameKey('Cancion')).not.toBe(catalogNameKey('Canción'))
})

test('sigue validando vacíos, tipos, límites y duplicados de géneros tras capitalizar', () => {
  for (const fields of [
    { title: ' ' },
    { title: 123 },
    { artists: [{ name: ' ' }] },
    { genres: ['metal progresivo', 'METAL   PROGRESIVO'] },
    { genres: ['x'.repeat(81)] },
  ]) {
    expect(
      manualAlbumInputSchema.safeParse({
        title: 'Válido',
        artists: [{ name: 'Válido' }],
        ...fields,
      }).success,
    ).toBe(false)
  }
})
