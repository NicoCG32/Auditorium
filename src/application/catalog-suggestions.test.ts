// @vitest-environment node
import { expect, test } from 'vitest'
import { makeCatalog } from '../domain/catalog/catalog.fixture'
import { catalogDataSchema } from '../domain/catalog/schemas'
import {
  catalogSuggestions,
  completeGenre,
  genreToken,
  suggestNames,
} from './catalog-suggestions'

test('géneros equivalentes se agrupan; bandas homónimas conservan identidades y contexto', () => {
  const catalog = catalogDataSchema.parse(makeCatalog())
  catalog.albums[0]!.genres = ['Death Metal', 'Power Metal']
  catalog.albums.push({
    ...catalog.albums[0]!,
    id: crypto.randomUUID(),
    genres: ['death metal', 'Ácido Rock'],
  })
  catalog.artists.push({
    ...catalog.artists[0]!,
    id: crypto.randomUUID(),
    country: 'Chile',
  })
  const index = catalogSuggestions(catalog)
  expect(index.genres.map((row) => row.label)).toEqual([
    'Ácido Rock',
    'Death Metal',
    'Power Metal',
  ])
  expect(suggestNames(index.genres, ' de ').map((row) => row.label)).toEqual([
    'Death Metal',
  ])
  expect(suggestNames(index.genres, 'ac')).toHaveLength(1)
  expect(index.artists).toHaveLength(2)
  expect(new Set(index.artists.map((row) => row.id)).size).toBe(2)
  expect(
    index.artists.find((row) => row.detail?.includes('Chile')),
  ).toBeDefined()
})

test('prefijos acotados, vacíos y exclusiones; no hay resultados remotos ni coincidencia interior', () => {
  const options = Array.from({ length: 15 }, (_, index) => ({
    id: String(index),
    label: `Death ${index}`,
    search: `death ${index}`,
  }))
  expect(suggestNames(options, 'DE')).toHaveLength(8)
  expect(suggestNames(options, '')).toEqual([])
  expect(suggestNames(options, 'eath')).toEqual([])
  expect(suggestNames(options, 'Death 0', [' DEATH 0 '])).toEqual([])
})

test('completar en medio conserva los demás géneros y la posición de inserción', () => {
  const value = 'Rock, De, Power Metal'
  expect(genreToken(value, 8)).toMatchObject({
    term: 'De',
    excluded: ['Rock', ' Power Metal'],
  })
  expect(completeGenre(value, 8, 'Death Metal')).toEqual({
    value: 'Rock, Death Metal, Power Metal',
    caret: 17,
  })
  expect(completeGenre('De, Rock', 2, 'Death Metal')).toEqual({
    value: 'Death Metal, Rock',
    caret: 11,
  })
})

test('token vacío, inicio y final no alteran separadores o etiquetas ajenas', () => {
  expect(genreToken(', Rock', 0)).toMatchObject({ start: 0, end: 0, term: '' })
  expect(completeGenre('Rock,  De', 9, 'Death Metal').value).toBe(
    'Rock,  Death Metal',
  )
  expect(genreToken('Rock, ', 6)).toMatchObject({
    term: '',
    excluded: ['Rock'],
  })
})
