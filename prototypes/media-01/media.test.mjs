import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  inspectLink,
  readMetadata,
  embedUrl,
  youtubeError,
  fetchMetadata,
} from './media.mjs'

const spotify = 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy'
test('reconoce tipos sin transformar pista, vídeo o lista en álbum', () => {
  for (const kind of ['album', 'track', 'playlist'])
    assert.equal(inspectLink(spotify.replace('album', kind)).kind, kind)
  for (const url of [
    'https://youtu.be/M7lc1UVf-VE',
    'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    'https://music.youtube.com/watch?v=M7lc1UVf-VE',
    'https://www.youtube.com/shorts/M7lc1UVf-VE',
  ])
    assert.equal(inspectLink(url).kind, 'video')
  assert.equal(
    inspectLink('https://www.youtube.com/playlist?list=PL1234567890').kind,
    'playlist',
  )
})
test('URL locales, activas, credenciales y hosts parecidos no disparan consultas', () => {
  for (const url of [
    'http://example.com',
    'javascript:alert(1)',
    'https://user:pass@open.spotify.com/album/a',
    'https://example.com:444/',
    'https://example.com/<b>',
  ])
    assert.throws(() => inspectLink(url))
  for (const url of [
    'https://open.spotify.com.evil.example/album/4aawyAB9vmqN3uQ7FjRGTy',
    'https://spoti.fi/public',
    'https://spotify.link/public',
    'https://example.com/album',
    'https://youtube.com/watch?v=bad',
  ])
    assert.equal(inspectLink(url).metadataUrl, undefined)
})
test('no ejecuta HTML remoto ni acepta miniaturas de hosts ajenos', () => {
  const result = readMetadata(
    {
      provider_name: 'Spotify',
      title: '<img src=x onerror=alert(1)>',
      html: '<script>throw 1</script>',
      thumbnail_url: 'https://evil.example/cover',
    },
    'spotify',
  )
  assert.deepEqual(result, { title: '<img src=x onerror=alert(1)>' })
  assert.throws(() =>
    readMetadata({ provider_name: 'Other', title: 'Ficticio' }, 'spotify'),
  )
  assert.deepEqual(
    readMetadata(
      { provider_name: 'Spotify', title: 'Ficticio', thumbnail_url: 'invalid' },
      'spotify',
    ),
    { title: 'Ficticio' },
  )
  assert.ok(
    readMetadata(
      {
        provider_name: 'Spotify',
        title: 'Ficticio',
        thumbnail_url: 'https://image-cdn-fa.spotifycdn.com/image/fixture',
      },
      'spotify',
    ).thumbnail,
  )
  assert.throws(() =>
    readMetadata(
      { provider_name: 'Spotify', title: 'a'.repeat(501) },
      'spotify',
    ),
  )
})
test('el embed usa únicamente rutas permitidas y un origen explícito; la lista no es un vídeo', () => {
  assert.equal(
    embedUrl(inspectLink(spotify), 'https://example.com'),
    'https://open.spotify.com/embed/album/4aawyAB9vmqN3uQ7FjRGTy',
  )
  const url = new URL(
    embedUrl(
      inspectLink('https://www.youtube.com/playlist?list=PL1234567890'),
      'https://example.com',
    ),
  )
  assert.equal(url.searchParams.get('listType'), 'playlist')
  assert.equal(url.searchParams.get('origin'), 'https://example.com')
  assert.equal(url.searchParams.get('autoplay'), '0')
  assert.equal(
    embedUrl(inspectLink('https://example.com'), 'https://example.com'),
    undefined,
  )
})
test('los errores de privacidad, inserción e identidad tienen salida externa clara', () => {
  for (const code of [2, 5, 100, 101, 150, 153])
    assert.ok(youtubeError(code).length > 10)
  assert.match(youtubeError(100), /privado/)
  assert.match(youtubeError(153), /Referer/)
})
test('acota las respuestas y rechaza HTML, HTTP fallido y proveedores incorrectos', async (t) => {
  const original = globalThis.fetch
  t.after(() => {
    globalThis.fetch = original
  })
  for (const response of [
    new Response('x', { status: 404 }),
    new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    Response.json({ provider_name: 'Other', title: 'Ficticio' }),
    new Response('x'.repeat(65537), {
      headers: { 'content-type': 'application/json' },
    }),
  ]) {
    globalThis.fetch = async () => response
    await assert.rejects(fetchMetadata(inspectLink(spotify)))
  }
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.credentials, 'omit')
    assert.equal(options.redirect, 'error')
    return Response.json({ provider_name: 'Spotify', title: 'Título Ficticio' })
  }
  assert.deepEqual(await fetchMetadata(inspectLink(spotify)), {
    title: 'Título Ficticio',
  })
})
