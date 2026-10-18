import { afterEach, expect, test, vi } from 'vitest'
import { createWikidataClient } from './wikidata-client'

const albumId = 'Q900000001'
const otherAlbumId = 'Q900000002'
const artistId = 'Q900000101'
const collaboratorId = 'Q900000102'
const mbid = '00000000-0000-4000-8000-000000000001'

function statement(value: unknown, rank = 'normal') {
  return { rank, mainsnak: { snaktype: 'value', datavalue: { value } } }
}

function entityValue(id: string) {
  return statement({ id })
}

function album(overrides: Record<string, unknown> = {}) {
  return {
    id: albumId,
    labels: { es: { value: 'Horizonte ficticio' } },
    descriptions: { es: { value: 'Álbum ficticio para pruebas' } },
    claims: {
      P31: [entityValue('Q482994')],
      P175: [entityValue(artistId), entityValue(collaboratorId)],
      P577: [
        statement({
          time: '+2001-00-00T00:00:00Z',
          precision: 9,
          calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
        }),
      ],
      P436: [statement(mbid)],
      P2205: [statement('A'.repeat(22)), statement('B'.repeat(22))],
      P1651: [statement('A'.repeat(11))],
      ...overrides,
    },
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function requestUrl(input: Parameters<typeof fetch>[0] | undefined): URL {
  if (typeof input !== 'string')
    throw new Error('Se esperaba una URL de texto.')
  return new URL(input)
}

function fixtureFetch(entity = album()) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ search: [{ id: albumId }] }))
    .mockResolvedValueOnce(json({ entities: { [albumId]: entity } }))
    .mockResolvedValueOnce(
      json({
        entities: {
          [artistId]: {
            id: artistId,
            labels: { es: { value: 'Artista ficticio' } },
          },
          [collaboratorId]: {
            id: collaboratorId,
            labels: { en: { value: 'Colaborador ficticio' } },
          },
        },
      }),
    )
}

afterEach(() => vi.useRealTimers())

test('consulta identificada y acotada devuelve créditos completos y referencias verificables', async () => {
  const fetcher = fixtureFetch()
  const client = createWikidataClient({ fetch: fetcher, minIntervalMs: 0 })
  const result = await client.search({
    title: 'Horizonte ficticio',
    artist: 'Artista ficticio',
  })
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({
    id: albumId,
    title: 'Horizonte ficticio',
    artists: ['Artista ficticio', 'Colaborador ficticio'],
    releaseType: 'album',
    originalYear: 2001,
    catalogReference: {
      provider: 'wikidata',
      entityId: albumId,
      musicBrainzReleaseGroupId: mbid,
      spotifyAlbumIds: ['A'.repeat(22), 'B'.repeat(22)],
      youtubeVideoIds: ['A'.repeat(11)],
    },
    coverUrl: `https://coverartarchive.org/release-group/${mbid}/front-500`,
  })
  expect(result[0]?.catalogReference.retrievedAt).toMatch(/^\d{4}-.*Z$/u)
  expect(fetcher).toHaveBeenCalledTimes(3)
  for (const [input, options] of fetcher.mock.calls) {
    const url = requestUrl(input)
    expect(url.origin + url.pathname).toBe('https://www.wikidata.org/w/api.php')
    expect(url.searchParams.get('origin')).toBe('*')
    expect(options).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      redirect: 'error',
    })
    expect(new Headers(options?.headers).get('Api-User-Agent')).toContain(
      'https://github.com/NicoCG32/Auditorium',
    )
    expect(url.href).not.toContain('Artista+ficticio')
  }
  const artistLookup = requestUrl(fetcher.mock.calls[2]?.[0])
  expect(artistLookup.searchParams.get('ids')).toBe(
    `${artistId}|${collaboratorId}`,
  )
})

test('descarta libros y grupos homónimos aunque el buscador los ponga primero', async () => {
  const entity = album({ P31: [entityValue('Q571')] })
  const fetcher = fixtureFetch(entity)
  const result = await createWikidataClient({
    fetch: fetcher,
    minIntervalMs: 0,
  }).search({ title: 'Horizonte ficticio', artist: '' })
  expect(result).toEqual([])
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test('conserva homónimos y ordena el artista coincidente sin confirmar ni fusionar', async () => {
  const first = album({ P175: [entityValue(collaboratorId)] })
  const second = {
    ...album({ P175: [entityValue(artistId)] }),
    id: otherAlbumId,
  }
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      json({ search: [{ id: albumId }, { id: otherAlbumId }] }),
    )
    .mockResolvedValueOnce(
      json({ entities: { [albumId]: first, [otherAlbumId]: second } }),
    )
    .mockResolvedValueOnce(
      json({
        entities: {
          [artistId]: {
            id: artistId,
            labels: { es: { value: 'Artista ficticio' } },
          },
          [collaboratorId]: {
            id: collaboratorId,
            labels: { es: { value: 'Otro artista ficticio' } },
          },
        },
      }),
    )
  const result = await createWikidataClient({
    fetch: fetcher,
    minIntervalMs: 0,
  }).search({ title: 'Horizonte ficticio', artist: 'Artista ficticio' })
  expect(result.map((item) => item.id)).toEqual([otherAlbumId, albumId])
  expect(result[1]?.artists).toEqual(['Otro artista ficticio'])
})

test('omite IDs ajenos a su formato, pistas Spotify y declaraciones obsoletas', async () => {
  const entity = album({
    P436: [statement('https://example.invalid/album')],
    P2205: [
      statement('javascript:alert(1)'),
      statement('A'.repeat(22), 'deprecated'),
    ],
    P2207: [statement('B'.repeat(22))],
    P1651: [statement('https://youtu.be/falso')],
    P18: [statement('imagen-ficticia.png')],
  })
  const fetcher = fixtureFetch(entity)
  const [result] = await createWikidataClient({
    fetch: fetcher,
    minIntervalMs: 0,
  }).search({ title: 'Horizonte ficticio', artist: '' })
  expect(result?.catalogReference).toMatchObject({
    provider: 'wikidata',
    entityId: albumId,
  })
  expect(Object.keys(result?.catalogReference ?? {}).sort()).toEqual([
    'entityId',
    'provider',
    'retrievedAt',
  ])
  expect(result).not.toHaveProperty('coverUrl')
})

test('fechas discordantes no se convierten silenciosamente en año original', async () => {
  const dates = [2001, 2002].map((year) =>
    statement({
      time: `+${year}-00-00T00:00:00Z`,
      precision: 9,
      calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
    }),
  )
  const fetcher = fixtureFetch(
    album({ P577: dates, P31: [entityValue('Q169930')] }),
  )
  const [result] = await createWikidataClient({
    fetch: fetcher,
    minIntervalMs: 0,
  }).search({ title: 'Horizonte ficticio', artist: '' })
  expect(result?.releaseType).toBe('ep')
  expect(result).not.toHaveProperty('originalYear')
  expect(result?.warnings).toContain(
    'La fecha de publicación necesita revisión manual.',
  )
})

test('no pierde créditos cuando una etiqueta de artista no se pudo resolver', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ search: [{ id: albumId }] }))
    .mockResolvedValueOnce(json({ entities: { [albumId]: album() } }))
    .mockResolvedValueOnce(
      json({
        entities: {
          [artistId]: {
            id: artistId,
            labels: { es: { value: 'Artista ficticio' } },
          },
        },
      }),
    )
  const result = await createWikidataClient({
    fetch: fetcher,
    minIntervalMs: 0,
  }).search({ title: 'Horizonte ficticio', artist: '' })
  expect(result).toEqual([])
})

test('lista vacía es una consulta sin referencia, sin solicitar detalles', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ search: [] }))
  const result = await createWikidataClient({ fetch: fetcher }).search({
    title: 'Título ficticio',
    artist: '',
  })
  expect(result).toEqual([])
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test.each([
  [json({ error: { code: 'maxlag', info: 'texto remoto' } }), 'rate_limited'],
  [
    json({ error: { code: 'unexpected', info: 'texto remoto' } }),
    'unavailable',
  ],
  [json({}, 429), 'rate_limited'],
  [json({}, 503), 'rate_limited'],
  [json({}, 500), 'unavailable'],
  [
    new Response('<html>fallo</html>', {
      headers: { 'Content-Type': 'text/html' },
    }),
    'invalid_response',
  ],
  [json({ search: {} }), 'invalid_response'],
])(
  'error del proveedor se clasifica y no se reintenta solo (%#)',
  async (response, kind) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response)
    await expect(
      createWikidataClient({ fetch: fetcher }).search({
        title: 'Título ficticio',
        artist: '',
      }),
    ).rejects.toMatchObject({ kind })
    expect(fetcher).toHaveBeenCalledTimes(1)
  },
)

test('acota bytes reales aunque no haya Content-Length y permite otra consulta', async () => {
  const oversized = json({ search: [], unwanted: 'x'.repeat(1_000_000) })
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(oversized)
    .mockResolvedValueOnce(json({ search: [] }))
  const client = createWikidataClient({ fetch: fetcher, minIntervalMs: 0 })
  await expect(
    client.search({ title: 'Título ficticio', artist: '' }),
  ).rejects.toMatchObject({ kind: 'invalid_response' })
  await expect(
    client.search({ title: 'Otro título ficticio', artist: '' }),
  ).resolves.toEqual([])
})

test('la cola compartida separa solicitudes de dos búsquedas simultáneas', async () => {
  vi.useFakeTimers()
  const starts: number[] = []
  const fetcher = vi.fn<typeof fetch>().mockImplementation(() => {
    starts.push(Date.now())
    return Promise.resolve(json({ search: [] }))
  })
  const client = createWikidataClient({ fetch: fetcher })
  const first = client.search({ title: 'Uno ficticio', artist: '' })
  const second = client.search({ title: 'Dos ficticio', artist: '' })
  await vi.advanceTimersByTimeAsync(1099)
  expect(fetcher).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  await Promise.all([first, second])
  expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1100)
})

test('cancelar una consulta en cola evita enviar su título', async () => {
  let resolveFirst!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve
      }),
  )
  const client = createWikidataClient({ fetch: fetcher, minIntervalMs: 0 })
  const first = client.search({ title: 'Uno ficticio', artist: '' })
  const controller = new AbortController()
  const second = client.search({
    title: 'Dos ficticio',
    artist: '',
    signal: controller.signal,
  })
  const rejected = expect(second).rejects.toHaveProperty('name', 'AbortError')
  await Promise.resolve()
  await Promise.resolve()
  controller.abort()
  resolveFirst(json({ search: [] }))
  await first
  await rejected
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('timeout cancela el transporte y libera una consulta posterior', async () => {
  vi.useFakeTimers()
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelado', 'AbortError')),
            { once: true },
          )
        }),
    )
    .mockResolvedValueOnce(json({ search: [] }))
  const client = createWikidataClient({
    fetch: fetcher,
    minIntervalMs: 0,
    timeoutMs: 100,
  })
  const assertion = expect(
    client.search({ title: 'Uno ficticio', artist: '' }),
  ).rejects.toMatchObject({ kind: 'timeout' })
  await vi.advanceTimersByTimeAsync(100)
  await assertion
  await expect(
    client.search({ title: 'Dos ficticio', artist: '' }),
  ).resolves.toEqual([])
})

test('consulta vacía o excesiva no sale del navegador', async () => {
  const fetcher = vi.fn<typeof fetch>()
  const client = createWikidataClient({ fetch: fetcher })
  await expect(client.search({ title: ' ', artist: '' })).rejects.toMatchObject(
    { kind: 'invalid_query' },
  )
  await expect(
    client.search({ title: 'a'.repeat(201), artist: '' }),
  ).rejects.toMatchObject({ kind: 'invalid_query' })
  expect(fetcher).not.toHaveBeenCalled()
})

test('limita la búsqueda a ocho candidatos y no sigue resultados adicionales', async () => {
  const candidateIds = Array.from(
    { length: 10 },
    (_, index) => `Q90000100${index}`,
  )
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ search: candidateIds.map((id) => ({ id })) }))
    .mockResolvedValueOnce(json({ entities: {} }))
  const result = await createWikidataClient({
    fetch: fetcher,
    minIntervalMs: 0,
  }).search({ title: 'Horizonte ficticio', artist: '' })
  expect(result).toEqual([])
  const searchUrl = requestUrl(fetcher.mock.calls[0]?.[0])
  const detailUrl = requestUrl(fetcher.mock.calls[1]?.[0])
  expect(searchUrl.searchParams.get('limit')).toBe('8')
  expect(detailUrl.searchParams.get('ids')?.split('|')).toEqual(
    candidateIds.slice(0, 8),
  )
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test('demasiados créditos no disparan más consultas ni se recortan silenciosamente', async () => {
  const artists = Array.from({ length: 33 }, (_, index) =>
    entityValue(`Q9000011${index}`),
  )
  const fetcher = fixtureFetch(album({ P175: artists }))
  await expect(
    createWikidataClient({ fetch: fetcher, minIntervalMs: 0 }).search({
      title: 'Horizonte ficticio',
      artist: '',
    }),
  ).rejects.toMatchObject({ kind: 'invalid_response' })
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test('acota declaraciones de una propiedad antes de resolverlas', async () => {
  const fetcher = fixtureFetch(
    album({ P175: Array.from({ length: 65 }, () => entityValue(artistId)) }),
  )
  await expect(
    createWikidataClient({ fetch: fetcher, minIntervalMs: 0 }).search({
      title: 'Horizonte ficticio',
      artist: '',
    }),
  ).rejects.toMatchObject({ kind: 'invalid_response' })
  expect(fetcher).toHaveBeenCalledTimes(2)
})

test('un UUID con sintaxis de guiones pero versión inválida no rompe los demás datos', async () => {
  const fetcher = fixtureFetch(
    album({ P436: [statement('00000000-0000-0000-0000-000000000001')] }),
  )
  const [result] = await createWikidataClient({
    fetch: fetcher,
    minIntervalMs: 0,
  }).search({ title: 'Horizonte ficticio', artist: '' })
  expect(result?.catalogReference).not.toHaveProperty(
    'musicBrainzReleaseGroupId',
  )
  expect(result).not.toHaveProperty('coverUrl')
  expect(result?.artists).toEqual(['Artista ficticio', 'Colaborador ficticio'])
})

test('UTF-8 inválido se clasifica como respuesta inválida sin mostrar bytes remotos', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(new Uint8Array([0xff]), {
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  await expect(
    createWikidataClient({ fetch: fetcher }).search({
      title: 'Horizonte ficticio',
      artist: '',
    }),
  ).rejects.toMatchObject({ kind: 'invalid_response' })
})

test.each([
  ['Q208569', 'album'],
  ['Q209939', 'live'],
  ['Q222910', 'compilation'],
  ['Q169930', 'ep'],
  ['Q134556', 'single'],
])('acepta la clase musical %s como %s', async (id, releaseType) => {
  const fetcher = fixtureFetch(album({ P31: [entityValue(id)] }))
  const [result] = await createWikidataClient({
    fetch: fetcher,
    minIntervalMs: 0,
  }).search({ title: 'Horizonte ficticio', artist: '' })
  expect(result?.releaseType).toBe(releaseType)
})

test('una forma musical no convierte una película en álbum', async () => {
  const fetcher = fixtureFetch(
    album({ P31: [entityValue('Q11424')], P7937: [entityValue('Q208569')] }),
  )
  const result = await createWikidataClient({
    fetch: fetcher,
    minIntervalMs: 0,
  }).search({ title: 'Horizonte ficticio', artist: '' })
  expect(result).toEqual([])
  expect(fetcher).toHaveBeenCalledTimes(2)
})
