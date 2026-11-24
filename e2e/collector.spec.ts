import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { parseBackupText } from '../src/domain/backup'
import {
  openAlbumArea,
  openSettings,
  openOwnedDetails,
  openSettingsSection,
} from './helpers/library-navigation'

test.use({ serviceWorkers: 'block', actionTimeout: 10_000 })

async function addAlbum(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Artista', exact: true })
    .fill('Banda Ficticia')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Atlas Del Sur')
  await expect(page.getByLabel('Año original', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Atlas Del Sur', exact: true }),
  ).toBeVisible()
}

test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
  await request.post('/__test/fail-assets?value=false')
})

test('colecciona con lo mínimo y completa los detalles después sin notas o escuchas obligatorias', async ({
  page,
}, info) => {
  await addAlbum(page)
  await expect(
    page.locator('details[data-album-area="experience"]'),
  ).not.toHaveAttribute('open')
  await expect(
    page.locator('details[data-album-area="audio"]'),
  ).not.toHaveAttribute('open')
  await expect(
    page.getByText('Año sin registrar', { exact: true }),
  ).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: info.outputPath('collector-overview.png'),
    fullPage: true,
  })

  await openAlbumArea(page, 'collection')
  await page
    .getByRole('button', { name: 'Registrar ejemplar', exact: true })
    .click()
  await expect(
    page.getByLabel('Fecha de adquisición', { exact: true }),
  ).toBeHidden()
  await page
    .getByRole('combobox', { name: 'Formato del ejemplar', exact: true })
    .selectOption('vinyl')
  await page
    .getByRole('button', { name: 'Guardar ejemplar', exact: true })
    .click()
  const copies = page.getByRole('list', { name: 'Ejemplares de este álbum' })
  await expect(copies).toContainText('Vinilo')
  await copies.getByRole('button', { name: /^Editar ejemplar/ }).click()
  await openOwnedDetails(page)
  await page
    .getByLabel('Fecha de adquisición', { exact: true })
    .fill('2020-03-12')
  await page
    .getByRole('textbox', { name: 'Notas del ejemplar', exact: true })
    .fill('Primera copia de prueba')
  await page
    .getByRole('button', { name: 'Guardar cambios del ejemplar', exact: true })
    .click()
  await expect(copies).toContainText('Primera copia de prueba')

  await openAlbumArea(page, 'wishes')
  await page
    .getByRole('button', { name: 'Registrar deseo', exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Formato deseado', exact: true })
    .selectOption('cd')
  await page.getByRole('button', { name: 'Guardar deseo', exact: true }).click()
  await expect(
    page.getByRole('list', { name: 'Deseos de este álbum' }),
  ).toContainText('CD')
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
  const card = page.getByRole('list', { name: 'Álbumes de tu biblioteca' })
  await expect(card).toContainText('1 ejemplar')
  await expect(card).toContainText('En deseos')
  await expect(card).not.toContainText('Sin nota')

  await openSettings(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const download = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON sin audio' })
    .click()
  const path = await (await download).path()
  if (!path) throw new Error('Falta el respaldo de prueba')
  const snapshot = parseBackupText(await readFile(path, 'utf8')).data
  expect(snapshot.library.albumRatings).toEqual([])
  expect(snapshot.library.userAlbums[0]?.listeningStatus).toBe('untracked')
  expect(snapshot.catalog.releases).toEqual([])
  expect(snapshot.library.ownedItems[0]).toMatchObject({
    format: 'vinyl',
    acquiredAt: '2020-03-12',
    notes: 'Primera copia de prueba',
  })
  expect(snapshot.library.ownedItems[0]?.releaseId).toBeUndefined()
})

test('móvil y teclado: los detalles se despliegan sin perder el borrador y el tema claro mantiene accesibilidad', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await addAlbum(page)
  const restoreAppearance = await openSettingsSection(page, 'Personalización')
  await page.getByRole('radio', { name: 'Claro', exact: true }).check()
  await restoreAppearance()
  await openAlbumArea(page, 'collection')
  await page
    .getByRole('button', { name: 'Registrar ejemplar', exact: true })
    .click()
  const summary = page.locator('details.owned-details > summary')
  await summary.focus()
  await summary.press('Enter')
  await page
    .getByRole('textbox', { name: 'Notas del ejemplar', exact: true })
    .fill('Borrador opcional')
  await summary.click()
  await expect(
    page.getByRole('textbox', { name: 'Notas del ejemplar', exact: true }),
  ).toBeHidden()
  await summary.press('Enter')
  await expect(
    page.getByRole('textbox', { name: 'Notas del ejemplar', exact: true }),
  ).toHaveValue('Borrador opcional')
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: info.outputPath('collector-mobile-light.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Cambios sin guardar' })
  await expect(dialog).toBeVisible()
  await dialog
    .getByRole('button', { name: 'Seguir editando', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Notas del ejemplar', exact: true }),
  ).toHaveValue('Borrador opcional')
  await page
    .getByRole('button', { name: 'Guardar ejemplar', exact: true })
    .click()
  await expect(
    page.getByRole('list', { name: 'Ejemplares de este álbum' }),
  ).toContainText('Borrador opcional')
})
