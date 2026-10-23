import { chromium, firefox, webkit } from '@playwright/test'
import assert from 'node:assert/strict'
import { startServer } from './serve.mjs'

const live = process.argv.includes('--live')
const requested = process.argv[process.argv.indexOf('--browser') + 1]
if (
  !['chromium', 'firefox', 'webkit', 'all'].includes(requested) ||
  (!live && !process.argv.includes('--mock'))
)
  throw new Error(
    'Uso: node prototypes/media-01/probe.mjs --mock|--live --browser chromium|firefox|webkit|all',
  )
const cases = [
  ['spotify-album', 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy'],
  ['spotify-track', 'https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ'],
  [
    'spotify-playlist',
    'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
  ],
  ['youtube-video', 'https://www.youtube.com/watch?v=M7lc1UVf-VE'],
  [
    'youtube-playlist',
    'https://www.youtube.com/playlist?list=PLBCF2DAC6FFB574DE',
  ],
  ['spotify-short', 'https://spotify.link/example'],
  ['generic', 'https://example.com/music'],
]
const caseFilter = process.argv.includes('--case')
  ? process.argv[process.argv.indexOf('--case') + 1].split(',')
  : undefined
if (caseFilter?.some((name) => !cases.some(([label]) => label === name)))
  throw new Error('Caso de prueba desconocido.')
const { server, url } = await startServer(0)
const report = {
  mode: live ? 'live' : 'mock',
  origin: new URL(url).origin,
  staticPath: new URL(url).pathname,
  engines: [],
}
let failed = false
try {
  for (const name of requested === 'all'
    ? ['chromium', 'firefox', 'webkit']
    : [requested]) {
    const engine = { name, cases: [] }
    report.engines.push(engine)
    let browser
    try {
      browser = await { chromium, firefox, webkit }[name].launch({
        headless: true,
      })
    } catch (error) {
      engine.launchError = error.message.split('\n')[0]
      if (!live) failed = true
      continue
    }
    try {
      const page = await browser.newPage()
      const transport = []
      let externalRequests = 0
      const frameRequests = []
      page.on('request', async (request) => {
        if (!request.url().startsWith(new URL(url).origin)) externalRequests++
        if (
          request.resourceType() === 'document' &&
          /\/embed\//.test(request.url())
        ) {
          const headers = await request.allHeaders().catch(() => ({}))
          frameRequests.push({
            url: request.url(),
            referer: headers.referer ?? null,
          })
        }
      })
      page.on('response', async (response) => {
        if (/\/(?:oembed|embed\/)/.test(response.url())) {
          const headers = await response.allHeaders().catch(() => ({}))
          transport.push({
            url: response.url(),
            status: response.status(),
            allowOrigin: headers['access-control-allow-origin'] ?? null,
          })
        }
      })
      if (!live)
        await page.addInitScript(() => {
          window.YT = {
            Player: class {
              constructor(id, options) {
                this.id = id
                this.options = options
                queueMicrotask(() => options.events.onReady())
                if (window.mockYoutubeError)
                  queueMicrotask(() =>
                    options.events.onError({ data: window.mockYoutubeError }),
                  )
              }
              destroy() {
                document.getElementById(this.id)?.remove()
              }
              playVideo() {
                this.options.events.onStateChange({ data: 1 })
              }
            },
          }
        })
      if (!live)
        await page.route('**/*', (route) => {
          const requestUrl = route.request().url()
          if (requestUrl.startsWith(new URL(url).origin))
            return route.continue()
          if (requestUrl.includes('/oembed'))
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: { 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({
                provider_name: requestUrl.includes('spotify')
                  ? 'Spotify'
                  : 'YouTube',
                title: 'Título Ficticio Recibido',
                html: '<script>window.remoteHTML=true</script>',
              }),
            })
          return route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<html><title>Marco simulado</title></html>',
          })
        })
      for (const [label, source] of cases.filter(
        ([label]) => !caseFilter || caseFilter.includes(label),
      )) {
        await page.goto(url)
        const beforeRequests = externalRequests
        await page.locator('#album-title').fill('Borrador Manual Ficticio')
        await page.locator('#artist').fill('Artista Manual Ficticio')
        await page.locator('#source').fill(source)
        await page
          .getByRole('button', { name: 'Revisar enlace', exact: true })
          .click()
        assert.equal(
          externalRequests,
          beforeRequests,
          'La revisión local no debe contactar al proveedor.',
        )
        const record = { label, source }
        engine.cases.push(record)
        const query = page.locator('#metadata')
        record.metadataOffered = await query.isEnabled()
        if (record.metadataOffered) {
          const start = transport.length
          await query.click()
          await page.waitForFunction(
            () =>
              ['ready', 'error'].includes(
                document.getElementById('metadata-status').dataset.state,
              ),
            {},
            { timeout: 16000 },
          )
          record.metadataState = await page
            .locator('#metadata-status')
            .getAttribute('data-state')
          record.metadataMessage = await page
            .locator('#metadata-status')
            .textContent()
          record.transport = transport.slice(start)
          const result = await page.locator('#result').textContent()
          record.fields = result ? Object.keys(JSON.parse(result)) : []
          assert.equal(
            await page.locator('#album-title').inputValue(),
            'Borrador Manual Ficticio',
          )
          assert.equal(
            await page.locator('#artist').inputValue(),
            'Artista Manual Ficticio',
          )
          if (!live) {
            assert.equal(record.metadataState, 'ready')
            await page.locator('#apply').click()
            assert.equal(
              await page.locator('#album-title').inputValue(),
              'Título Ficticio Recibido',
            )
            assert.equal(
              await page.evaluate(() => window.remoteHTML),
              undefined,
            )
          }
          if (live && record.fields.includes('thumbnail')) {
            await page.locator('#cover').click()
            await page
              .waitForFunction(
                () =>
                  ['ready', 'error'].includes(
                    document.querySelector('#image img')?.dataset.state,
                  ),
                {},
                { timeout: 15000 },
              )
              .catch(() => {})
            record.thumbnailState = await page
              .locator('#image img')
              .getAttribute('data-state')
          }
        }
        record.embedOffered = await page.locator('#embed').isEnabled()
        if (record.embedOffered) {
          const frameStart = frameRequests.length
          await page.locator('#embed').click()
          await page
            .waitForFunction(
              () =>
                !['idle', 'closed', 'loading'].includes(
                  document.getElementById('player-status').dataset.state,
                ),
              {},
              { timeout: 16000 },
            )
            .catch(() => {})
          if (label.startsWith('youtube-'))
            await page
              .waitForFunction(
                () => {
                  const state =
                    document.getElementById('player-status').dataset.state
                  return (
                    state === 'ready' ||
                    state === 'api_error' ||
                    state.startsWith('error_')
                  )
                },
                {},
                { timeout: 14000 },
              )
              .catch(() => {})
          record.playerState = await page
            .locator('#player-status')
            .getAttribute('data-state')
          record.playerMessage = await page
            .locator('#player-status')
            .textContent()
          const frame = page.locator('#official-player')
          record.frameUrl = await frame.getAttribute('src')
          record.referrerPolicy = await frame.getAttribute('referrerpolicy')
          record.frameRequests = frameRequests.slice(frameStart)
          assert.equal(record.referrerPolicy, 'strict-origin-when-cross-origin')
          if (
            live &&
            label === 'youtube-video' &&
            (await page.locator('#play').isEnabled())
          ) {
            await page.locator('#play').click()
            await page.waitForTimeout(3000)
            record.afterPlay = await page
              .locator('#player-status')
              .getAttribute('data-state')
          }
          await page.locator('#close-player').click()
          assert.equal(await page.locator('iframe').count(), 0)
        }
        assert.equal(
          await page.locator('#external').getAttribute('href'),
          source,
        )
        assert.equal(await page.evaluate(() => localStorage.length), 0)
        assert.equal(await page.evaluate(() => sessionStorage.length), 0)
        const databases = await page.evaluate(async () =>
          typeof indexedDB.databases === 'function'
            ? (await indexedDB.databases()).length
            : null,
        )
        if (databases !== null) assert.equal(databases, 0)
      }
      if (!live) {
        engine.errorContracts = []
        for (const code of [2, 5, 100, 101, 150, 153]) {
          await page.goto(url)
          await page.evaluate((value) => {
            window.mockYoutubeError = value
          }, code)
          await page
            .locator('#source')
            .fill('https://www.youtube.com/watch?v=M7lc1UVf-VE')
          await page.locator('#inspect button').click()
          await page.locator('#embed').click()
          await page.waitForFunction(
            (value) =>
              document.getElementById('player-status').dataset.state ===
              `error_${value}`,
            code,
          )
          assert.match(
            await page.locator('#player-status').textContent(),
            /servicio externo/,
          )
          assert.equal(await page.locator('#external').isVisible(), true)
          await page.locator('#close-player').click()
          assert.equal(await page.locator('iframe').count(), 0)
          engine.errorContracts.push(code)
        }
        await page.route(/\/oembed\?/, async (route) => {
          await new Promise((done) => setTimeout(done, 300))
          await route
            .fulfill({
              status: 503,
              headers: { 'Access-Control-Allow-Origin': '*' },
              body: 'Unavailable',
            })
            .catch(() => {})
        })
        await page.goto(url)
        await page.locator('#album-title').fill('Manual conservado')
        await page.locator('#source').fill(cases[0][1])
        await page.locator('#inspect button').click()
        await page.locator('#metadata').click()
        await page.locator('#cancel').click()
        await page.waitForFunction(
          () =>
            document.getElementById('metadata-status').dataset.state ===
            'error',
        )
        assert.equal(
          await page.locator('#album-title').inputValue(),
          'Manual conservado',
        )
        assert.equal(await page.locator('#external').isVisible(), true)
        engine.cancellationContract = 'PASS'
      }
    } catch (error) {
      failed = true
      engine.error = error.message
    } finally {
      await browser.close()
    }
  }
} finally {
  await new Promise((done) => server.close(done))
}
console.log(JSON.stringify(report, null, 2))
if (!live && !failed)
  console.error(
    `MEDIA-01 MOCK PASS: engines=${report.engines.length} links=${report.engines.reduce((sum, engine) => sum + engine.cases.length, 0)} errors=${report.engines.reduce((sum, engine) => sum + engine.errorContracts.length, 0)} cancellations=${report.engines.filter((engine) => engine.cancellationContract === 'PASS').length}`,
  )
if (failed) process.exitCode = 1
