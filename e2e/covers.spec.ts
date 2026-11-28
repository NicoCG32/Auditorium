import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fixtureId, ids } from '../src/domain/catalog/catalog.fixture'
import { makeBackup } from '../src/domain/backup.fixture'
import { serializeBackup, parseBackupText } from '../src/domain/backup'
import { openBackups } from './helpers/audio-fixture'
import { readStoredZip } from '../src/infrastructure/browser/stored-zip'

// Mocked external requests need page ownership in all engines. The persistent
// profile journey separately verifies a real service worker and offline restart.
test.use({ serviceWorkers: 'block', actionTimeout: 10000 })
const groupId = fixtureId(99000)
const sourceUrl = `https://coverartarchive.org/release-group/${groupId}/front-500`
async function image(page: Page) {
  return Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 600
      const context = canvas.getContext('2d')!
      context.fillStyle = '#294354'
      context.fillRect(0, 0, 1200, 600)
      context.fillStyle = '#c4b187'
      context.fillRect(200, 0, 800, 600)
      return canvas.toDataURL('image/png').split(',')[1]!
    }),
    'base64',
  )
}
async function restore(page: Page, linked = true) {
  const fixture = makeBackup()
  if (linked)
    fixture.data.catalog.albums[0]!.musicBrainz = {
      id: groupId,
      retrievedAt: fixture.exportedAt,
    }
  await openBackups(page)
  await page.locator('#backup-file').setInputFiles({
    name: 'coleccion-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(fixture)),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
  await page.getByRole('button', { name: 'Completar portadas' }).click()
  return fixture
}
async function downloadComplete(page: Page) {
  await openBackups(page)
  const event = page.waitForEvent('download')
  await page
    .getByRole('button', {
      name: 'Descargar respaldo completo (ZIP)',
      exact: true,
    })
    .click()
  const download = await event
  const path = await download.path()
  if (!path) throw new Error('Falta el respaldo completo')
  return readFile(path)
}
test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
})

test('copia optimizada, recarga y respaldo completo con portadas locales', async ({
  page,
  browser,
}, info) => {
  await page.goto('/')
  const png = await image(page)
  let requests = 0
  await page.route('https://coverartarchive.org/**', async (route) => {
    requests++
    await route.fulfill({
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: png,
    })
  })
  await restore(page)
  await expect(
    page.getByText('1 portada guardada', { exact: true }),
  ).toBeVisible()
  const cover = page.getByRole('img', { name: 'Portada de Eclipse' }).first()
  await expect(cover).toHaveAttribute('src', /^blob:/u)
  expect(
    await cover.evaluate((element: HTMLImageElement) => element.naturalWidth),
  ).toBe(500)
  const entries = await readStoredZip(await downloadComplete(page))
  const manifest: unknown = JSON.parse(
    new TextDecoder().decode(entries.get('audio-manifest.json')),
  )
  expect(manifest).toMatchObject({
    version: 3,
    covers: [{ albumId: ids.album, width: 500, height: 250, sourceUrl }],
  })
  expect(entries.get(`covers/${ids.album}.jpg`)!.length).toBeLessThanOrEqual(
    128 * 1024,
  )
  const zipped = await downloadComplete(page)
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
  const count = requests
  await page.reload()
  await expect(
    page.getByRole('img', { name: 'Portada de Eclipse' }).first(),
  ).toHaveAttribute('src', /^blob:/u)
  expect(requests).toBe(count)
  const destination = await browser.newContext({ serviceWorkers: 'block' })
  try {
    const target = await destination.newPage()
    await target.goto('/')
    await openBackups(target)
    await target.locator('#complete-audio-file').setInputFiles({
      name: 'coleccion-completa.zip',
      mimeType: 'application/zip',
      buffer: zipped,
    })
    await target
      .getByRole('button', {
        name: 'Confirmar restauración completa',
        exact: true,
      })
      .click()
    await target
      .getByRole('button', { name: 'Mi colección', exact: true })
      .click()
    await target.reload()
    const restored = target
      .getByRole('img', { name: 'Portada de Eclipse' })
      .first()
    await expect(restored).toHaveAttribute('src', /^blob:/u)
    await expect
      .poll(() =>
        restored.evaluate((element: HTMLImageElement) => element.naturalWidth),
      )
      .toBe(500)
    await target.setViewportSize({ width: 390, height: 844 })
    expect(
      await target.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    expect(
      (await new AxeBuilder({ page: target }).analyze()).violations,
    ).toEqual([])
    await target.screenshot({
      path: info.outputPath('covers-mobile.jpg'),
      fullPage: true,
    })
  } finally {
    await destination.close()
  }
})

test('Completar portadas revisa homónimos y permite confirmar sin cambiar notas ni enlaces de identidad', async ({
  page,
}) => {
  await page.goto('/')
  const png = await image(page)
  const artist = {
    id: fixtureId(99001),
    name: 'Umbral Eléctrico',
    country: 'CL',
    disambiguation: 'Primera banda',
  }
  const other = {
    ...artist,
    id: fixtureId(99002),
    disambiguation: 'Segunda banda',
  }
  await page.route(
    'https://catalog-test.example/api/musicbrainz/**',
    async (route) => {
      const url = new URL(route.request().url())
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(
          url.pathname.endsWith('/artist')
            ? { artists: [artist, other] }
            : {
                'release-group-count': 1,
                'release-group-offset': 0,
                'release-groups': [
                  {
                    id:
                      url.searchParams.get('artist') === artist.id
                        ? groupId
                        : fixtureId(99003),
                    title: 'Eclipse',
                    'primary-type': 'Album',
                    'secondary-types': [],
                    'first-release-date': '1998',
                    'artist-credit': [
                      {
                        artist:
                          url.searchParams.get('artist') === artist.id
                            ? artist
                            : other,
                      },
                    ],
                  },
                ],
              },
        ),
      })
    },
  )
  let downloads = 0
  await page.route('https://coverartarchive.org/**', async (route) => {
    downloads++
    await route.fulfill({
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: png,
    })
  })
  await restore(page, false)
  await expect(page.getByText('Revisar 1 coincidencia')).toBeVisible()
  expect(downloads).toBe(0)
  await page
    .getByRole('button', { name: /Eclipse · 1998.*Primera banda/u })
    .click()
  await expect(
    page.getByText('Portada guardada en este dispositivo.'),
  ).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'Portada de Eclipse' }).first(),
  ).toHaveAttribute('src', /^blob:/u)
  await page.getByRole('button', { name: 'Cerrar aviso de portadas' }).click()
  await page.getByRole('button', { name: 'Completar portadas' }).click()
  await expect(
    page.getByText('0 portadas guardadas', { exact: true }),
  ).toBeVisible()
  expect(downloads).toBe(1)
  const entries = await readStoredZip(await downloadComplete(page))
  const library = parseBackupText(
    new TextDecoder().decode(entries.get('library.json')),
  )
  expect(library.data.catalog.artists[0]).not.toHaveProperty('musicBrainz')
  expect(library.data.library).toEqual(makeBackup().data.library)
})

test('detener una descarga conserva el álbum y una portada ausente se puede reintentar', async ({
  page,
}) => {
  await page.goto('/')
  const png = await image(page)
  let release: (() => void) | undefined
  await page.route('https://coverartarchive.org/**', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route
      .fulfill({
        contentType: 'image/png',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: png,
      })
      .catch(() => {})
  })
  await restore(page)
  await expect.poll(() => Boolean(release)).toBe(true)
  await page.getByRole('button', { name: 'Detener búsqueda' }).click()
  await expect(
    page.getByText('Búsqueda detenida. Las portadas guardadas se conservan.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  release?.()
  await page.unroute('https://coverartarchive.org/**')
  await page.route('https://coverartarchive.org/**', (route) =>
    route.fulfill({
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  )
  await page.getByRole('button', { name: 'Completar portadas' }).click()
  await expect(
    page.getByText('1 sin portada disponible. Puedes añadirla cuando quieras.'),
  ).toBeVisible()
  await page.unroute('https://coverartarchive.org/**')
  await page.route('https://coverartarchive.org/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: png,
    }),
  )
  await page.getByRole('button', { name: 'Completar portadas' }).click()
  await expect(
    page.getByText('1 portada guardada', { exact: true }),
  ).toBeVisible()
})

test('un alta mínima inicia la búsqueda sin bloquear el álbum ni exigir año o detalles', async ({
  page,
}) => {
  await page.goto('/')
  const png = await image(page)
  const artist = { id: fixtureId(99001), name: 'Banda Ficticia' }
  await page.route(
    'https://catalog-test.example/api/musicbrainz/**',
    (route) => {
      const url = new URL(route.request().url())
      return route.fulfill({
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(
          url.pathname.endsWith('/artist')
            ? { artists: [artist] }
            : {
                'release-group-count': 1,
                'release-group-offset': 0,
                'release-groups': [
                  {
                    id: groupId,
                    title: 'Disco Ficticio',
                    'primary-type': 'Album',
                    'secondary-types': [],
                    'first-release-date': '1998',
                    'artist-credit': [{ artist }],
                  },
                ],
              },
        ),
      })
    },
  )
  let release: (() => void) | undefined
  await page.route('https://coverartarchive.org/**', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route.fulfill({
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: png,
    })
  })
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Artista', exact: true })
    .fill('Banda Ficticia')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Disco Ficticio')
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Disco Ficticio', exact: true }),
  ).toBeVisible()
  await expect.poll(() => Boolean(release)).toBe(true)
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Disco Ficticio', exact: true }),
  ).toBeVisible()
  release?.()
  await expect(
    page.getByRole('img', { name: 'Portada de Disco Ficticio' }).first(),
  ).toHaveAttribute('src', /^blob:/u)
  await expect(
    page.getByText('1 portada guardada', { exact: true }),
  ).toBeVisible()
})
