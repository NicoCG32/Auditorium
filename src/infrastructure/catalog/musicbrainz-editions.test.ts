import { expect, test, vi } from 'vitest'
import { MusicBrainzClient } from './musicbrainz-client'
import { editionDetailsFrom } from './musicbrainz-editions'
import { editionFormat } from '../../application/edition-catalog'
import { fixtureId } from '../../domain/catalog/catalog.fixture'

const wire = {
  id: fixtureId(8600),
  title: 'Edición ficticia',
  date: '2001-03',
  country: 'CL',
  'release-group': { id: fixtureId(8601) },
  'label-info': [{ label: { name: 'Sello' }, 'catalog-number': 'TEST-1' }],
  media: [
    {
      position: 1,
      format: 'CD',
      'track-count': 1,
      tracks: [
        {
          position: 1,
          title: 'Pista de prueba',
          length: 123000,
          recording: { id: fixtureId(8602), title: 'Grabación de prueba' },
        },
      ],
    },
  ],
}
test('convierte posiciones multidisco y grabación; no deduce una fecha completa ni un formato mixto simple', () => {
  const parsed = editionDetailsFrom(wire)
  expect(parsed).toMatchObject({
    date: '2001-03',
    label: 'Sello',
    catalogNumber: 'TEST-1',
    completeTracks: true,
    tracks: [
      {
        recordingId: fixtureId(8602),
        discNumber: 1,
        trackNumber: 1,
        durationMs: 123000,
      },
    ],
  })
  expect(editionFormat(['CD', 'CD'])).toBe('cd')
  expect(editionFormat(['CD', 'DVD'])).toBe('other')
  expect(editionFormat(['12" Vinyl'])).toBe('vinyl')
  expect(
    editionDetailsFrom({
      ...wire,
      'label-info': [{ label: null, 'catalog-number': null }],
    }).catalogNumber,
  ).toBeUndefined()
  expect(
    editionDetailsFrom({
      ...wire,
      'label-info': [{ label: { name: 'Sello' }, 'catalog-number': '' }],
    }).label,
  ).toBe('Sello')
})
test('una lista truncada o con pregap se identifica como incompleta; posiciones duplicadas se rechazan', () => {
  expect(
    editionDetailsFrom({
      ...wire,
      media: [{ ...wire.media[0], 'track-count': 2 }],
    }).completeTracks,
  ).toBe(false)
  expect(
    editionDetailsFrom({
      ...wire,
      media: [{ ...wire.media[0], pregap: { title: 'Pregap' } }],
    }).completeTracks,
  ).toBe(false)
  expect(() =>
    editionDetailsFrom({ ...wire, media: [wire.media[0], wire.media[0]] }),
  ).toThrow()
})
test('pagina por la cantidad recibida y valida que la consulta detallada corresponda al ID solicitado', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        'release-count': 2,
        'release-offset': 0,
        releases: [wire],
      }),
    )
    .mockResolvedValueOnce(Response.json(wire))
  const client = new MusicBrainzClient(
    'https://catalog.example/api/musicbrainz',
    fetcher,
  )
  const page = await client.browseEditions(
    fixtureId(8601),
    0,
    new AbortController().signal,
  )
  expect(page.nextOffset).toBe(1)
  expect(page.editions[0]?.formats).toEqual(['CD'])
  await expect(
    client.edition(fixtureId(8699), new AbortController().signal),
  ).rejects.toThrow()
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
})
