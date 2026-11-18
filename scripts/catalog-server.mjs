import { createServer } from 'node:http'
import { createMusicBrainzProxy } from './musicbrainz-proxy.mjs'

const host = process.env.CATALOG_HOST ?? '127.0.0.1'
const port = Number(process.env.CATALOG_PORT ?? 4190)
const origins = (
  process.env.CATALOG_ALLOWED_ORIGINS ??
  'http://127.0.0.1:5173,http://localhost:5173'
)
  .split(',')
  .map((value) => new URL(value.trim()).origin)
const proxy = createMusicBrainzProxy({ origins })
createServer((request, response) => {
  void proxy(request, response)
}).listen(port, host, () => {
  console.log(
    `Catálogo musical disponible en http://${host}:${port}/api/musicbrainz/`,
  )
})
