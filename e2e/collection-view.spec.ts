import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { makeBackup } from '../src/domain/backup.fixture'
import { fixtureId, ids } from '../src/domain/catalog/catalog.fixture'
import { libraryIds, times } from '../src/domain/library/library.fixture'
import { parseBackupText, serializeBackup } from '../src/domain/backup'
import { openSettings } from './helpers/library-navigation'

test.use({ serviceWorkers: 'block' })
async function seed(page: Page) {
  const backup = makeBackup()
  delete backup.data.library.userAlbums[1]!.deletedAt
  backup.data.library.ownedItems.push({
    id: fixtureId(9300),
    userAlbumId: libraryIds.otherEntry,
    medium: 'purchased_digital',
    format: 'digital_download',
    createdAt: times.updated,
  })
  backup.data.catalog.albums.push({
    id: fixtureId(9301),
    title: 'Sin ejemplares',
    primaryType: 'full_length',
    catalogScope: 'personal',
    categories: [],
    publicationStatus: 'unknown',
  })
  backup.data.catalog.albumArtists.push({
    albumId: fixtureId(9301),
    artistId: ids.artist,
    role: 'primary',
    position: 1,
  })
  backup.data.library.userAlbums.push({
    id: fixtureId(9302),
    albumId: fixtureId(9301),
    userId: libraryIds.user,
    listeningStatus: 'untracked',
    addedAt: times.added,
    updatedAt: times.added,
  })
  if (test.info().project.name === 'chromium') {
    await mkdir('.vitest', { recursive: true })
    await writeFile('.vitest/collection-demo.json', serializeBackup(backup))
  }
  await page.goto('/')
  await openSettings(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'colección-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(backup)),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Mi colección', exact: true }),
  ).toBeVisible()
  return backup
}
const albums = (page: Page) =>
  page.getByRole('list', { name: 'Álbumes de tu biblioteca' })

test('una colección filtra físico y digital, conserva el contexto y no confunde catálogo con compras', async ({
  page,
}) => {
  await seed(page)
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('button'),
  ).toHaveCount(5)
  await expect(albums(page).getByRole('heading')).toHaveCount(3)
  await page.getByRole('button', { name: /^Físico 1$/ }).click()
  await expect(albums(page).getByRole('heading')).toHaveText(['Eclipse'])
  await page
    .getByRole('button', { name: 'Abrir ficha de Eclipse', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: /^Físico 1$/ }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /^Digital 1$/ }).click()
  await expect(albums(page).getByRole('heading')).toHaveText(['Otra órbita'])
  await page
    .getByRole('searchbox', { name: 'Buscar en tu biblioteca' })
    .fill('Eclipse')
  await expect(
    page.getByRole('heading', { name: 'No encontramos coincidencias' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Mostrar todos los álbumes' }).click()
  await expect(albums(page).getByRole('heading')).toHaveCount(3)
  await expect(page.getByRole('button', { name: /^Todos 3$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('nombre, portadas, vista y orden persisten sin cambiar la biblioteca', async ({
  page,
}) => {
  const before = await seed(page)
  await openSettings(page)
  await page
    .getByRole('textbox', { name: 'Nombre de tu colección' })
    .fill('Los discos de casa')
  await page
    .getByRole('combobox', { name: 'Tamaño de las portadas', exact: true })
    .selectOption('small')
  await page
    .getByRole('combobox', { name: 'Vista', exact: true })
    .selectOption('list')
  await page
    .getByRole('checkbox', { name: 'Mostrar géneros, país y valoraciones' })
    .check()
  await page
    .getByRole('textbox', { name: 'Nombre de tu colección' })
    .press('Escape')
  await expect(
    page.getByRole('button', { name: 'Ajustes', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('combobox', { name: 'Ordenar por' })
    .selectOption('title')
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Los discos de casa' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Lista', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue(
    'title',
  )
  await expect(page.locator('.collection-gallery')).toHaveAttribute(
    'data-covers',
    'small',
  )
  await expect(albums(page).getByText('9,5', { exact: true })).toBeVisible()
  await openSettings(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('button', {
      name: 'Descargar respaldo JSON sin audio',
      exact: true,
    })
    .click()
  const path = await (await downloading).path()
  if (!path) throw Error('Falta el respaldo de prueba')
  expect(parseBackupText(await readFile(path, 'utf8')).data).toEqual(
    before.data,
  )
})

for (const theme of ['dark', 'light'] as const) {
  test(`colección en ${theme}: portadas, ajustes secundarios, teclado y móvil`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await seed(page)
    await expect(albums(page).getByText('9,5', { exact: true })).toHaveCount(0)
    await openSettings(page)
    await page
      .getByRole('radio', {
        name: theme === 'dark' ? 'Oscuro' : 'Claro',
        exact: true,
      })
      .check()
    await page
      .getByRole('textbox', { name: 'Nombre de tu colección' })
      .press('Escape')
    if (test.info().project.name === 'chromium' && theme === 'dark')
      await page.screenshot({
        path: '.vitest/navigation-escritorio.png',
        fullPage: false,
      })
    await page.setViewportSize({ width: 320, height: 760 })
    await expect(page.getByRole('button', { name: /^Físico 1$/ })).toBeVisible()
    await expect(
      page.getByRole('button', { name: /^Digital 1$/ }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    if (test.info().project.name === 'chromium' && theme === 'light')
      await page.screenshot({
        path: '.vitest/navigation-movil.png',
        fullPage: false,
      })
  })
}
