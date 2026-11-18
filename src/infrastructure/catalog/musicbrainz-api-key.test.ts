import { expect, test, vi } from 'vitest'
import { catalogApiKey, MusicBrainzClient } from './musicbrainz-client'

test('la clave publicable sólo se envía al catálogo de ese proyecto Supabase', async () => {
  const project = 'https://catalog-test.supabase.co',
    key = 'sb_publishable_fictitious'
  const base = project + '/functions/v1/musicbrainz'
  expect(catalogApiKey(base, project, key)).toBe(key)
  for (const value of [
    'https://other.example/functions/v1/musicbrainz',
    project + '/functions/v1/other',
    base + '?x=1',
    base + '#x',
    'https://user:pass@catalog-test.supabase.co/functions/v1/musicbrainz',
  ])
    expect(catalogApiKey(value, project, key)).toBeUndefined()
  expect(catalogApiKey(base, project, 'sb_secret_fictitious')).toBeUndefined()
  expect(catalogApiKey(base, undefined, key)).toBeUndefined()
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json({ artists: [] })),
  )
  await new MusicBrainzClient(base, fetcher, key).searchArtists(
    'Prueba',
    new AbortController().signal,
  )
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    headers: { apikey: key },
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
})
