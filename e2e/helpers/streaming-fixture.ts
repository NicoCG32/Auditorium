import { expect, type Page } from '@playwright/test'
import { makeBackup } from '../../src/domain/backup.fixture'
import { serializeBackup, parseBackupText } from '../../src/domain/backup'
import { fixtureId } from '../../src/domain/catalog/catalog.fixture'
import { readFile } from 'node:fs/promises'
import { openLibraryOptions } from './library-navigation'

export const spotify = `https://open.spotify.com/album/${'a'.repeat(22)}`
export const youtube = 'https://www.youtube.com/watch?v=ficticio_01'
export const list = 'https://www.youtube.com/playlist?list=PLficticia12345'
export const generic = 'https://service.example/music'
export function playbackFixture() {
  const fixture = makeBackup(),
    entry = fixture.data.library.userAlbums[0]!
  entry.links = [
    { url: spotify, purpose: 'playback' as const, label: 'Álbum en Spotify' },
    { url: youtube, purpose: 'playback' as const, label: 'Vídeo en YouTube' },
    { url: generic, purpose: 'playback' as const, label: 'Servicio externo' },
    { url: spotify, purpose: 'purchase' as const, label: 'Compra elegida' },
    { url: list, purpose: 'playback' as const, label: 'Lista en YouTube' },
    {
      url: `https://open.spotify.com/track/${'b'.repeat(22)}`,
      purpose: 'playback' as const,
      label: 'Pista en Spotify',
    },
    {
      url: `https://open.spotify.com/playlist/${'c'.repeat(22)}`,
      purpose: 'playback' as const,
      label: 'Lista en Spotify',
    },
  ].map((link, index) => ({
    ...link,
    id: fixtureId(900 + index),
    createdAt: entry.addedAt,
    updatedAt: entry.updatedAt,
  }))
  entry.preferredPlaybackLinkId = entry.links[0]!.id
  return fixture
}
export async function restorePlayback(page: Page, base = '/') {
  const fixture = playbackFixture()
  await page.goto(base)
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'reproduccion-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(fixture)),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  return fixture
}
export async function playbackBackup(page: Page) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('button', {
      name: 'Descargar respaldo JSON sin audio',
      exact: true,
    })
    .click()
  const path = await (await downloading).path()
  if (!path) throw new Error('Missing fictitious backup')
  return parseBackupText(await readFile(path, 'utf8'))
}

export const youtubeScript = `(() => {
  window.__ytSessions = window.__ytSessions || [];
  window.YT = { Player: class {
    constructor(frame, options) {
      this.session = { events: options.events, destroyed: false };
      window.__ytSessions.push(this.session);
      queueMicrotask(() => options.events.onReady());
    }
    destroy() { this.session.destroyed = true; }
    playVideo() { window.__ytPlayCalls = (window.__ytPlayCalls || 0) + 1; }
  } };
  window.onYouTubeIframeAPIReady?.();
})()`
export type MockYouTubeHost = Window & {
  __ytPlayCalls?: number
  __ytSessions?: {
    destroyed: boolean
    events: {
      onReady: () => void
      onError: (event: { data: number }) => void
      onStateChange: (event: { data: number }) => void
      onAutoplayBlocked: () => void
    }
  }[]
}

export async function mockStreaming(page: Page) {
  const requests: string[] = [],
    referrers: string[] = []
  let slow = false,
    release: (() => void) | undefined,
    failScript = false
  await page.route('https://open.spotify.com/**', async (route) => {
    requests.push(route.request().url())
    if (route.request().url().includes('/oembed')) {
      if (slow)
        await new Promise<void>((done) => {
          release = done
        })
      await route
        .fulfill({
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            provider_name: 'Spotify',
            title: 'Referencia Ficticia De Spotify',
            thumbnail_url: 'https://i.scdn.co/image/ficticia',
            html: '<script>never()</script>',
          }),
        })
        .catch(() => {})
    } else {
      referrers.push((await route.request().allHeaders())['referer'] ?? '')
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Reproductor ficticio</title><p>Spotify simulado</p>',
      })
    }
  })
  await page.route('https://i.scdn.co/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#63313d"/></svg>',
    }),
  )
  await page.route('https://www.youtube.com/**', async (route) => {
    requests.push(route.request().url())
    if (route.request().url().includes('/iframe_api')) {
      if (failScript) {
        failScript = false
        await route.abort('failed')
        return
      }
      await route.fulfill({
        contentType: 'application/javascript',
        body: youtubeScript,
      })
    } else {
      referrers.push((await route.request().allHeaders())['referer'] ?? '')
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Vídeo ficticio</title><p>YouTube simulado</p>',
      })
    }
  })
  return {
    requests,
    referrers,
    delay: () => {
      slow = true
    },
    release: () => release?.(),
    hasPending: () => Boolean(release),
    failScript: () => {
      failScript = true
    },
  }
}
