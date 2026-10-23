import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const prefix = '/Auditorium/prototypes/media-01/'
const files = new Map([
  ['index.html', 'text/html; charset=utf-8'],
  ['app.mjs', 'text/javascript; charset=utf-8'],
  ['media.mjs', 'text/javascript; charset=utf-8'],
])
export async function startServer(port = 4182) {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname
    const name = path === prefix ? 'index.html' : path.slice(prefix.length)
    if (
      request.method !== 'GET' ||
      !path.startsWith(prefix) ||
      !files.has(name)
    ) {
      response.writeHead(404)
      response.end('Not found')
      return
    }
    try {
      const body = await readFile(new URL(name, import.meta.url))
      response.writeHead(200, {
        'Content-Type': files.get(name),
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      response.end(body)
    } catch {
      response.writeHead(500)
      response.end('Static file unavailable')
    }
  })
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', done)
  })
  return { server, url: `http://127.0.0.1:${server.address().port}${prefix}` }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { url } = await startServer()
  console.log(`Prototipo estático: ${url}`)
}
