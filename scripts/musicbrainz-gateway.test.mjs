import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMusicBrainzGateway } from '../supabase/functions/musicbrainz/gateway.mjs'
import { createCatalogStore } from '../supabase/functions/musicbrainz/store.mjs'

const apiKey = 'sb_publishable_fictitious'
const origin = 'https://nicocg32.github.io'
function request(path = 'artist?query=Prueba', options = {}) {
  return new Request(
    `https://project.example/functions/v1/musicbrainz/${path}`,
    { headers: { Origin: origin, apikey: apiKey }, ...options },
  )
}
function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
test('validates the app key, origin, method and fixed protocol before contacting the store', async () => {
  let calls = 0
  const handler = createMusicBrainzGateway({
    apiKeys: [apiKey],
    store: {
      enter: () => {
        calls++
        throw new Error('Unexpected access')
      },
    },
    fetchImpl: () => {
      throw new Error('Unexpected upstream')
    },
  })
  const preflight = await handler(
    request('artist', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Headers': 'apikey' },
    }),
  )
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin)
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /apikey/)
  assert.equal(
    (
      await handler(
        request('artist?query=Prueba', { headers: { Origin: origin } }),
      )
    ).status,
    401,
  )
  assert.equal(
    (
      await handler(
        request('artist?query=Prueba', {
          headers: { Origin: 'https://untrusted.example', apikey: apiKey },
        }),
      )
    ).status,
    403,
  )
  assert.equal(
    (await handler(request('artist?query=Prueba', { method: 'POST' }))).status,
    405,
  )
  for (const path of [
    'https://example.com',
    'artist?query=x&inc=url-rels',
    'artist?query=a&query=b',
    'release?group=invalid',
    'release/00000000-0000-4000-8000-000000009000?inc=url-rels',
  ])
    assert.equal((await handler(request(path))).status, 400)
  assert.equal(calls, 0)
})
test('two separate handlers share coordination and a cached response, with one upstream call', async () => {
  const firstStarted = deferred(),
    secondWaiting = deferred(),
    fetchResult = deferred(),
    released = deferred()
  let claims = 0,
    fetches = 0,
    body = ''
  const hashes = []
  const store = {
    enter: (_id, key) => {
      hashes.push(key)
      if (++claims === 1) return Promise.resolve({ state: 'acquired' })
      if (claims === 2) {
        secondWaiting.resolve()
        return Promise.resolve({ state: 'wait', retry_ms: 250 })
      }
      return Promise.resolve({ state: 'cached', body })
    },
    leave: (_id, _key, value) => {
      body = value
      released.resolve()
      return Promise.resolve({ released: true })
    },
  }
  const fetcher = (url, options) => {
    fetches++
    assert.equal(url.origin, 'https://musicbrainz.org')
    assert.match(options.headers['User-Agent'], /Auditorium/)
    assert.equal(options.headers.apikey, undefined)
    assert.equal(options.headers.Authorization, undefined)
    assert.equal(options.redirect, 'error')
    firstStarted.resolve()
    return fetchResult.promise
  }
  const options = {
    store,
    apiKeys: [apiKey],
    fetchImpl: fetcher,
    sleep: () => released.promise,
  }
  const first = createMusicBrainzGateway(options)(request())
  await firstStarted.promise
  const second = createMusicBrainzGateway(options)(request())
  await secondWaiting.promise
  fetchResult.resolve(Response.json({ artists: [] }))
  const responses = await Promise.all([first, second])
  assert.equal(fetches, 1)
  for (const response of responses) {
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { artists: [] })
  }
  assert.ok(
    hashes.every((hash) => /^[0-9a-f]{64}$/.test(hash) && hash === hashes[0]),
  )
})
test('a full queue returns a retryable error without fetching; cancellation removes a waiting request', async () => {
  const full = createMusicBrainzGateway({
    apiKeys: [apiKey],
    store: { enter: () => Promise.resolve({ state: 'busy' }) },
    fetchImpl: () => {
      throw new Error('Unexpected upstream')
    },
  })
  const busy = await full(request())
  assert.equal(busy.status, 503)
  assert.equal(busy.headers.get('Retry-After'), '2')
  const controller = new AbortController(),
    waiting = deferred()
  const leaves = []
  const cancel = createMusicBrainzGateway({
    apiKeys: [apiKey],
    store: {
      enter: () => {
        waiting.resolve()
        return Promise.resolve({ state: 'wait', retry_ms: 50 })
      },
      leave: (...args) => {
        leaves.push(args)
        return Promise.resolve({ released: false })
      },
    },
    fetchImpl: () => {
      throw new Error('Unexpected upstream')
    },
  })
  const pending = cancel(
    request('artist?query=Prueba', {
      signal: controller.signal,
      headers: { Origin: origin, apikey: apiKey },
    }),
  )
  await waiting.promise
  controller.abort()
  assert.equal((await pending).status, 504)
  assert.equal(leaves.length, 1)
  assert.equal(leaves[0][2], undefined)
})
test('failed, oversized and malformed upstream responses never fill the cache and always release the lease', async () => {
  for (const make of [
    () => new Response('', { status: 503 }),
    () => Response.json(null),
    () => Response.json([]),
    () =>
      new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    () =>
      new Response('x'.repeat(2 * 1024 * 1024 + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
  ]) {
    const leaves = []
    const handler = createMusicBrainzGateway({
      apiKeys: [apiKey],
      store: {
        enter: () => Promise.resolve({ state: 'acquired' }),
        leave: (...args) => {
          leaves.push(args)
          return Promise.resolve({ released: true })
        },
      },
      fetchImpl: () => Promise.resolve(make()),
    })
    assert.ok((await handler(request())).status >= 500)
    assert.equal(leaves.length, 1)
    assert.equal(leaves[0][2], undefined)
  }
})
test('coordination failures fail closed and never forward a request without a lease', async () => {
  let fetched = false
  const handler = createMusicBrainzGateway({
    apiKeys: [apiKey],
    store: { enter: () => Promise.reject(new Error('private diagnostic')) },
    fetchImpl: () => {
      fetched = true
      throw new Error('Unexpected upstream')
    },
  })
  const response = await handler(request())
  assert.equal(response.status, 503)
  assert.equal(fetched, false)
  assert.equal(await response.text(), '{"error":"catalog_unavailable"}')
})
test('the store calls only fixed project RPCs and keeps the privileged key on that connection', async () => {
  const calls = []
  const store = createCatalogStore(
    'https://project.example',
    'sb_secret_fictitious',
    (url, options) => {
      calls.push({ url, options })
      return Promise.resolve(Response.json({ state: 'acquired' }))
    },
  )
  const id = crypto.randomUUID(),
    key = 'a'.repeat(64)
  await store.enter(id, key)
  await store.leave(id, key, '{}')
  assert.deepEqual(
    calls.map((row) => row.url.pathname),
    ['/rest/v1/rpc/musicbrainz_enter', '/rest/v1/rpc/musicbrainz_leave'],
  )
  assert.equal(calls[0].options.headers.apikey, 'sb_secret_fictitious')
  assert.equal(calls[0].options.headers.Authorization, undefined)
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    p_request_id: id,
    p_key: key,
    p_body: '{}',
  })
  assert.throws(() => createCatalogStore('http://project.example', 'key'))
})
