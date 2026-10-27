import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { makeBackup } from '../src/domain/backup.fixture'
import { fixtureId, ids } from '../src/domain/catalog/catalog.fixture'
import { libraryIds, times } from '../src/domain/library/library.fixture'
import { serializeBackup, parseBackupText } from '../src/domain/backup'
import { openLibraryOptions, openAlbumArea } from './helpers/library-navigation'

test.use({ serviceWorkers: 'block' })
const digitalId = fixtureId(820)
async function seed(page: Page) {
  const backup = makeBackup()
  delete backup.data.library.userAlbums[1]!.deletedAt
  backup.data.catalog.albums[0]!.genres = ['Death Metal']
  backup.data.catalog.releases.find(
    (row) => row.id === ids.original,
  )!.editionLabel = 'Aniversario'
  backup.data.catalog.releases.push({
    id: digitalId,
    albumId: ids.album,
    format: 'digital',
    editionLabel: 'Deluxe Digital',
    releaseYear: 2025,
  })
  backup.data.library.albumRatings[0]!.referenceReleaseId = digitalId
  backup.data.library.albumGenreRatings = [
    {
      userAlbumId: libraryIds.entry,
      genreKey: 'death metal',
      scoreUnits: 16,
      updatedAt: times.updated,
      referenceReleaseId: ids.original,
    },
  ]
  backup.data.library.ownedItems = [
    {
      id: fixtureId(800),
      userAlbumId: libraryIds.entry,
      medium: 'physical',
      format: 'cd',
      releaseId: ids.original,
      notes: 'Copia de escucha',
      createdAt: times.updated,
    },
    {
      id: fixtureId(801),
      userAlbumId: libraryIds.entry,
      medium: 'physical',
      format: 'cd',
      releaseId: ids.original,
      notes: 'Segunda copia',
      createdAt: times.updated,
    },
    {
      id: fixtureId(802),
      userAlbumId: libraryIds.entry,
      medium: 'physical',
      format: 'vinyl',
      releaseId: ids.deluxe,
      notes: 'Vinilo ficticio',
      createdAt: times.updated,
    },
    {
      id: fixtureId(803),
      userAlbumId: libraryIds.entry,
      medium: 'purchased_digital',
      format: 'digital_download',
      releaseId: digitalId,
      notes: 'Compra digital ficticia',
      createdAt: times.updated,
    },
  ]
  await page.goto('/')
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'coleccion-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(backup)),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Mi colección', exact: true }),
  ).toBeEnabled()
  return backup
}
async function exportBackup(page: Page) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const download = page.waitForEvent('download')
  await page
    .getByRole('button', {
      name: 'Descargar respaldo JSON sin audio',
      exact: true,
    })
    .click()
  const path = await (await download).path()
  if (!path) throw Error('No fictional export')
  return parseBackupText(await readFile(path, 'utf8'))
}
async function collection(page: Page) {
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
}
const copies = (page: Page) =>
  page.getByRole('list', { name: 'Ejemplares de este álbum' })

test('colección conjunta filtra copias y conserva búsqueda, formato, selector y foco al volver', async ({
  page,
}) => {
  await page.goto('/')
  await collection(page)
  await expect(
    page.getByText('Tu colección empieza con una adquisición', { exact: true }),
  ).toBeVisible()
  await page.locator('details.collection-register > summary').click()
  await page
    .getByRole('button', {
      name: 'Añadir un álbum a la biblioteca',
      exact: true,
    })
    .click()
  await expect(page).toHaveURL(/#\/anadir$/)
  await seed(page)
  await collection(page)
  const list = page.getByRole('list', { name: 'Adquisiciones registradas' })
  await expect(list.getByRole('listitem')).toHaveCount(4)
  await expect(page.locator('.collection-counts')).toContainText(
    'Ejemplares físicos3',
  )
  await expect(page.locator('.collection-counts')).toContainText(
    'Digital adquirido1',
  )
  await page
    .getByLabel('Buscar en mi colección', { exact: true })
    .fill('Umbral electrico aniversario')
  await page
    .getByRole('combobox', { name: 'Medio de la colección', exact: true })
    .selectOption('physical')
  await page
    .getByRole('combobox', { name: 'Formato de la colección', exact: true })
    .selectOption('cd')
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list).toContainText('CD · Copia 1')
  await expect(list).toContainText('CD · Copia 2')
  await expect(list).not.toContainText(fixtureId(800).slice(-8))
  const link = list
    .getByRole('button', { name: 'Ver álbum Eclipse', exact: true })
    .first()
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.locator('details[data-album-area="collection"] > summary'),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Volver a mi colección', exact: true })
    .click()
  await expect(
    page.getByLabel('Buscar en mi colección', { exact: true }),
  ).toHaveValue('Umbral electrico aniversario')
  await expect(
    page.getByRole('combobox', {
      name: 'Formato de la colección',
      exact: true,
    }),
  ).toHaveValue('cd')
  await expect(
    list
      .getByRole('button', { name: 'Ver álbum Eclipse', exact: true })
      .first(),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Limpiar filtros de colección', exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Medio de la colección', exact: true })
    .selectOption('purchased_digital')
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list).toContainText('Deluxe Digital')
  await expect(
    page
      .getByRole('combobox', { name: 'Formato de la colección', exact: true })
      .getByRole('option'),
  ).toHaveCount(2)
  await page.locator('details.collection-register > summary').click()
  await page
    .getByLabel('Buscar álbum para registrar una adquisición', { exact: true })
    .fill('Otra')
  await page
    .getByRole('button', {
      name: 'Abrir colección de Otra órbita',
      exact: true,
    })
    .click()
  await expect(
    page.getByText('No has registrado ejemplares de este álbum.', {
      exact: true,
    }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Volver a mi colección', exact: true })
    .click()
  await expect(
    page.getByLabel('Buscar álbum para registrar una adquisición', {
      exact: true,
    }),
  ).toHaveValue('Otra')
  await expect(
    page.getByRole('button', {
      name: 'Abrir colección de Otra órbita',
      exact: true,
    }),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Consultar deseos de compra', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Deseos de compra', exact: true }),
  ).toBeVisible()
})

test('editar offline y retirar una compra conserva álbum, edición compartida, notas, deseos y respaldo', async ({
  page,
  context,
}) => {
  const before = await seed(page)
  await collection(page)
  await page
    .getByRole('list', { name: 'Adquisiciones registradas' })
    .getByRole('button', { name: 'Ver álbum Eclipse', exact: true })
    .first()
    .click()
  const first = copies(page)
    .getByRole('listitem')
    .filter({ hasText: 'Copia de escucha' })
  await first.getByRole('button', { name: /^Editar ejemplar/ }).click()
  await page
    .getByRole('textbox', { name: 'Notas del ejemplar', exact: true })
    .fill('Borrador para descartar')
  await page
    .getByRole('button', { name: 'Cancelar edición del ejemplar', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click()
  await first.getByRole('button', { name: /^Editar ejemplar/ }).click()
  await page
    .getByRole('combobox', { name: 'Formato del ejemplar', exact: true })
    .selectOption('vinyl')
  await expect(
    page.getByRole('combobox', { name: 'Edición del ejemplar', exact: true }),
  ).toHaveValue('')
  await page
    .getByRole('combobox', { name: 'Edición del ejemplar', exact: true })
    .selectOption(ids.deluxe)
  await page
    .getByLabel('Fecha de adquisición', { exact: true })
    .fill('2000-02-29')
  await page
    .getByRole('combobox', { name: 'Estado del soporte', exact: true })
    .selectOption('good')
  await page
    .getByRole('textbox', { name: 'Notas del ejemplar', exact: true })
    .fill('  Corregida.\nSin cambiar la edición.  ')
  await context.setOffline(true)
  await page
    .getByRole('button', { name: 'Guardar cambios del ejemplar', exact: true })
    .click()
  await expect(
    page.getByText('Adquisición actualizada.', { exact: true }),
  ).toBeVisible()
  await context.setOffline(false)
  await page.reload()
  const digital = copies(page)
    .getByRole('listitem')
    .filter({ hasText: 'Compra digital ficticia' })
  await digital.getByRole('button', { name: /^Eliminar ejemplar/ }).click()
  await expect(
    page.getByRole('button', { name: 'Conservar ejemplar', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await digital.getByRole('button', { name: /^Eliminar ejemplar/ }).click()
  await page
    .getByRole('button', { name: 'Confirmar eliminación', exact: true })
    .click()
  await expect(copies(page).getByRole('listitem')).toHaveCount(3)
  const after = await exportBackup(page)
  expect(after.data.catalog).toEqual(before.data.catalog)
  expect({
    ...after.data.library,
    ownedItems: before.data.library.ownedItems,
  }).toEqual(before.data.library)
  expect(
    after.data.library.ownedItems.find((row) => row.id === fixtureId(800)),
  ).toMatchObject({
    id: fixtureId(800),
    createdAt: times.updated,
    format: 'vinyl',
    releaseId: ids.deluxe,
    acquiredAt: '2000-02-29',
    notes: '  Corregida.\nSin cambiar la edición.  ',
  })
  expect(
    after.data.library.ownedItems.find((row) => row.id === fixtureId(801)),
  ).toEqual(before.data.library.ownedItems[1])
})

test('conflictos no sobrescriben copias; colección y edición son accesibles en ambos temas a320px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 950 })
  await seed(page)
  await collection(page)
  for (const theme of ['dark', 'light']) {
    const appearance = page.locator('details.appearance-panel')
    await appearance.locator('summary').click()
    await appearance
      .getByRole('radio', {
        name: theme === 'dark' ? 'Oscuro' : 'Claro',
        exact: true,
      })
      .check()
    await appearance.locator('summary').click()
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: info.outputPath(`coleccion-${theme}-320.png`),
      fullPage: true,
    })
  }
  await page
    .getByRole('list', { name: 'Adquisiciones registradas' })
    .getByRole('button', { name: 'Ver álbum Eclipse', exact: true })
    .first()
    .click()
  await copies(page)
    .getByRole('listitem')
    .filter({ hasText: 'Copia de escucha' })
    .getByRole('button', { name: /^Editar ejemplar/ })
    .click()
  await page
    .getByRole('textbox', { name: 'Notas del ejemplar', exact: true })
    .fill('Borrador conservado')
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('auditorium')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(request.error ?? new Error('Fictitious database open failed'))
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('ownedItems', 'readwrite'),
        store = tx.objectStore('ownedItems'),
        request = store.get(id)
      request.onsuccess = () =>
        store.put({ ...request.result, notes: 'Cambio de otra ventana' })
      tx.oncomplete = () => resolve()
      tx.onerror = () =>
        reject(tx.error ?? new Error('Fictitious transaction failed'))
    })
    db.close()
  }, fixtureId(800))
  await page
    .getByRole('button', { name: 'Guardar cambios del ejemplar', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('Tu borrador se conserva')
  await expect(
    page.getByRole('textbox', { name: 'Notas del ejemplar', exact: true }),
  ).toHaveValue('Borrador conservado')
  await page
    .getByRole('button', { name: 'Cargar colección guardada', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Notas del ejemplar', exact: true }),
  ).toHaveValue('Cambio de otra ventana')
  await expect(
    page.getByRole('combobox', { name: 'Medio del ejemplar', exact: true }),
  ).toBeFocused()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)
  await openAlbumArea(page, 'collection')
})
