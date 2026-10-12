// @vitest-environment node
import { expect, test } from 'vitest'
import { fixtureId } from '../../domain/catalog/catalog.fixture'
import { emptyAlbumForm, parseAlbumForm } from './album-form-values'

test('solo artista y título; campos opcionales vacíos se omiten', () => {
  const result = parseAlbumForm({
    ...emptyAlbumForm,
    artist: ' Umbral ficticio ',
    title: ' Eclipse ',
    originalYear: ' ',
    coverUrl: ' ',
    description: ' ',
  })
  expect(result).toEqual({
    success: true,
    input: {
      title: 'Eclipse',
      releaseType: 'album',
      artists: [{ name: 'Umbral ficticio', role: 'primary' }],
    },
  })
})
test('metadatos válidos y artista por referencia explícita', () => {
  const result = parseAlbumForm({
    ...emptyAlbumForm,
    artist: 'Umbral ficticio',
    artistId: fixtureId(1),
    title: 'Otra órbita',
    releaseType: 'ep',
    originalYear: '1998',
    coverUrl: 'https://example.invalid/portada.png',
    description: ' Texto ficticio ',
  })
  expect(result).toMatchObject({
    success: true,
    input: {
      releaseType: 'ep',
      originalYear: 1998,
      artists: [{ artistId: fixtureId(1) }],
      description: 'Texto ficticio',
    },
  })
})
test.each(['0', '-1', '1998.5', '10000', '1e3', 'texto'])(
  'año %s se informa sin inventar otro',
  (originalYear) => {
    const result = parseAlbumForm({
      ...emptyAlbumForm,
      artist: 'Umbral ficticio',
      title: 'Eclipse',
      originalYear,
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Falta error de año ficticio.')
    expect(result.errors.originalYear).toContain('año entero')
  },
)
test('errores de artista/título y portada se vinculan a sus campos', () => {
  const result = parseAlbumForm({
    ...emptyAlbumForm,
    artist: ' ',
    title: ' ',
    coverUrl: 'http://example.invalid/portada',
  })
  expect(result.success).toBe(false)
  if (result.success) throw new Error('Faltan errores de campos ficticios.')
  expect(Object.keys(result.errors).toSorted()).toEqual([
    'artist',
    'coverUrl',
    'title',
  ])
})
