import { afterEach, expect, test, vi } from 'vitest'
import { fetchSpotifyResource, readSpotifyResource } from './spotify-resource'
import { inspectPlaybackLink } from './playback-links'

afterEach(() => vi.unstubAllGlobals())
const target = inspectPlaybackLink(
  `https://open.spotify.com/album/${'a'.repeat(22)}`,
)!
const resource = {
  provider_name: 'Spotify',
  title: 'Recurso Ficticio',
  thumbnail_url: 'https://i.scdn.co/image/ficticia',
  html: '<script>never</script>',
  author_name: 'No Inferir Banda',
}
test('la referencia acepta texto y miniatura acotada, descarta HTML y no inventa metadatos musicales', () => {
  expect(readSpotifyResource(resource)).toEqual({
    title: resource.title,
    thumbnail: resource.thumbnail_url,
  })
  for (const url of [
    'javascript:alert(1)',
    'https://i.scdn.co.evil.example/image',
    'https://i.scdn.co:8443/image',
    'bad',
  ])
    expect(readSpotifyResource({ ...resource, thumbnail_url: url })).toEqual({
      title: resource.title,
    })
  expect(
    readSpotifyResource({
      ...resource,
      thumbnail_url: 'https://image-cdn-ak.spotifycdn.com/image/ficticia',
    }).thumbnail,
  ).toContain('spotifycdn.com')
  for (const value of [
    null,
    [],
    {},
    { ...resource, title: ' ' },
    { ...resource, title: 'x'.repeat(501) },
    { ...resource, provider_name: 'YouTube' },
  ])
    expect(() => readSpotifyResource(value)).toThrow()
})

test('consulta sólo el endpoint derivado y omite credenciales, caché y redirecciones', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(resource), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  )
  vi.stubGlobal('fetch', request)
  const signal = new AbortController().signal
  expect(await fetchSpotifyResource(target, signal)).toEqual({
    title: resource.title,
    thumbnail: resource.thumbnail_url,
  })
  expect(request).toHaveBeenCalledExactlyOnceWith(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(target.canonical)}`,
    expect.objectContaining({
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal,
    }),
  )
  await expect(
    fetchSpotifyResource(
      { ...target, canonical: 'https://evil.example' },
      signal,
    ),
  ).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(1)
})

test('HTTP, tipo, JSON y tamaño fallidos nunca producen una propuesta', async () => {
  for (const response of [
    new Response('', { status: 404 }),
    new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    new Response('x'.repeat(65537), {
      headers: { 'Content-Type': 'application/json' },
    }),
  ]) {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response))
    await expect(
      fetchSpotifyResource(target, new AbortController().signal),
    ).rejects.toThrow()
  }
})
