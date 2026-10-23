import { openExperience } from './helpers/library-navigation'
import { openLibraryOptions } from './helpers/library-navigation'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { makeBackup } from '../src/domain/backup.fixture'
import { parseBackupText, serializeBackup } from '../src/domain/backup'

const base = '/Auditorium/'
const origin = 'http://127.0.0.1:4179'
const visualAssets = [
  'brand/wordmark-dark.svg',
  'brand/wordmark-light.svg',
  'brand/logo-stacked.webp',
  'backgrounds/sanctuary-desktop.webp',
  'backgrounds/sanctuary-mobile.webp',
  'backgrounds/parchment-desktop-light.svg',
  'backgrounds/parchment-mobile-light.svg',
  'decor/divider-simple.svg',
  'icons/favicon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
].map((path) => `${base}auditorium/${path}`)

test('rutas de navegación y borradores conservan base Pages y query después de recargar', async ({
  page,
}) => {
  await openPrepared(page)
  const fixture = await restoreFixture(page)
  const entryId = fixture.data.library.userAlbums[0]!.id
  await page.goto(`${base}index.html?contexto=prueba#/album/${entryId}/editar`)
  await expect(
    page.getByRole('textbox', { name: 'Título', exact: true }),
  ).toHaveValue('Eclipse')
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await page
    .getByRole('button', { name: 'Calificaciones', exact: true })
    .click()
  await expect(page).toHaveURL(
    /\/Auditorium\/index\.html\?contexto=prueba#\/calificaciones$/,
  )
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Calificaciones', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await page.getByRole('button', { name: 'Editar álbum', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Borrador ficticio Pages')
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
  await page
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click()
  await expect(page).toHaveURL(
    /\/Auditorium\/index\.html\?contexto=prueba#\/coleccion$/,
  )
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  expect((await exportedBackup(page)).data).toEqual(fixture.data)
})

async function openPrepared(page: Page) {
  await page.goto(base)
  await expect(
    page.getByText('Aplicación preparada para usar sin conexión.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Añadir álbum', exact: true }),
  ).toBeEnabled()
}

async function restoreFixture(page: Page) {
  const backup = makeBackup()
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'respaldo-ficticio-pages.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(backup)),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  return backup
}

async function exportedBackup(page: Page) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON', exact: true })
    .click()
  const path = await (await downloading).path()
  if (!path) throw new Error('Missing fictitious Pages backup download')
  return parseBackupText(await readFile(path, 'utf8'))
}

async function rawDatabase(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const opening = indexedDB.open('auditorium')
        opening.onerror = () =>
          reject(new Error('Could not open fictitious Pages database'))
        opening.onsuccess = () => {
          const db = opening.result
          const transaction = db.transaction(
            Array.from(db.objectStoreNames),
            'readonly',
          )
          const rows: Record<string, unknown[]> = {}
          for (const name of Array.from(db.objectStoreNames)) {
            const request = transaction.objectStore(name).getAll()
            request.onsuccess = () => {
              rows[name] = request.result as unknown[]
            }
          }
          transaction.oncomplete = () => {
            db.close()
            resolve(rows)
          }
          transaction.onerror = () => {
            db.close()
            reject(new Error('Could not read fictitious Pages database'))
          }
        }
      }),
  )
}

async function cachedUrls(page: Page) {
  return page.evaluate(async () => {
    const names = await caches.keys()
    const requests = await Promise.all(
      names.map(async (name) => (await caches.open(name)).keys()),
    )
    return requests.flat().map((request) => request.url)
  })
}

test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
  await request.post('/__test/fail-assets?value=false')
})

test('Pages sirve manifest, iconos y todos los chunks con MIME correcto y scope instalable', async ({
  page,
  context,
  request,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openPrepared(page)
  const manifestLink = page.locator('link[rel="manifest"]')
  await expect(manifestLink).toHaveAttribute(
    'href',
    `${base}manifest.webmanifest`,
  )
  const manifestResponse = await request.get(`${base}manifest.webmanifest`)
  expect(manifestResponse.headers()['content-type']).toContain(
    'application/manifest+json',
  )
  const manifest = (await manifestResponse.json()) as {
    id: string
    name: string
    display: string
    start_url: string
    scope: string
    icons: { src: string }[]
  }
  expect(manifest).toMatchObject({
    id: base,
    name: 'Auditórium',
    display: 'standalone',
    start_url: base,
    scope: base,
  })
  expect(manifest.icons).toHaveLength(3)
  for (const icon of manifest.icons) {
    expect(icon.src.startsWith(`${base}auditorium/icons/`)).toBe(true)
    const response = await request.get(icon.src)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toBe('image/png')
  }
  const resources = await cachedUrls(page)
  expect(resources.length).toBeGreaterThan(7)
  expect(resources.every((url) => url.startsWith(`${origin}${base}`))).toBe(
    true,
  )
  expect(resources.some((url) => /\/assets\/storage-.+\.js/.test(url))).toBe(
    true,
  )
  expect(
    resources
      .map((url) => new URL(url).pathname)
      .filter((path) => path.startsWith(`${base}auditorium/`))
      .sort(),
  ).toEqual([...visualAssets].sort())
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    `${base}auditorium/icons/favicon.svg`,
  )
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    `${base}auditorium/icons/apple-touch-icon.png`,
  )
  const types: Record<string, string> = {
    js: 'text/javascript',
    css: 'text/css',
    html: 'text/html',
    webmanifest: 'application/manifest+json',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
  }
  for (const resource of resources) {
    const pathname = new URL(resource).pathname
    const type = types[pathname.split('.').at(-1) ?? '']
    expect(type, pathname).toBeDefined()
    const response = await request.get(resource)
    expect(response.ok(), pathname).toBe(true)
    expect(response.headers()['content-type'], pathname).toBe(type)
  }
  const worker = await request.get(`${base}sw.js`)
  expect(worker.ok()).toBe(true)
  expect(worker.headers()['content-type']).toBe('text/javascript')
  expect(
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return {
        scope: registration?.scope,
        scriptURL: navigator.serviceWorker.controller?.scriptURL,
      }
    }),
  ).toEqual({ scope: `${origin}${base}`, scriptURL: `${origin}${base}sw.js` })
  const devtools = await context.newCDPSession(page)
  expect(
    (await devtools.send('Page.getInstallabilityErrors')).installabilityErrors,
  ).toEqual([])
  await devtools.detach()
  await context.setOffline(true)
  for (const path of visualAssets) {
    expect(
      await page.evaluate(async (url) => (await fetch(url)).ok, path),
      path,
    ).toBe(true)
  }
  expect(errors).toEqual([])
})

test('Pages restaura y permite cambios, reapertura y respaldo sin red en sus variantes de URL', async ({
  page,
  context,
}) => {
  await openPrepared(page)
  await context.setOffline(true)
  const source = await restoreFixture(page)
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByText('Detalles del álbum (opcionales)', { exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Artista', exact: true })
    .fill('Artista Ficticio Pages')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Horizonte Ficticio Pages')
  if (
    (await page
      .getByRole('radio', {
        name: 'Es otro artista con este nombre (crear uno nuevo)',
        exact: true,
      })
      .count()) === 1
  )
    await page
      .getByRole('radio', {
        name: 'Es otro artista con este nombre (crear uno nuevo)',
        exact: true,
      })
      .check()
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Horizonte Ficticio Pages',
      exact: true,
    }),
  ).toBeVisible()
  await openExperience(page)
  await page
    .getByRole('textbox', { name: 'Notas personales', exact: true })
    .fill('Notas ficticias guardadas sin conexión desde Pages.')
  await openExperience(page)
  await page
    .getByRole('combobox', { name: 'Estado de escucha', exact: true })
    .selectOption('completed')
  await openExperience(page)
  await page
    .getByRole('button', { name: 'Guardar experiencia', exact: true })
    .click()
  await expect(
    page.getByText('Experiencia guardada.', { exact: true }),
  ).toBeVisible()
  await openExperience(page)
  await page
    .getByRole('textbox', { name: 'Nota del álbum', exact: true })
    .fill('9,5')
  await openExperience(page)
  await page
    .getByRole('button', { name: 'Guardar experiencia', exact: true })
    .click()
  await expect(
    page.getByText('Experiencia guardada.', { exact: true }),
  ).toBeVisible()
  const before = await rawDatabase(page)
  expect(Object.keys(before)).toHaveLength(14)
  expect(before['syncCheckpoint']).toEqual([])
  await page.close()
  for (const path of [
    base,
    `${base}index.html`,
    `${base}?origen=prueba#contenido`,
    `${base}index.html?origen=prueba#contenido`,
  ]) {
    const reopened = await context.newPage()
    const response = await reopened.goto(path)
    expect(response?.fromServiceWorker(), path).toBe(true)
    await expect(
      reopened.getByRole('button', {
        name: 'Horizonte Ficticio Pages',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      reopened.getByText(/El navegador indica que no hay conexión/),
    ).toBeVisible()
    expect(await rawDatabase(reopened)).toEqual(before)
    const backup = await exportedBackup(reopened)
    expect(backup.data.identity).toEqual(source.data.identity)
    expect(backup.data.library.ownedItems).toEqual(
      source.data.library.ownedItems,
    )
    expect(backup.data.library.purchaseWishes).toEqual(
      source.data.library.purchaseWishes,
    )
    const added = backup.data.library.userAlbums.find(
      (entry) =>
        entry.personalNotes ===
        'Notas ficticias guardadas sin conexión desde Pages.',
    )
    expect(added?.listeningStatus).toBe('completed')
    expect(
      backup.data.library.albumRatings.find(
        (rating) => rating.userAlbumId === added?.id,
      )?.scoreUnits,
    ).toBe(19)
    await reopened.close()
  }
})

test('Pages no controla rutas ajenas ni cachea JSON arbitrario o páginas inexistentes', async ({
  page,
  context,
  request,
}) => {
  await openPrepared(page)
  for (const path of [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/sw.js',
    '/OtroProyecto/',
    `${base}no-existe`,
    `${base}datos-ficticios.json`,
  ]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
  }
  const urlsBefore = await cachedUrls(page)
  const missing = await page.evaluate(async (prefix) => {
    const response = await fetch(`${prefix}datos-ficticios.json`)
    return {
      status: response.status,
      type: response.headers.get('Content-Type'),
    }
  }, base)
  expect(missing.status).toBe(404)
  expect(missing.type).not.toBe('text/html')
  const outside = await context.newPage()
  await outside.goto('/__test/storage')
  expect(
    await outside.evaluate(() => navigator.serviceWorker.controller),
  ).toBeNull()
  expect(
    await outside.evaluate(async () =>
      Boolean(await navigator.serviceWorker.getRegistration()),
    ),
  ).toBe(false)
  await outside.close()
  await context.setOffline(true)
  for (const path of [
    '/index.html',
    `${base}datos-ficticios.json`,
    'https://example.invalid/portada-ficticia.png',
  ]) {
    expect(
      await page.evaluate(async (url) => {
        try {
          await fetch(url)
          return true
        } catch {
          return false
        }
      }, path),
      path,
    ).toBe(false)
  }
  const absent = await context.newPage()
  await expect(absent.goto(`${base}no-existe`)).rejects.toThrow()
  await absent.close()
  expect(await cachedUrls(page)).toEqual(urlsBefore)
})

test('Pages espera a las dos ventanas para actualizar y conserva las tablas y la identidad', async ({
  page,
  context,
  request,
}) => {
  await openPrepared(page)
  const source = await restoreFixture(page)
  const before = await rawDatabase(page)
  expect(Object.keys(before)).toHaveLength(14)
  expect(before['syncCheckpoint']).toEqual([])
  const other = await context.newPage()
  await openPrepared(other)
  await other.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await openExperience(other)
  const notes = other.getByRole('textbox', {
    name: 'Notas personales',
    exact: true,
  })
  await notes.fill('Borrador ficticio Pages pendiente de guardar')
  await page.evaluate(async () => {
    await (
      await caches.open('cache-ficticia-ajena')
    ).put('/unrelated', new Response('Fixture Pages'))
  })
  await request.post('/__test/version?value=b')
  await page.getByText('Aplicación y almacenamiento', { exact: true }).click()
  await page
    .getByRole('button', { name: 'Comprobar actualización', exact: true })
    .click()
  await expect(
    page.getByText('Nueva versión lista para la próxima apertura.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText(/Guarda tus cambios y cierra todas/),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-test-build', 'a')
  await page.close()
  await expect(notes).toHaveValue(
    'Borrador ficticio Pages pendiente de guardar',
  )
  await expect(other.locator('html')).toHaveAttribute('data-test-build', 'a')
  expect(
    await other.evaluate(
      async () =>
        (await navigator.serviceWorker.getRegistration())?.waiting?.state,
    ),
  ).toBe('installed')
  expect(await rawDatabase(other)).toEqual(before)
  await other.close()
  await expect
    .poll(async () => {
      const probe = await context.newPage()
      await probe.goto(base)
      const version = await probe
        .locator('html')
        .getAttribute('data-test-build')
      await probe.close()
      return version
    })
    .toBe('b')
  await context.setOffline(true)
  const updated = await context.newPage()
  const response = await updated.goto(`${base}index.html?origen=actualizacion`)
  expect(response?.fromServiceWorker()).toBe(true)
  await expect(updated.locator('html')).toHaveAttribute('data-test-build', 'b')
  await expect(
    updated.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  expect(await rawDatabase(updated)).toEqual(before)
  expect((await exportedBackup(updated)).data).toEqual(source.data)
  expect(
    await updated.evaluate(async () =>
      (await caches.open('cache-ficticia-ajena'))
        .match('/unrelated')
        .then((response) => response?.text()),
    ),
  ).toBe('Fixture Pages')
})

test('Pages mantiene la versión y los datos ante una actualización fallida y permite reintentar', async ({
  page,
  request,
}) => {
  await openPrepared(page)
  await restoreFixture(page)
  const before = await rawDatabase(page)
  await request.post('/__test/fail-assets?value=true')
  await request.post('/__test/version?value=b')
  await page.getByText('Aplicación y almacenamiento', { exact: true }).click()
  await page
    .getByRole('button', { name: 'Comprobar actualización', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'La versión actual sigue disponible',
  )
  await expect(page.locator('html')).toHaveAttribute('data-test-build', 'a')
  expect(await rawDatabase(page)).toEqual(before)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-test-build', 'a')
  await request.post('/__test/fail-assets?value=false')
  await page.getByText('Aplicación y almacenamiento', { exact: true }).click()
  await page
    .getByRole('button', { name: 'Comprobar actualización', exact: true })
    .click()
  await expect(
    page.getByText('Nueva versión lista para la próxima apertura.', {
      exact: true,
    }),
  ).toBeVisible()
  expect(await rawDatabase(page)).toEqual(before)
})
