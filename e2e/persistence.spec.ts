import { openLibraryOptions } from './helpers/library-navigation'
import { chromium, expect, test, type Page } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import {
  historicalStores,
  historicalSnapshot,
  historicalRows,
  seedNativeStorage,
  inspectNativeStorage,
} from '../src/test/historical-storage.fixture'
import { makeBackup } from '../src/domain/backup.fixture'
import { parseBackupText, serializeBackup } from '../src/domain/backup'

const origin = 'http://127.0.0.1:4178'
async function seed(
  page: Page,
  version: 1 | 2 | 3,
  nativeVersion = version * 10,
) {
  await page.goto('/__test/storage')
  const snapshot = historicalSnapshot(version),
    stores = historicalStores(version)
  await page.evaluate(seedNativeStorage, {
    name: 'auditorium',
    version: nativeVersion,
    stores,
    rows: historicalRows(snapshot, stores),
  })
  return snapshot
}
async function audit(page: Page) {
  return page.evaluate(inspectNativeStorage, { name: 'auditorium' })
}
async function openLibrary(page: Page) {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
}
async function downloadBackup(page: Page, path: string) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON', exact: true })
    .click()
  await (await downloading).saveAs(path)
  return parseBackupText(await readFile(path, 'utf8'))
}

test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
  await request.post('/__test/fail-assets?value=false')
})

for (const version of [1, 2] as const) {
  test(`v${version} migra, sobrevive al reinicio del navegador offline y restaura el archivo descargado`, async ({
    browser,
  }, testInfo) => {
    // Keep Chromium's deeply nested storage paths short on Windows.
    const profile = await mkdtemp(join(tmpdir(), 'auditorium-e2e-'))
    const targetProfile = resolve(profile),
      temporaryRoot = resolve(tmpdir())
    if (
      !targetProfile.startsWith(`${temporaryRoot}${sep}`) ||
      !basename(targetProfile).startsWith('auditorium-e2e-')
    )
      throw new Error('Invalid temporary test profile')
    let context = await chromium.launchPersistentContext(profile, {
      headless: true,
      baseURL: origin,
      serviceWorkers: 'allow',
    })
    const backupPath = testInfo.outputPath('respaldo-ficticio.json')
    try {
      const page = context.pages()[0] ?? (await context.newPage())
      const source = await seed(page, version)
      const before = await audit(page)
      await openLibrary(page)
      await expect(
        page.getByText('Aplicación preparada para usar sin conexión.', {
          exact: true,
        }),
      ).toBeVisible()
      const migrated = await audit(page)
      expect(migrated.version).toBe(70)
      for (const [name, rows] of Object.entries(before.rows))
        expect(migrated.rows[name]).toEqual(rows)
      for (const store of before.stores)
        expect(migrated.stores.find(({ name }) => name === store.name)).toEqual(
          store,
        )
      expect(migrated.rows['purchaseWishes']).toEqual([])
      expect(migrated.rows['ownedItems']).toHaveLength(version === 2 ? 1 : 0)
      const backup = await downloadBackup(page, backupPath)
      expect(backup.data).toEqual(source)
      await context.close()
      // A new browser process reuses only this temporary, fictitious profile.
      context = await chromium.launchPersistentContext(profile, {
        headless: true,
        baseURL: origin,
        serviceWorkers: 'allow',
        offline: true,
      })
      const reopened = context.pages()[0] ?? (await context.newPage())
      await openLibrary(reopened)
      expect(await audit(reopened)).toEqual(migrated)
      await reopened
        .getByRole('button', { name: 'Eclipse', exact: true })
        .click()
      await expect(
        reopened.getByRole('textbox', {
          name: 'Notas personales',
          exact: true,
        }),
      ).toHaveValue(source.library.userAlbums[0]?.personalNotes ?? '')
      await expect(
        reopened.getByRole('textbox', { name: 'Nota del álbum', exact: true }),
      ).toHaveValue('9,5')
      await reopened
        .getByRole('button', { name: 'Volver a biblioteca', exact: true })
        .click()
      expect(
        (
          await downloadBackup(
            reopened,
            testInfo.outputPath('respaldo-reabierto-ficticio.json'),
          )
        ).data,
      ).toEqual(source)
      const destination = await browser.newContext({
        baseURL: origin,
        serviceWorkers: 'allow',
      })
      try {
        const target = await destination.newPage()
        await target.goto('/')
        await openLibraryOptions(target)
        await expect(
          target.getByRole('button', { name: 'Respaldos', exact: true }),
        ).toBeEnabled()
        await expect(
          target.getByText('Aplicación preparada para usar sin conexión.', {
            exact: true,
          }),
        ).toBeVisible()
        const initial = await audit(target)
        expect(initial.rows['metadata']).not.toEqual(migrated.rows['metadata'])
        await destination.setOffline(true)
        await openLibraryOptions(target)
        await target
          .getByRole('button', { name: 'Respaldos', exact: true })
          .click()
        await target.locator('#backup-file').setInputFiles(backupPath)
        await target
          .getByRole('button', { name: 'Confirmar restauración', exact: true })
          .click()
        await expect(
          target.getByRole('button', { name: 'Eclipse', exact: true }),
        ).toBeVisible()
        expect(await audit(target)).toEqual(migrated)
        await target.reload()
        await expect(
          target.getByRole('button', { name: 'Eclipse', exact: true }),
        ).toBeVisible()
        expect(await audit(target)).toEqual(migrated)
      } finally {
        await destination.close()
      }
    } finally {
      await context.close()
      await rm(targetProfile, { recursive: true, force: true })
    }
  })
}

for (const fault of ['QuotaExceededError', 'AbortError'] as const) {
  test(`fallo ${fault} durante upgrade revierte esquema y permite reintento explícito`, async ({
    page,
  }) => {
    await seed(page, 1)
    const before = await audit(page)
    await page.addInitScript((fault) => {
      const originalOpen = indexedDB.open.bind(indexedDB)
      indexedDB.open = (name, version) => {
        const request =
          version === undefined
            ? originalOpen(name)
            : originalOpen(name, version)
        if (name === 'auditorium' && version === 70)
          request.addEventListener('upgradeneeded', () => {
            const database = request.result
            const create = database.createObjectStore.bind(database)
            database.createObjectStore = (name, options) => {
              const store = create(name, options)
              if (name === 'purchaseWishes') {
                indexedDB.open = originalOpen
                throw new DOMException('Fictitious upgrade fault', fault)
              }
              return store
            }
          })
        return request
      }
    }, fault)
    await page.goto('/')
    await expect(page.getByRole('alert')).toContainText(
      fault === 'QuotaExceededError' ? 'No hay espacio' : 'no pudo completarse',
    )
    expect(await audit(page)).toEqual(before)
    await page
      .getByRole('button', { name: 'Volver a intentar', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Eclipse', exact: true }),
    ).toBeVisible()
    const after = await audit(page)
    expect(after.version).toBe(70)
    for (const [name, rows] of Object.entries(before.rows))
      expect(after.rows[name]).toEqual(rows)
  })
}

test('otra ventana bloquea la migración; cerrarla permite reintentar sin perder filas', async ({
  page,
  context,
}) => {
  await seed(page, 2)
  const before = await audit(page)
  const held = await page.evaluateHandle(
    () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('auditorium')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () =>
          reject(request.error ?? new Error('Missing fictitious connection'))
      }),
  )
  const application = await context.newPage()
  await application.goto('/')
  await expect(application.getByRole('alert')).toContainText(
    'Otra pestaña impide abrir',
  )
  const heldRows = await held.evaluate(
    (database) =>
      new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const names = Array.from(database.objectStoreNames)
        const transaction = database.transaction(names, 'readonly')
        const rows: Record<string, unknown[]> = {}
        for (const name of names) {
          const reading = transaction.objectStore(name).getAll()
          reading.onsuccess = () => {
            rows[name] = reading.result as unknown[]
          }
        }
        transaction.oncomplete = () => resolve(rows)
        transaction.onabort = () =>
          reject(
            transaction.error ?? new Error('Could not inspect held fixture'),
          )
      }),
  )
  expect(await held.evaluate((database) => database.version)).toBe(
    before.version,
  )
  expect(heldRows).toEqual(before.rows)
  await held.evaluate((database) => database.close())
  await held.dispose()
  await page.close()
  // The original upgrade request can finish after the blocker closes.
  const after = await audit(application)
  for (const [name, rows] of Object.entries(before.rows))
    expect(after.rows[name]).toEqual(rows)
  await application
    .getByRole('button', { name: 'Volver a intentar', exact: true })
    .click()
  await expect(
    application.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  expect((await audit(application)).rows).toEqual(after.rows)
})

for (const damaged of ['index', 'future', 'identity', 'rating'] as const) {
  test(`${damaged}: se informa el error sin borrar, degradar ni reparar automáticamente`, async ({
    page,
  }) => {
    await page.goto('/__test/storage')
    const stores = historicalStores(damaged === 'index' ? 2 : 3)
    const rows = historicalRows(
      historicalSnapshot(damaged === 'index' ? 2 : 3),
      stores,
    )
    if (damaged === 'index') {
      const spec = stores
        .find((table) => table.name === 'userAlbums')
        ?.indexes.find((spec) => spec.name === 'activeAlbumKey')
      if (!spec) throw new Error('Missing fictitious index')
      spec.unique = false
    }
    if (damaged === 'identity') rows['metadata'] = []
    if (damaged === 'rating')
      rows['albumRatings'] = [
        { ...makeBackup().data.library.albumRatings[0], scoreUnits: 0 },
      ]
    await page.evaluate(seedNativeStorage, {
      name: 'auditorium',
      version: damaged === 'index' ? 20 : damaged === 'future' ? 70 : 50,
      stores,
      rows,
    })
    const before = await audit(page)
    await page.goto('/')
    await expect(page.getByRole('alert')).toBeVisible()
    expect(await audit(page)).toEqual(before)
    await expect(
      page.getByRole('button', { name: /borrar|reiniciar|restablecer/i }),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Volver a intentar', exact: true })
      .click()
    await expect(page.getByRole('alert')).toBeVisible()
    expect(await audit(page)).toEqual(before)
  })
}

test('cuota al reemplazar una nota revierte la escritura y conserva el borrador', async ({
  page,
}) => {
  await seed(page, 3)
  await openLibrary(page)
  const before = await audit(page)
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'put',
    )?.value as IDBObjectStore['put']
    if (typeof original !== 'function') throw new Error('Missing native put')
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'albumRatings') {
        IDBObjectStore.prototype.put = original
        throw new DOMException('Fictitious quota', 'QuotaExceededError')
      }
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key)
    }
  })
  const input = page.getByRole('textbox', {
    name: 'Nota del álbum',
    exact: true,
  })
  await input.fill('8,5')
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'No hay espacio para guardar la nota',
  )
  await expect(input).toHaveValue('8,5')
  expect(await audit(page)).toEqual(before)
  await page.getByRole('button', { name: 'Guardar nota', exact: true }).click()
  await expect(page.getByText('Nota guardada.', { exact: true })).toBeVisible()
  const after = await audit(page)
  expect(after.rows['metadata']).toEqual(before.rows['metadata'])
  expect(after.rows['albumRatings']).not.toEqual(before.rows['albumRatings'])
  for (const [name, rows] of Object.entries(before.rows))
    if (name !== 'albumRatings') expect(after.rows[name]).toEqual(rows)
})

test('cuota al restaurar revierte también identidad y conserva confirmación para reintentar', async ({
  page,
}) => {
  await page.goto('/')
  await openLibraryOptions(page)
  await expect(
    page.getByRole('button', { name: 'Respaldos', exact: true }),
  ).toBeEnabled()
  const before = await audit(page)
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'respaldo-ficticio.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(makeBackup())),
  })
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(
      IDBObjectStore.prototype,
      'put',
    )?.value as IDBObjectStore['put']
    if (typeof original !== 'function') throw new Error('Missing native put')
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === 'purchaseWishes') {
        IDBObjectStore.prototype.put = original
        throw new DOMException('Fictitious restore quota', 'QuotaExceededError')
      }
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key)
    }
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'No hay espacio para completar la restauración',
  )
  expect(await audit(page)).toEqual(before)
  await expect(
    page.getByRole('button', { name: 'Confirmar restauración', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  const after = await audit(page)
  expect(after.rows).toEqual({
    ...historicalRows(makeBackup().data, historicalStores(3)),
    syncCheckpoint: [],
  })
  expect(after.rows['purchaseWishes']).toHaveLength(1)
})

test('denegar persistencia no bloquea biblioteca ni respaldo', async ({
  page,
  context,
}, testInfo) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: () => Promise.resolve(false),
        persist: () => Promise.resolve(false),
        estimate: () => Promise.resolve({ usage: 1024, quota: 2048 }),
      },
    })
  })
  const source = await seed(page, 3)
  await openLibrary(page)
  const before = await audit(page)
  await page.getByText('Aplicación y almacenamiento', { exact: true }).click()
  const request = page.getByRole('button', {
    name: 'Solicitar protección del almacenamiento',
    exact: true,
  })
  await request.click()
  await expect(
    page.getByText(/El navegador no concedió protección/),
  ).toBeVisible()
  expect(await audit(page)).toEqual(before)
  expect(
    (
      await downloadBackup(
        page,
        testInfo.outputPath('respaldo-denegacion-ficticio.json'),
      )
    ).data,
  ).toEqual(source)
  await page.reload()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  expect(await audit(page)).toEqual(before)
})
