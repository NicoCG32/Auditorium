import { openLibraryOptions } from './helpers/library-navigation'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { makeBackup } from '../src/domain/backup.fixture'
import { parseBackupText, serializeBackup } from '../src/domain/backup'

async function openPrepared(page: Page) {
  await page.goto('/')
  await expect(
    page.getByText('Aplicación preparada para usar sin conexión.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Añadir álbum', exact: true }),
  ).toBeEnabled()
}
async function addAlbum(page: Page, title: string) {
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Artista', exact: true })
    .fill('Artista ficticio offline')
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill(title)
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: title, exact: true }),
  ).toBeVisible()
}
async function restoreFixture(page: Page) {
  const backup = makeBackup()
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'respaldo-ficticio.json',
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
  const downloaded = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON', exact: true })
    .click()
  const path = await (await downloaded).path()
  if (!path) throw new Error('Missing fictitious backup download')
  return parseBackupText(await readFile(path, 'utf8'))
}
async function rawDatabase(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const opening = indexedDB.open('auditorium')
        opening.onerror = () =>
          reject(new Error('Could not open test database'))
        opening.onsuccess = () => {
          const db = opening.result
          const names = Array.from(db.objectStoreNames)
          const transaction = db.transaction(names, 'readonly')
          const result: Record<string, unknown[]> = {}
          for (const name of names) {
            const request = transaction.objectStore(name).getAll()
            request.onsuccess = () => {
              result[name] = request.result as unknown[]
            }
          }
          transaction.oncomplete = () => {
            db.close()
            resolve(result)
          }
          transaction.onerror = () => {
            db.close()
            reject(new Error('Could not read test database'))
          }
        }
      }),
  )
}

test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
  await request.post('/__test/fail-assets?value=false')
})

test('manifest, iconos y recursos propios disponibles tras cerrar y abrir sin red', async ({
  page,
  context,
  request,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openPrepared(page)
  const manifestResponse = await request.get('/manifest.webmanifest')
  expect(manifestResponse.headers()['content-type']).toContain(
    'application/manifest+json',
  )
  const manifest = (await manifestResponse.json()) as {
    name: string
    display: string
    start_url: string
    icons: { src: string }[]
  }
  expect(manifest).toMatchObject({
    name: 'Auditórium',
    display: 'standalone',
    start_url: '/',
  })
  expect(manifest.icons).toHaveLength(3)
  const devtools = await context.newCDPSession(page)
  const installability = await devtools.send('Page.getInstallabilityErrors')
  expect(installability.installabilityErrors).toEqual([])
  await devtools.detach()
  await context.setOffline(true)
  for (const icon of manifest.icons) {
    expect(
      await page.evaluate(async (src) => (await fetch(src)).ok, icon.src),
    ).toBe(true)
  }
  expect(
    await page.evaluate(async () => (await fetch('/manifest.webmanifest')).ok),
  ).toBe(true)
  await page.close()
  const reopened = await context.newPage()
  const response = await reopened.goto('/?origen=prueba#contenido')
  expect(response?.fromServiceWorker()).toBe(true)
  await expect(
    reopened.getByRole('heading', { name: 'Tu biblioteca', exact: true }),
  ).toBeVisible()
  await expect(
    reopened.getByText(/El navegador indica que no hay conexión/),
  ).toBeVisible()
  await openLibraryOptions(reopened)
  await reopened.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await expect(
    reopened.getByRole('heading', {
      name: 'Respaldos de tu biblioteca',
      exact: true,
    }),
  ).toBeVisible()
  await reopened.reload()
  await expect(
    reopened.getByRole('button', { name: 'Añadir álbum', exact: true }),
  ).toBeEnabled()
  expect(errors).toEqual([])
})

test('CRUD, ediciones, colección, retirada y respaldo funcionan totalmente offline', async ({
  page,
  context,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openPrepared(page)
  await context.setOffline(true)
  await addAlbum(page, 'Horizonte Ficticio Offline')
  await page
    .getByRole('button', { name: 'Horizonte Ficticio Offline', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Notas personales', exact: true })
    .fill('Notas ficticias creadas sin red.')
  await page
    .getByRole('combobox', { name: 'Estado de escucha', exact: true })
    .selectOption('completed')
  await page
    .getByRole('button', { name: 'Guardar experiencia', exact: true })
    .click()
  await expect(
    page.getByText('Escucha y notas guardadas.', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Nota del álbum', exact: true })
    .fill('9,5')
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click()
  await expect(page.getByText('Nota guardada.', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Editar lista original', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Añadir aparición', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Título nuevo 1', exact: true })
    .fill('Pista ficticia offline')
  await page.getByRole('button', { name: 'Guardar lista', exact: true }).click()
  await expect(
    page.getByText('Pista ficticia offline', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Nueva edición', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Nombre de edición', exact: true })
    .fill('CD ficticio offline')
  await page
    .getByRole('button', { name: 'Guardar edición', exact: true })
    .click()
  await expect(
    page.getByRole('combobox', { name: 'Lista que quieres consultar' }),
  ).toContainText('CD ficticio offline')
  await page
    .getByRole('button', { name: 'Registrar ejemplar', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Guardar ejemplar', exact: true })
    .click()
  await expect(
    page.getByRole('list', { name: 'Ejemplares de este álbum' }),
  ).toContainText('CD')
  await page
    .getByRole('button', { name: 'Registrar deseo', exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Formato deseado', exact: true })
    .selectOption('vinyl')
  await page.getByRole('button', { name: 'Guardar deseo', exact: true }).click()
  await expect(
    page.getByRole('list', { name: 'Deseos de este álbum' }),
  ).toContainText('Vinilo')
  await page
    .getByRole('button', { name: 'Quitar álbum de biblioteca', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirmar retirada', exact: true })
    .click()
  await openLibraryOptions(page)
  await expect(
    page.getByRole('button', { name: 'Álbumes retirados (1)', exact: true }),
  ).toBeEnabled()
  await openLibraryOptions(page)
  await page
    .getByRole('button', { name: 'Álbumes retirados (1)', exact: true })
    .click()
  await page
    .getByRole('button', {
      name: /Restaurar Horizonte Ficticio Offline, entrada/,
    })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'Horizonte Ficticio Offline',
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(
    page.getByRole('button', {
      name: 'Horizonte Ficticio Offline',
      exact: true,
    }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('button', {
      name: 'Horizonte Ficticio Offline',
      exact: true,
    }),
  ).toBeVisible()
  const backup = await exportedBackup(page)
  expect(backup.data.library.userAlbums[0]).toMatchObject({
    personalNotes: 'Notas ficticias creadas sin red.',
    listeningStatus: 'completed',
  })
  expect(backup.data.library.albumRatings[0]?.scoreUnits).toBe(19)
  expect(backup.data.library.ownedItems).toHaveLength(1)
  expect(backup.data.library.purchaseWishes).toHaveLength(1)
  expect(backup.data.catalog.tracks).toHaveLength(1)
  expect(backup.data.catalog.releases).toHaveLength(1)
  expect(errors).toEqual([])
})

test('restauración completa sin red conserva todos los datos al reabrir', async ({
  page,
  context,
}) => {
  await openPrepared(page)
  await context.setOffline(true)
  const source = await restoreFixture(page)
  const before = await rawDatabase(page)
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/index.html')
  await expect(
    reopened.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  expect(await rawDatabase(reopened)).toEqual(before)
  expect((await exportedBackup(reopened)).data).toEqual(source.data)
})

test('actualización espera a todas las ventanas y conserva identidad y todas las tablas', async ({
  page,
  context,
  request,
}) => {
  await openPrepared(page)
  const source = await restoreFixture(page)
  const before = await rawDatabase(page)
  const other = await context.newPage()
  await page.evaluate(async () => {
    await (
      await caches.open('cache-ficticia-ajena')
    ).put('/unrelated', new Response('Fixture'))
  })
  await openPrepared(other)
  await other.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await other
    .getByRole('textbox', { name: 'Notas personales', exact: true })
    .fill('Borrador ficticio pendiente de guardar')
  const oldController = await other.evaluate(
    () => navigator.serviceWorker.controller?.scriptURL,
  )
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
  expect(await page.locator('html').getAttribute('data-test-build')).toBe('a')
  await page.close()
  await expect(
    other.getByRole('textbox', { name: 'Notas personales', exact: true }),
  ).toHaveValue('Borrador ficticio pendiente de guardar')
  expect(await other.locator('html').getAttribute('data-test-build')).toBe('a')
  expect(
    await other.evaluate(() => navigator.serviceWorker.controller?.scriptURL),
  ).toBe(oldController)
  expect(
    await other.evaluate(
      async () =>
        (await navigator.serviceWorker.getRegistration())?.waiting?.state,
    ),
  ).toBe('installed')
  expect(await rawDatabase(other)).toEqual(before)
  await other.close()
  const worker = context
    .serviceWorkers()
    .find((worker) => worker.url().endsWith('/sw.js'))
  if (!worker) throw new Error('Missing service worker')
  // No old clients remain. Activation must finish before reopening offline.
  await expect
    .poll(async () => {
      const probe = await context.newPage()
      await probe.goto('/')
      const build = await probe.locator('html').getAttribute('data-test-build')
      await probe.close()
      return build
    })
    .toBe('b')
  await context.setOffline(true)
  const updated = await context.newPage()
  await updated.goto('/')
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
  ).toBe('Fixture')
})

test('descarga de actualización fallida conserva versión y datos; permite reintentar', async ({
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
  expect(await page.locator('html').getAttribute('data-test-build')).toBe('a')
  expect(await rawDatabase(page)).toEqual(before)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  expect(await page.locator('html').getAttribute('data-test-build')).toBe('a')
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

test('no cachea respuestas externas ni JSON arbitrario; preserva cachés ajenas', async ({
  page,
  context,
}) => {
  await openPrepared(page)
  const before = await page.evaluate(async () => {
    const unrelated = await caches.open('cache-ficticia-ajena')
    await unrelated.put('/unrelated', new Response('Fixture'))
    return (await caches.keys()).length
  })
  await page.evaluate(async () => {
    await fetch('/auditorium-ficticio.json')
    await fetch('/api/catalogo')
  })
  const urls = await page.evaluate(async () => {
    const names = await caches.keys()
    const requests = await Promise.all(
      names.map(async (name) => (await caches.open(name)).keys()),
    )
    return requests.flat().map((request) => request.url)
  })
  expect(
    urls.some(
      (url) =>
        url.includes('auditorium-ficticio.json') || url.includes('/api/'),
    ),
  ).toBe(false)
  expect(urls.every((url) => url.startsWith('http://127.0.0.1:4178/'))).toBe(
    true,
  )
  await context.setOffline(true)
  const external = await page.evaluate(async () => {
    try {
      await fetch('https://example.invalid/portada-ficticia.png')
      return true
    } catch {
      return false
    }
  })
  expect(external).toBe(false)
  expect(
    await page.evaluate(async () =>
      (await caches.open('cache-ficticia-ajena'))
        .match('/unrelated')
        .then((response) => response?.text()),
    ),
  ).toBe('Fixture')
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(
    before,
  )
})

test('mensajes de almacenamiento y sección offline operables a 320 px sin desborde', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await openPrepared(page)
  const summary = page.getByText('Aplicación y almacenamiento', { exact: true })
  await summary.focus()
  await summary.press('Enter')
  await expect(
    page.getByText(/Los datos permanecen en este navegador/),
  ).toBeVisible()
  const protection = page.getByRole('button', {
    name: 'Solicitar protección del almacenamiento',
  })
  if (await protection.isVisible()) {
    await protection.click()
    await expect(
      page.getByText(
        /protección frente a la limpieza automática|no concedió protección/,
      ),
    ).toBeVisible()
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)
  await page
    .locator('aside[aria-label="Aplicación y almacenamiento"]')
    .screenshot({ path: 'test-results/offline-mobile.png' })
})
