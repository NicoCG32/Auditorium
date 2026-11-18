import { musicBrainzUrl } from './request.mjs'

const encoder = new TextEncoder()
async function cacheKey(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}
async function readBody(response) {
  if (
    !response.headers.get('content-type')?.includes('application/json') ||
    !response.body
  )
    throw new Error('Invalid catalog response')
  const reader = response.body.getReader(),
    decoder = new TextDecoder()
  let bytes = 0,
    body = ''
  try {
    while (true) {
      const row = await reader.read()
      if (row.done) break
      bytes += row.value.byteLength
      if (bytes > 2 * 1024 * 1024) throw new Error('Catalog response too large')
      body += decoder.decode(row.value, { stream: true })
    }
    body += decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
  const parsed = JSON.parse(body)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Invalid catalog body')
  return body
}
/** Multiple isolates share a bounded queue, cache and expiring lease in Postgres. */
export function createMusicBrainzGateway({
  store,
  apiKeys,
  origins = ['https://nicocg32.github.io'],
  fetchImpl = fetch,
  totalTimeoutMs = 45000,
  upstreamTimeoutMs = 15000,
  sleep = wait,
}) {
  return async (request) => {
    const origin = request.headers.get('Origin')
    const headers = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
    }
    if (origin && !origins.includes(origin))
      return new Response(null, { status: 403, headers })
    if (origin) headers['Access-Control-Allow-Origin'] = origin
    const reply = (body, status = 200) =>
      new Response(body, {
        status,
        headers: {
          ...headers,
          'Content-Type': 'application/json; charset=utf-8',
          ...(status === 503 ? { 'Retry-After': '2' } : {}),
        },
      })
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'apikey, accept',
          'Access-Control-Max-Age': '600',
        },
      })
    if (request.method !== 'GET')
      return new Response(null, {
        status: 405,
        headers: { ...headers, Allow: 'GET, OPTIONS' },
      })
    // Project publishable keys identify the public app; no session or personal JWT is sent.
    const key = request.headers.get('apikey')
    if (!key || !apiKeys.includes(key))
      return reply('{"error":"unauthorized"}', 401)
    const incoming = new URL(request.url)
    const prefix = ['/functions/v1/musicbrainz/', '/musicbrainz/'].find(
      (value) => incoming.pathname.startsWith(value),
    )
    const upstream =
      prefix &&
      musicBrainzUrl(
        incoming.pathname.slice(prefix.length),
        incoming.searchParams,
      )
    if (!upstream) return reply('{"error":"invalid_catalog_request"}', 400)
    const requestId = crypto.randomUUID(),
      hash = await cacheKey(upstream.href)
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(totalTimeoutMs),
    ])
    let queued = false
    try {
      while (true) {
        signal.throwIfAborted()
        const slot = await store.enter(requestId, hash)
        if (slot.state === 'cached' && typeof slot.body === 'string') {
          queued = false
          return reply(slot.body)
        }
        if (slot.state === 'busy') return reply('{"error":"catalog_busy"}', 503)
        if (slot.state !== 'wait' && slot.state !== 'acquired')
          throw new Error('Invalid catalog coordination response')
        queued = true
        if (slot.state === 'acquired') break
        if (
          !Number.isInteger(slot.retry_ms) ||
          slot.retry_ms < 1 ||
          slot.retry_ms > 1100
        )
          throw new Error('Invalid catalog wait')
        await sleep(slot.retry_ms, signal)
      }
      signal.throwIfAborted()
      const response = await fetchImpl(upstream, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Auditorium/1.1 (https://github.com/NicoCG32/Auditorium)',
        },
        redirect: 'error',
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(upstreamTimeoutMs),
        ]),
      })
      if (!response.ok)
        return reply(
          '{"error":"catalog_unavailable"}',
          response.status === 429 || response.status === 503 ? 503 : 502,
        )
      const body = await readBody(response)
      signal.throwIfAborted()
      const saved = await store.leave(requestId, hash, body)
      if (!saved.released) throw new Error('Catalog lease expired')
      queued = false
      return reply(body)
    } catch {
      return reply(
        '{"error":"catalog_unavailable"}',
        signal.aborted ? 504 : 503,
      )
    } finally {
      if (queued) await store.leave(requestId, hash).catch(() => {})
    }
  }
}
