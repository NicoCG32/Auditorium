import { musicBrainzUrl } from '../supabase/functions/musicbrainz/request.mjs'
import { setTimeout as delay } from 'node:timers/promises'

const prefix = '/api/musicbrainz/'

/** One instance owns the outgoing queue for the entire process, across clients. */
export function createMusicBrainzProxy({
  fetchImpl = fetch,
  intervalMs = 1100,
  timeoutMs = 15000,
  cacheMs = 6 * 60 * 60 * 1000,
  origins = ['http://127.0.0.1:5173', 'http://localhost:5173'],
} = {}) {
  const cache = new Map()
  let tail = Promise.resolve()
  let queued = 0
  let lastStarted = 0

  async function query(url, signal) {
    const key = url.href
    const hit = cache.get(key)
    if (hit && hit.expires > Date.now()) return hit.body
    if (hit) cache.delete(key)
    if (queued >= 32) throw Object.assign(new Error('busy'), { status: 503 })
    queued++
    const task = tail.then(async () => {
      signal.throwIfAborted()
      // A prior queued request may have filled the cache in the meantime.
      const cached = cache.get(key)
      if (cached && cached.expires > Date.now()) return cached.body
      await delay(
        Math.max(0, lastStarted + intervalMs - Date.now()),
        undefined,
        { signal },
      )
      lastStarted = Date.now()
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Auditorium/1.1 (https://github.com/NicoCG32/Auditorium)',
        },
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
        redirect: 'error',
      })
      if (!response.ok)
        throw Object.assign(new Error('upstream'), {
          status:
            response.status === 429 || response.status === 503 ? 503 : 502,
        })
      if (
        !response.headers.get('content-type')?.includes('application/json') ||
        !response.body
      )
        throw Object.assign(new Error('invalid_response'), { status: 502 })
      const reader = response.body.getReader()
      const chunks = []
      let bytes = 0
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > 2 * 1024 * 1024) throw new Error('response_too_large')
          chunks.push(Buffer.from(value))
        }
      } finally {
        await reader.cancel().catch(() => {})
      }
      const body = Buffer.concat(chunks).toString('utf8')
      JSON.parse(body)
      if (cache.size >= 128) cache.delete(cache.keys().next().value)
      cache.set(key, { body, expires: Date.now() + cacheMs })
      return body
    })
    tail = task.then(
      () => {},
      () => {},
    )
    try {
      return await task
    } finally {
      queued--
    }
  }

  return async function musicBrainzProxy(request, response, next) {
    let incoming
    try {
      incoming = new URL(request.url ?? '/', 'http://localhost')
    } catch {
      response.writeHead(400).end()
      return
    }
    if (!incoming.pathname.startsWith(prefix)) {
      if (next) next()
      else response.writeHead(404).end()
      return
    }
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Vary', 'Origin')
    const origin = request.headers.origin
    if (origin && !origins.includes(origin)) {
      response.writeHead(403).end()
      return
    }
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin)
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      response.writeHead(405).end()
      return
    }
    const upstream = musicBrainzUrl(
      incoming.pathname.slice(prefix.length),
      incoming.searchParams,
    )
    if (!upstream) {
      response.writeHead(400).end()
      return
    }
    const controller = new AbortController()
    response.once('close', () => {
      if (!response.writableEnded) controller.abort()
    })
    // Limit the total time in the queue as well as the upstream fetch.
    const timer = setTimeout(() => controller.abort(), 45000)
    try {
      const body = await query(upstream, controller.signal)
      if (!response.destroyed)
        response
          .writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          .end(body)
    } catch (error) {
      if (!response.destroyed) {
        const status =
          error.status ??
          (error.name === 'TimeoutError' || controller.signal.aborted
            ? 504
            : 502)
        response
          .writeHead(status, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: 'catalog_unavailable' }))
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
