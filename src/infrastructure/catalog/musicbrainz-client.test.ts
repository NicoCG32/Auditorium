// @vitest-environment node
import { expect, test, vi } from 'vitest'
import { MusicBrainzClient } from './musicbrainz-client'
import { fixtureId } from '../../domain/catalog/catalog.fixture'
import { filterDiscography } from '../../application/discography-catalog'

const artist = {
  id: fixtureId(9000),
  name: 'Artista Ficticio',
  country: 'CL',
  disambiguation: 'Grupo de prueba',
}
const group = {
  id: fixtureId(9001),
  title: 'Obra de prueba',
  'primary-type': 'Album',
  'secondary-types': [],
  'first-release-date': '2001',
  'artist-credit': [{ artist }],
}
const signal = () => new AbortController().signal
test('busca artistas por el intermediario sin enviar biblioteca, cookies ni credenciales', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ artists: [artist] }))
  const client = new MusicBrainzClient(
    'https://catalog.example/api/musicbrainz/',
    fetcher,
  )
  expect(await client.searchArtists('Artista Ficticio', signal())).toEqual([
    {
      id: artist.id,
      name: artist.name,
      country: 'CL',
      description: 'Grupo de prueba',
    },
  ])
  const [url, options] = fetcher.mock.calls[0]!
  expect(url).toBe(
    'https://catalog.example/api/musicbrainz/artist?query=Artista+Ficticio',
  )
  expect(options).toMatchObject({
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
  })
  expect(options?.body).toBeUndefined()
})
test('pagina por cantidad recibida y conserva créditos y fechas parciales', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      'release-group-count': 101,
      'release-group-offset': 0,
      'release-groups': [group],
    }),
  )
  const result = await new MusicBrainzClient(
    '/api/musicbrainz',
    fetcher,
  ).browseAlbums(artist.id, 0, signal())
  expect(result.total).toBe(101)
  expect(result.nextOffset).toBe(1)
  expect(result.albums[0]).toMatchObject({
    title: group.title,
    firstReleaseDate: '2001',
    artists: [{ id: artist.id }],
  })
})
test('estudio, directos y recopilaciones se filtran sin perder identidades de obra', async () => {
  const groups = [
    group,
    { ...group, id: fixtureId(9002), 'secondary-types': ['Live'] },
    { ...group, id: fixtureId(9003), 'secondary-types': ['Compilation'] },
  ]
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      'release-group-count': 3,
      'release-group-offset': 0,
      'release-groups': groups,
    }),
  )
  const result = await new MusicBrainzClient(
    '/api/musicbrainz',
    fetcher,
  ).browseAlbums(artist.id, 0, signal())
  expect(
    filterDiscography(result.albums, 'studio').map((row) => row.id),
  ).toEqual([group.id])
  expect(filterDiscography(result.albums, 'live')[0]?.id).toBe(fixtureId(9002))
  expect(filterDiscography(result.albums, 'all')).toHaveLength(3)
})
test('una página vacía intermedia y un offset inesperado se rechazan como respuesta incompleta', async () => {
  for (const body of [
    {
      'release-group-count': 101,
      'release-group-offset': 0,
      'release-groups': [],
    },
    {
      'release-group-count': 101,
      'release-group-offset': 10,
      'release-groups': [group],
    },
  ])
    await expect(
      new MusicBrainzClient(
        '/api/musicbrainz',
        vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)),
      ).browseAlbums(artist.id, 0, signal()),
    ).rejects.toThrow()
})
test('un servicio no configurado no inicia ninguna consulta', async () => {
  const fetcher = vi.fn<typeof fetch>(),
    client = new MusicBrainzClient(undefined, fetcher)
  expect(client.available).toBe(false)
  await expect(client.searchArtists('Ejemplo', signal())).rejects.toThrow(
    'no está disponible',
  )
  expect(fetcher).not.toHaveBeenCalled()
})

test('fetch se invoca sin asociarlo a la instancia del adaptador', async () => {
  let calls = 0
  const fetcher: typeof fetch = function (this: unknown) {
    expect(this).toBeUndefined()
    calls++
    return Promise.resolve(Response.json({ artists: [] }))
  }
  await new MusicBrainzClient('/api/musicbrainz', fetcher).searchArtists(
    'Ejemplo',
    signal(),
  )
  expect(calls).toBe(1)
})
test('expone saturación del proveedor como error recuperable y limita bytes', async () => {
  const unavailable = new MusicBrainzClient(
    '/api/musicbrainz',
    vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })),
  )
  await expect(unavailable.searchArtists('Ejemplo', signal())).rejects.toThrow(
    'esperar',
  )
  const oversized = new MusicBrainzClient(
    '/api/musicbrainz',
    vi.fn<typeof fetch>().mockResolvedValue(
      new Response('x'.repeat(2 * 1024 * 1024 + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
  await expect(oversized.searchArtists('Ejemplo', signal())).rejects.toThrow()
})
