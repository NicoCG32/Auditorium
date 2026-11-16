import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createMusicBrainzProxy } from './musicbrainz-proxy.mjs'

async function serve(t, options) {
  const proxy = createMusicBrainzProxy({ intervalMs: 0, ...options })
  const server = createServer((request, response) => {
    void proxy(request, response)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(resolve)
      }),
  )
  return `http://127.0.0.1:${server.address().port}/api/musicbrainz/`
}
test('identifies the app, bounds artist search and caches repeated requests', async (t) => {
  const requests = []
  const base = await serve(t, {
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return Response.json({ artists: [] })
    },
  })
  assert.equal((await fetch(`${base}artist?query=Opeth`)).status, 200)
  assert.equal((await fetch(`${base}artist?query=Opeth`)).status, 200)
  assert.equal(requests.length, 1)
  assert.match(
    requests[0].options.headers['User-Agent'],
    /Auditorium.*github.com\/NicoCG32\/Auditorium/,
  )
  assert.equal(requests[0].url.origin, 'https://musicbrainz.org')
  assert.equal(requests[0].url.searchParams.get('query'), 'artist:"Opeth"')
  assert.equal(requests[0].url.searchParams.get('limit'), '12')
})
test('outgoing requests from different clients share one paced queue', async (t) => {
  const starts = []
  const base = await serve(t, {
    intervalMs: 40,
    fetchImpl: async () => {
      starts.push(Date.now())
      return Response.json({ artists: [] })
    },
  })
  const responses = await Promise.all(
    ['Opeth', 'Death', 'Tool'].map((query) =>
      fetch(`${base}artist?query=${query}`),
    ),
  )
  assert.ok(responses.every((response) => response.ok))
  assert.equal(starts.length, 3)
  assert.ok(starts[1] - starts[0] >= 30)
  assert.ok(starts[2] - starts[1] >= 30)
})
test('rejects arbitrary upstreams, unsupported methods, parameters and origins', async (t) => {
  let calls = 0
  const base = await serve(t, {
    fetchImpl: async () => {
      calls++
      return Response.json({})
    },
  })
  for (const path of [
    'https://example.com',
    'recording?query=abc',
    'artist?query=abc&inc=tags',
    'release-group?artist=invalid',
    'artist?query=a&query=b',
  ])
    assert.equal((await fetch(base + path)).status, 400)
  assert.equal(
    (await fetch(`${base}artist?query=abc`, { method: 'POST' })).status,
    405,
  )
  assert.equal(
    (
      await fetch(`${base}artist?query=abc`, {
        headers: { Origin: 'https://untrusted.example' },
      })
    ).status,
    403,
  )
  assert.equal(calls, 0)
})
test('upstream errors are recoverable and are not cached', async (t) => {
  let calls = 0
  const base = await serve(t, {
    fetchImpl: async () =>
      ++calls === 1
        ? new Response('', { status: 503 })
        : Response.json({ artists: [] }),
  })
  assert.equal((await fetch(`${base}artist?query=Opeth`)).status, 503)
  assert.equal((await fetch(`${base}artist?query=Opeth`)).status, 200)
  assert.equal(calls, 2)
})
test('rejects oversized and invalid upstream bodies', async (t) => {
  const base = await serve(t, {
    fetchImpl: async () =>
      new Response('x'.repeat(2 * 1024 * 1024 + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
  })
  assert.equal((await fetch(`${base}artist?query=Opeth`)).status, 502)
})
