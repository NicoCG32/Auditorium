import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { build } from 'vite'

// Two actual production builds with distinct HTML and JS, isolated from dist/.
const root = process.cwd()
for (const version of ['a', 'b']) {
  await build({
    configFile: resolve(root, 'vite.config.ts'),
    build: { outDir: `.pwa-test-builds/${version}`, emptyOutDir: true },
    plugins: [
      {
        name: 'test-build-version',
        transform(code, id) {
          if (id.endsWith('/src/main.tsx')) {
            return `${code}\ndocument.documentElement.dataset.testBuild = '${version}'\n`
          }
        },
        transformIndexHtml(html) {
          return html.replace(
            '</head>',
            `<meta name="test-build" content="${version}" /></head>`,
          )
        },
      },
    ],
  })
}

let version = 'a'
let failAssets = false
const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}
createServer((request, response) => {
  void serve(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500)
    response.end()
  })
}).listen(4178, '127.0.0.1')

async function serve(request, response) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:4178')
  if (request.method === 'POST' && url.pathname === '/__test/fail-assets') {
    failAssets = url.searchParams.get('value') === 'true'
    response.writeHead(204).end()
    return
  }
  if (request.method === 'POST' && url.pathname === '/__test/version') {
    const selected = url.searchParams.get('value')
    if (selected !== 'a' && selected !== 'b') {
      response.writeHead(400).end()
      return
    }
    version = selected
    response.writeHead(204).end()
    return
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end()
    return
  }
  const directory = resolve(root, '.pwa-test-builds', version)
  const pathname = decodeURIComponent(url.pathname)
  if (
    failAssets &&
    version === 'b' &&
    /^\/assets\/index-.+\.js$/.test(pathname)
  ) {
    response.writeHead(503).end()
    return
  }
  const file = resolve(
    directory,
    pathname === '/' ? 'index.html' : `.${pathname}`,
  )
  if (!file.startsWith(`${directory}${sep}`)) {
    response.writeHead(403).end()
    return
  }
  try {
    if (!(await stat(file)).isFile()) {
      response.writeHead(404).end()
      return
    }
  } catch {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(file).pipe(response)
}
