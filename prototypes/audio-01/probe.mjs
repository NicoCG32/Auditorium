import { chromium, firefox, webkit } from '@playwright/test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { startServer, prefixes } from './serve.mjs'

const requested = process.argv[process.argv.indexOf('--browser') + 1]
if (!['chromium', 'firefox', 'webkit', 'all'].includes(requested))
  throw new Error(
    'Uso: node prototypes/audio-01/probe.mjs --browser chromium|firefox|webkit|all [--allow-unavailable]',
  )
const allowUnavailable = process.argv.includes('--allow-unavailable')
const manifest = JSON.parse(
  await readFile(new URL('./fixtures/manifest.json', import.meta.url), 'utf8'),
)
const { server, origin } = await startServer(0)
const report = {
  date: '2026-10-23',
  platform: process.platform,
  origin,
  engines: [],
  externalRequests: [],
  persistentPermissionRequests: 0,
}
let failed = false
async function forbidPersistentPermission(context) {
  await context.exposeBinding('__audio01PersistRequested', () => {
    report.persistentPermissionRequests++
  })
  await context.addInitScript(() => {
    if (navigator.storage?.persist)
      navigator.storage.persist = () =>
        window.__audio01PersistRequested().then(() => {
          throw new Error(
            'Persistent permission must not be requested in this experiment.',
          )
        })
  })
}
async function ready(page) {
  await page.waitForFunction(() =>
    document
      .querySelector('#offline-status')
      ?.textContent.startsWith('Shell del laboratorio preparado'),
  )
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
}
async function pick(page, file, mime = 'audio/wav', name) {
  const path = new URL(`./fixtures/${file}`, import.meta.url)
  const payload = {
    name: name || file,
    mimeType: mime,
    buffer: await readFile(path),
  }
  await page.locator('#file').setInputFiles(payload)
  await page.waitForFunction(
    () => document.querySelector('#status')?.dataset.state !== 'loading',
  )
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const { session } = await import('./app.mjs')
    return {
      ids: session.items.map((row) => row.id),
      active: session.activeId,
      created: session.metrics.createdUrls,
      revoked: session.metrics.revokedUrls,
      duration: session.player?.duration,
      paused: session.player?.paused,
      time: session.player?.currentTime,
      url: session.player?.src,
    }
  })
}
async function rootExperiment(page, context, engine) {
  await page.goto(origin + prefixes[0])
  await ready(page)
  engine.formats = []
  for (const item of manifest.files) {
    await page.locator('#clear').click()
    const row = { id: item.id, mime: item.mime, bytes: item.bytes }
    engine.formats.push(row)
    row.canPlayType = await page.evaluate(
      (mime) => document.createElement('audio').canPlayType(mime),
      item.mime,
    )
    const start = performance.now()
    await pick(page, item.file, item.mime)
    row.selectionMs = performance.now() - start
    row.decoded =
      (await page.locator('#status').getAttribute('data-state')) === 'ready'
    row.message = await page.locator('#status').textContent()
    if (row.decoded) {
      const before = await snapshot(page)
      row.duration = before.duration
      row.noAutoplay = before.paused && before.time === 0
      assert.equal(row.noAutoplay, true)
      await page.locator('#play').click()
      try {
        await page.waitForFunction(
          () => document.querySelector('audio')?.currentTime > 0.05,
          undefined,
          { timeout: 2500 },
        )
        row.played = true
      } catch {
        row.played = false
      }
      row.progressSeconds = (await snapshot(page)).time
      await page.locator('audio').evaluate((audio) => {
        audio.pause()
        audio.volume = 0.25
      })
      row.pausedByControl = (await snapshot(page)).paused
      row.volumeProperty = await page
        .locator('audio')
        .evaluate((audio) => audio.volume)
    }
    await page.locator('#clear').click()
    const closed = await snapshot(page)
    assert.equal(closed.created, closed.revoked)
  }
  const wav = engine.formats.find((row) => row.id === 'wav-pcm')
  engine.localPlaybackAvailable = Boolean(wav.decoded && wav.played)
  if (engine.localPlaybackAvailable) {
    await pick(page, 'tone-wav-pcm.wav')
    const baseline = await snapshot(page)
    await page.locator('#replacement').selectOption(baseline.active)
    await page.locator('#file').setInputFiles({
      name: 'false.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from('This is not audio.'),
    })
    await page.waitForFunction(
      () => document.querySelector('#status')?.dataset.state === 'error',
    )
    assert.deepEqual((await snapshot(page)).ids, baseline.ids)
    await page.locator('#file').setInputFiles({
      name: 'corrupt.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.concat([Buffer.from('RIFF0000WAVE'), Buffer.alloc(32)]),
    })
    await page.waitForFunction(
      () => document.querySelector('#status')?.dataset.state === 'error',
    )
    assert.deepEqual((await snapshot(page)).ids, baseline.ids)
    await page.locator('#file').dispatchEvent('cancel')
    assert.deepEqual((await snapshot(page)).ids, baseline.ids)
    engine.session = await page.evaluate(async () => {
      const { session } = await import('./app.mjs')
      const { MAX_FILE_BYTES } = await import('./audio.mjs')
      const old = session.activeId,
        oldUrl = session.player.src
      const file = session.items[0].file
      const results = {
        previousPreserved: true,
        largeRejected: false,
        foreignTrackRejected: false,
        lateCancelled: false,
      }
      try {
        await session.choose(
          new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'large.wav'),
          { userAlbumId: 'entry-a' },
          old,
        )
      } catch {
        results.largeRejected =
          session.activeId === old && session.player.src === oldUrl
      }
      try {
        await session.choose(
          file,
          { userAlbumId: 'entry-a', trackId: 'track-b' },
          old,
        )
      } catch {
        results.foreignTrackRejected = session.activeId === old
      }
      let release
      class SlowFile extends File {
        slice(start, end, type) {
          const blob = super.slice(start, end, type)
          if (end === 128)
            Object.defineProperty(blob, 'arrayBuffer', {
              value: () =>
                new Promise((done) => {
                  release = () => done(new ArrayBuffer(128))
                }),
            })
          return blob
        }
      }
      const pending = session.choose(
        new SlowFile([file], 'slow.wav'),
        { userAlbumId: 'entry-a' },
        old,
      )
      session.cancel()
      release()
      try {
        await pending
      } catch (error) {
        results.lateCancelled =
          error.name === 'AbortError' && session.activeId === old
      }
      results.previousPreserved =
        session.activeId === old && session.player.src === oldUrl
      return results
    })
    for (const value of Object.values(engine.session)) assert.equal(value, true)
    await page.locator('#replacement').selectOption(baseline.active)
    await pick(page, 'tone-wav-pcm.wav', 'audio/mpeg', 'renamed.mp3')
    assert.equal(
      await page.locator('#status').getAttribute('data-state'),
      'ready',
    )
    engine.session.detectedDespiteWrongExtension = true
  } else {
    engine.session = {
      notExecuted:
        'No valid local WAV player in this runtime; preservation of an already playable file is not verified here.',
    }
    engine.httpWavDiagnostic = await page.evaluate(async () => {
      const audio = document.createElement('audio')
      audio.preload = 'auto'
      document.body.append(audio)
      const result = await new Promise((resolve) => {
        const done = (value) => {
          clearTimeout(timer)
          resolve(value)
        }
        const timer = setTimeout(
          () => done({ decoded: false, reason: 'timeout' }),
          5000,
        )
        audio.addEventListener('loadeddata', () => done({ decoded: true }), {
          once: true,
        })
        audio.addEventListener(
          'error',
          () => done({ decoded: false, code: audio.error?.code }),
          { once: true },
        )
        audio.src = new URL('./fixtures/tone-wav-pcm.wav', location.href).href
        audio.load()
      })
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.remove()
      return result
    })
  }
  await page.locator('#benchmark').click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('#storage-status')
        ?.textContent.startsWith('Experimento finalizado'),
    undefined,
    { timeout: 45000 },
  )
  engine.storage = JSON.parse(
    await page.locator('#storage-results').textContent(),
  )
  for (const row of engine.storage.rows) {
    if (row.backend === 'indexeddb-bytes')
      assert.equal(row.error, undefined, 'IndexedDB binary benchmark failed')
    if (!row.error) {
      assert.equal(row.matches, true)
      assert.equal(row.quotaSimulation, 'QuotaExceededError')
      assert.equal(row.retainedAfterAbort, true)
    }
  }
  const url = (await snapshot(page)).url
  await context.setOffline(true)
  if (engine.localPlaybackAvailable) {
    await page.locator('#play').click()
    await page.waitForFunction(
      () => document.querySelector('audio')?.currentTime > 0.05,
    )
  }
  await page.reload()
  await ready(page)
  assert.equal((await snapshot(page)).ids.length, 0)
  engine.offlineReload = {
    shellReady: true,
    audioLost: true,
    oldUrlInvalid: url
      ? await page.evaluate(
          (url) =>
            fetch(url).then(
              () => false,
              () => true,
            ),
          url,
        )
      : null,
  }
  if (url) assert.equal(engine.offlineReload.oldUrlInvalid, true)
  await page.locator('#read-storage').click()
  await page.waitForFunction(() =>
    document
      .querySelector('#storage-status')
      ?.textContent.startsWith('Experimento finalizado'),
  )
  engine.retainedAfterReload = JSON.parse(
    await page.locator('#storage-results').textContent(),
  )
  for (const backend of ['indexeddb-blob', 'indexeddb-bytes', 'opfs']) {
    const final = engine.storage.rows.findLast((row) => row.backend === backend)
    if (!final.error) {
      assert.equal(engine.retainedAfterReload[backend].size, 16 * 1024 * 1024)
      assert.equal(engine.retainedAfterReload[backend].sha256, final.sha256)
    }
  }
  const other = await context.newPage()
  await other.goto(origin + prefixes[0])
  assert.equal((await snapshot(other)).ids.length, 0)
  engine.newTabHasNoAttachments = true
  await other.close()
  await page.locator('#clear-storage').click()
  await page.waitForFunction(() =>
    document
      .querySelector('#storage-results')
      ?.textContent.includes('"indexeddb": true'),
  )
  engine.cleanup = JSON.parse(
    await page.locator('#storage-results').textContent(),
  )
  if (engine.storage.rows.some((row) => row.backend === 'opfs' && !row.error))
    assert.equal(engine.cleanup.opfs, true)
  const stores = await page.evaluate(async () => ({
    databases: await indexedDB.databases(),
    local: localStorage.length,
    session: sessionStorage.length,
    caches: (
      await Promise.all(
        (await caches.keys()).map((name) =>
          caches.open(name).then((cache) => cache.keys()),
        ),
      )
    )
      .flat()
      .map((request) => new URL(request.url).pathname),
  }))
  assert.equal(stores.databases.length, 0)
  assert.equal(stores.local, 0)
  assert.equal(stores.session, 0)
  assert.equal(
    stores.caches.some((path) => /fixtures|tone-|\.wav/.test(path)),
    false,
  )
  engine.storageCleared = engine.cleanup.cleared
  await context.setOffline(false)
}
async function pagesExperiment(page, context, engine) {
  await page.goto(origin + prefixes[1])
  await ready(page)
  await context.setOffline(true)
  await pick(page, 'tone-wav-pcm.wav')
  const loaded =
    (await page.locator('#status').getAttribute('data-state')) === 'ready'
  if (loaded) {
    assert.equal((await snapshot(page)).paused, true)
    await page.locator('#play').click()
    await page.waitForFunction(
      () => document.querySelector('audio')?.currentTime > 0.05,
    )
  } else assert.equal((await snapshot(page)).ids.length, 0)
  await page.locator('#clear').click()
  const closed = await snapshot(page)
  assert.equal(closed.created, closed.revoked)
  await page.reload()
  await ready(page)
  assert.equal((await snapshot(page)).ids.length, 0)
  engine.pages = {
    offlinePlayback: loaded,
    shellReload: true,
    ownScope: await page.evaluate(
      () => navigator.serviceWorker.controller.scriptURL,
    ),
  }
  assert.equal(new URL(engine.pages.ownScope).pathname, prefixes[1] + 'sw.mjs')
}
async function restartExperiment(name, engine) {
  const root = resolve(tmpdir())
  const profile = await mkdtemp(join(root, 'auditorium-audio-01-'))
  if (
    dirname(profile) !== root ||
    !basename(profile).startsWith('auditorium-audio-01-')
  )
    throw new Error('Refusing to use an unexpected profile directory.')
  let context
  const launch = async () => {
    context = await { chromium, firefox, webkit }[name].launchPersistentContext(
      profile,
      { serviceWorkers: 'allow' },
    )
    await forbidPersistentPermission(context)
    context.on('request', (request) => {
      if (
        /^https?:/.test(request.url()) &&
        new URL(request.url()).origin !== origin
      )
        report.externalRequests.push(request.url())
    })
    const page = await context.newPage()
    return page
  }
  try {
    let page = await launch()
    await page.goto(origin + prefixes[1])
    await page
      .waitForFunction(
        () =>
          /Shell del laboratorio preparado|Shell offline no confirmado/.test(
            document.querySelector('#offline-status')?.textContent,
          ),
        undefined,
        { timeout: 5000 },
      )
      .catch(() => {})
    const workerStatus = await page.locator('#offline-status').textContent()
    const workerReady = workerStatus.startsWith(
      'Shell del laboratorio preparado',
    )
    if (workerReady) await ready(page)
    engine.restart = await page.evaluate(async () => {
      const work = async () => {
        const { writeIdb, digest } = await import('./storage.mjs')
        const bytes = new Uint8Array(16 * 1024 * 1024)
        const hashes = []
        const start = performance.now()
        try {
          for (let index = 0; index < 8; index++) {
            bytes.fill(index + 1)
            const blob = new Blob([bytes])
            hashes.push(await digest(blob))
            await writeIdb(blob, false, 'bytes', `restart-${index}`)
          }
          const audio = await (
            await fetch('./fixtures/tone-wav-pcm.wav')
          ).blob()
          await writeIdb(audio, false, 'bytes', 'restart-audio')
          return {
            totalBytes: bytes.length * 8,
            hashes,
            audioHash: await digest(audio),
            writeAndHashMs: performance.now() - start,
          }
        } catch (error) {
          return { writeError: `${error.name}: ${error.message}` }
        }
      }
      let timer
      try {
        return await Promise.race([
          work(),
          new Promise((done) => {
            timer = setTimeout(
              () =>
                done({
                  writeError:
                    'Persistent profile did not finish storage writes within 15 seconds.',
                }),
              15000,
            )
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    })
    engine.restart = { ...engine.restart, workerReady, workerStatus }
    if (engine.restart.writeError) return
    await context.close()
    context = undefined
    page = await launch()
    await context.setOffline(workerReady)
    await page.goto(origin + prefixes[1])
    if (workerReady) await ready(page)
    const restored = await page.evaluate(async () => {
      const { readIdb, digest } = await import('./storage.mjs')
      const hashes = []
      let totalBytes = 0
      for (let index = 0; index < 8; index++) {
        const blob = await readIdb('bytes', `restart-${index}`)
        totalBytes += blob.size
        hashes.push(await digest(blob))
      }
      const audio = await readIdb('bytes', 'restart-audio')
      const { session } = await import('./app.mjs')
      let prepared = false,
        error
      try {
        await session.choose(new File([audio], 'recovered.wav'), {
          userAlbumId: 'entry-a',
        })
        document.querySelector('#player').replaceChildren(session.player)
        document.querySelector('#play').disabled = false
        prepared = true
      } catch (failure) {
        error = failure.message
      }
      return {
        totalBytes,
        hashes,
        audioHash: await digest(audio),
        prepared,
        error,
      }
    })
    assert.deepEqual(restored.hashes, engine.restart.hashes)
    assert.equal(restored.totalBytes, 128 * 1024 * 1024)
    assert.equal(restored.audioHash, engine.restart.audioHash)
    assert.equal(restored.prepared, engine.localPlaybackAvailable)
    let played = false
    if (restored.prepared) {
      await page.locator('#play').click()
      await page.waitForFunction(
        () => document.querySelector('audio')?.currentTime > 0.05,
      )
      played = true
    }
    engine.restart = {
      ...engine.restart,
      closedAndReopened: true,
      hashesMatch: true,
      offlineHashesMatch: workerReady,
      audioPrepared: restored.prepared,
      audioPlayed: played,
      audioError: restored.error,
    }
    const cleared = await page.evaluate(async () => {
      const { session } = await import('./app.mjs')
      session.dispose()
      const { clearEvaluationStorage } = await import('./storage.mjs')
      return clearEvaluationStorage()
    })
    assert.equal(cleared.indexeddb, true)
  } finally {
    await context?.close()
    await rm(profile, { recursive: true, force: true })
  }
}
try {
  for (const name of requested === 'all'
    ? ['chromium', 'firefox', 'webkit']
    : [requested]) {
    const engine = { name }
    report.engines.push(engine)
    let browser
    try {
      browser = await { chromium, firefox, webkit }[name].launch()
    } catch (error) {
      engine.launchError = error.message.split('\n')[0]
      if (!allowUnavailable) failed = true
      continue
    }
    const context = await browser.newContext({ serviceWorkers: 'allow' })
    await forbidPersistentPermission(context)
    engine.version = browser.version()
    context.on('request', (request) => {
      if (
        /^https?:/.test(request.url()) &&
        new URL(request.url()).origin !== origin
      )
        report.externalRequests.push(request.url())
    })
    try {
      const page = await context.newPage()
      await rootExperiment(page, context, engine)
      const pagesContext = await browser.newContext({ serviceWorkers: 'allow' })
      await forbidPersistentPermission(pagesContext)
      try {
        const pages = await pagesContext.newPage()
        pagesContext.on('request', (request) => {
          if (
            /^https?:/.test(request.url()) &&
            new URL(request.url()).origin !== origin
          )
            report.externalRequests.push(request.url())
        })
        await pagesExperiment(pages, pagesContext, engine)
      } finally {
        await pagesContext.close()
      }
      engine.passed = true
    } catch (error) {
      engine.error = error.stack
      failed = true
    } finally {
      await context.close()
      await browser.close()
    }
    if (engine.passed) {
      try {
        await restartExperiment(name, engine)
      } catch (error) {
        engine.restartError = error.stack
        engine.passed = false
        failed = true
      }
    }
  }
  assert.equal(report.externalRequests.length, 0)
  assert.equal(report.persistentPermissionRequests, 0)
  assert.equal(
    report.engines.some((engine) => engine.restart?.offlineHashesMatch),
    true,
    'No engine verified persistent recovery offline',
  )
} catch (error) {
  report.error = error.message
  failed = true
} finally {
  await new Promise((done) => server.close(done))
}
console.log(JSON.stringify(report, null, 2))
const engines = report.engines.filter((row) => row.passed)
const formatCases = engines.reduce((sum, row) => sum + row.formats.length, 0)
const quotaRollbacks = engines.reduce(
  (sum, row) =>
    sum + row.storage.rows.filter((value) => value.retainedAfterAbort).length,
  0,
)
console.error(
  `AUDIO-01 ${failed ? 'FAIL' : 'PASS'}: engines=${engines.length} playbackEngines=${engines.filter((row) => row.localPlaybackAvailable).length} formatCases=${formatCases} paths=${engines.length * 2} quotaRollbacks=${quotaRollbacks} restartEngines=${engines.filter((row) => row.restart?.offlineHashesMatch).length} externalRequests=${report.externalRequests.length} persistRequests=${report.persistentPermissionRequests}`,
)
if (failed) process.exitCode = 1
