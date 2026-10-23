import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const prefixes = [
  '/prototypes/audio-01/',
  '/Auditorium/prototypes/audio-01/',
]
const manifest = JSON.parse(
  await readFile(new URL('./fixtures/manifest.json', import.meta.url), 'utf8'),
)
const files = new Map([
  ['index.html', 'text/html; charset=utf-8'],
  ...['app.mjs', 'audio.mjs', 'storage.mjs', 'sw.mjs'].map((file) => [
    file,
    'text/javascript; charset=utf-8',
  ]),
  ['fixtures/manifest.json', 'application/json'],
  ...manifest.files.map((file) => [`fixtures/${file.file}`, file.mime]),
])
export async function startServer(port = 4183) {
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url, 'http://localhost').pathname
      const prefix = prefixes.find((value) => path.startsWith(value))
      const name = prefix ? path.slice(prefix.length) || 'index.html' : ''
      if (request.method !== 'GET' || !prefix || !files.has(name)) {
        response.writeHead(404).end()
        return
      }
      try {
        const body = await readFile(new URL(name, import.meta.url))
        response
          .writeHead(200, {
            'Content-Type': files.get(name),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy':
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'",
          })
          .end(body)
      } catch {
        response.writeHead(500).end()
      }
    })().catch(() => response.writeHead(500).end())
  })
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', done)
  })
  return { server, origin: `http://127.0.0.1:${server.address().port}` }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { origin } = await startServer()
  console.log(
    prefixes.map((prefix) => `AUDIO-01: ${origin}${prefix}`).join('\n'),
  )
}
