import { expect, test } from 'vitest'
import {
  MAX_COVER_IMAGE_BYTES,
  coverImageSchema,
  countrySchema,
  genresSchema,
} from './metadata'
import { manualAlbumInputSchema } from '../../application/inputs'
import { catalogSchema } from './catalog'
import { makeCatalog } from './catalog.fixture'

test('géneros y país recortan texto y rechazan duplicados equivalentes, vacíos y límites', () => {
  expect(genresSchema.parse([' Metal ', ' Progresivo '])).toEqual([
    'Metal',
    'Progresivo',
  ])
  expect(countrySchema.parse(' Chile ')).toBe('Chile')
  for (const genres of [
    ['Metal', 'métal'],
    [' '],
    ['a'.repeat(81)],
    Array.from({ length: 21 }, (_, i) => String(i)),
  ])
    expect(genresSchema.safeParse(genres).success).toBe(false)
  expect(countrySchema.safeParse(' ').success).toBe(false)
  expect(countrySchema.safeParse('a'.repeat(101)).success).toBe(false)
})
test('portada local acepta sólo base64 JPEG/PNG con firma y hasta 2 MiB', () => {
  expect(
    coverImageSchema.safeParse('data:image/png;base64,iVBORw0KGgo=').success,
  ).toBe(true)
  expect(
    coverImageSchema.safeParse('data:image/jpeg;base64,/9j/').success,
  ).toBe(true)
  for (const cover of [
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,/9j/',
    'data:image/jpeg;base64,iVBORw0KGgo=',
    'data:image/png;base64,AAAA',
    'data:image/png;base64,iVBORw0KGgo',
    'javascript:alert(1)',
  ])
    expect(coverImageSchema.safeParse(cover).success).toBe(false)
  const bytes =
    String.fromCharCode(255, 216, 255) + 'a'.repeat(MAX_COVER_IMAGE_BYTES - 3)
  expect(
    coverImageSchema.safeParse('data:image/jpeg;base64,' + btoa(bytes)).success,
  ).toBe(true)
  expect(
    coverImageSchema.safeParse('data:image/jpeg;base64,' + btoa(bytes + 'a'))
      .success,
  ).toBe(false)
})
test('enlace y archivo de portada son excluyentes al crear y al validar catálogo persistido', () => {
  const cover = {
    coverUrl: 'https://example.invalid/cover.jpg',
    coverImage: 'data:image/jpeg;base64,/9j/',
  }
  expect(
    manualAlbumInputSchema.safeParse({
      title: 'Ficticio',
      artists: [{ name: 'Ejemplo' }],
      ...cover,
    }).success,
  ).toBe(false)
  const catalog = makeCatalog()
  Object.assign(catalog.albums[0]!, cover)
  expect(catalogSchema.safeParse(catalog).success).toBe(false)
})
