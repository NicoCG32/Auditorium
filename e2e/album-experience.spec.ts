import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { makeBackup } from '../src/domain/backup.fixture'
import { parseBackupText, serializeBackup } from '../src/domain/backup'
import { fixtureId, ids } from '../src/domain/catalog/catalog.fixture'
import {
  openAlbumArea,
  openExperience,
  openLibraryOptions,
} from './helpers/library-navigation'

test.use({ serviceWorkers: 'block' })
async function seed(page: Page, genreRating = false) {
  const backup = makeBackup()
  if (genreRating) {
    backup.data.catalog.albums.find((row) => row.id === ids.album)!.genres = [
      'Death Metal',
      'Power Metal',
    ]
    backup.data.library.albumGenreRatings.push({
      userAlbumId: backup.data.library.userAlbums[0]!.id,
      genreKey: 'death metal',
      scoreUnits: 2,
      updatedAt: backup.data.library.albumRatings[0]!.updatedAt,
      referenceReleaseId: ids.deluxe,
    })
  }
  backup.data.catalog.releases.push(
    {
      id: fixtureId(85000),
      albumId: ids.album,
      format: 'digital',
      editionLabel: 'Aniversario',
      releaseYear: 2026,
    },
    {
      id: fixtureId(85001),
      albumId: ids.otherAlbum,
      format: 'digital',
      editionLabel: 'Ajena',
    },
  )
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Añadir álbum', exact: true }),
  ).toBeEnabled()
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'experiencia-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(backup)),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  return backup
}
async function saved(page: Page) {
  await page
    .getByRole('button', { name: 'Guardar experiencia', exact: true })
    .click()
  await expect(
    page.getByText('Experiencia guardada.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Guardar experiencia', exact: true }),
  ).toHaveCount(0)
}
async function backup(page: Page) {
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
  if (!path) throw new Error('Falta el respaldo ficticio')
  return parseBackupText(await readFile(path, 'utf8'))
}

test('ficha y Calificaciones mantienen una nota y una referencia opcional entre tres ediciones', async ({
  page,
}, info) => {
  const before = await seed(page)
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  for (const area of ['data', 'tracks', 'collection', 'actions'])
    await expect(
      page.locator(`[data-album-area="${area}"]`),
    ).not.toHaveAttribute('open')
  await expect(
    page.getByRole('textbox', { name: 'Nota del álbum' }),
  ).toHaveCount(0)
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true)
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    await page.screenshot({
      path: info.outputPath(`ficha-${width}.png`),
      fullPage: true,
    })
  }
  await page
    .getByRole('button', { name: 'Calificaciones', exact: true })
    .click()
  await page.getByRole('button', { name: 'Calificados', exact: true }).click()
  await page
    .getByRole('searchbox', { name: 'Buscar calificaciones' })
    .fill('eclipse')
  await expect(
    page.getByRole('button', { name: 'Recalificar Eclipse', exact: true }),
  ).toHaveCount(1)
  await page
    .getByRole('button', { name: 'Recalificar Eclipse', exact: true })
    .click()
  const reference = page.getByRole('combobox', {
    name: 'Edición de referencia',
    exact: true,
  })
  await expect(reference.locator('option')).toHaveCount(4)
  await expect(reference).not.toContainText('Ajena')
  await expect(reference).toHaveValue('')
  await reference.selectOption(fixtureId(85000))
  await page
    .getByRole('textbox', { name: 'Notas personales', exact: true })
    .fill('Comentario sobre la edición digital no adquirida.')
  await saved(page)
  await expect(page.locator('.experience-summary')).toContainText(
    'Aniversario · Digital · 2026',
  )
  await openExperience(page)
  await page
    .getByRole('textbox', { name: 'Nota del álbum', exact: true })
    .fill('8,5')
  await expect(reference).toHaveValue(fixtureId(85000))
  await saved(page)
  await openExperience(page)
  await reference.selectOption(ids.deluxe)
  await expect(
    page.getByRole('textbox', { name: 'Nota del álbum', exact: true }),
  ).toHaveValue('8,5')
  await saved(page)
  await page
    .getByRole('button', { name: 'Volver a calificaciones', exact: true })
    .click()
  await expect(
    page.getByRole('searchbox', { name: 'Buscar calificaciones' }),
  ).toHaveValue('eclipse')
  await expect(
    page.getByRole('button', { name: 'Recalificar Eclipse', exact: true }),
  ).toHaveCount(1)
  await page
    .getByRole('button', { name: 'Recalificar Eclipse', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Quitar nota del borrador', exact: true })
    .click()
  await saved(page)
  const after = await backup(page)
  expect(after.schemaVersion).toBe(7)
  expect(after.data.catalog).toEqual(before.data.catalog)
  expect(
    after.data.library.albumRatings.filter(
      (r) => r.userAlbumId === before.data.library.userAlbums[0]!.id,
    ),
  ).toEqual([])
  expect(after.data.library.ownedItems).toEqual(before.data.library.ownedItems)
  expect(after.data.library.trackRatings).toEqual(
    before.data.library.trackRatings,
  )
  expect(after.data.library.userAlbums[0]!.personalNotes).toBe(
    'Comentario sobre la edición digital no adquirida.',
  )
})

test('modelo de notas por género restaura7, conserva la general y protege etiquetas referenciadas', async ({
  page,
}) => {
  const before = await seed(page, true)
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await expect(page.locator('.experience-summary')).toContainText('9,5 / 10')
  await openExperience(page)
  await page
    .getByRole('button', { name: 'Quitar nota del borrador', exact: true })
    .click()
  await saved(page)
  const withoutGeneral = await backup(page)
  expect(withoutGeneral.data.library.albumGenreRatings).toEqual(
    before.data.library.albumGenreRatings,
  )
  expect(withoutGeneral.data.library.albumRatings).toEqual(
    before.data.library.albumRatings.filter(
      (r) => r.userAlbumId !== before.data.library.userAlbums[0]!.id,
    ),
  )
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await openAlbumArea(page, 'actions')
  await page.getByRole('button', { name: 'Editar álbum', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Géneros (separados por comas)' })
    .fill('Power Metal')
  await page
    .getByRole('button', { name: 'Guardar cambios del álbum', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Hay valoraciones por género vinculadas',
  )
  await page
    .getByRole('button', { name: 'Cancelar edición', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click()
  const after = await backup(page)
  expect(after.data.catalog).toEqual(before.data.catalog)
  expect(after.data.library.albumGenreRatings).toEqual(
    before.data.library.albumGenreRatings,
  )
})

test('el borrador se cancela explícitamente y una edición referenciada exige resolver el vínculo', async ({
  page,
}) => {
  await seed(page)
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await openExperience(page)
  await page
    .getByRole('combobox', { name: 'Edición de referencia', exact: true })
    .selectOption(fixtureId(85000))
  await page
    .getByRole('button', { name: 'Cancelar experiencia', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Seguir editando', exact: true })
    .click()
  await expect(
    page.getByRole('combobox', { name: 'Edición de referencia', exact: true }),
  ).toHaveValue(fixtureId(85000))
  await saved(page)
  await openAlbumArea(page, 'tracks')
  await page
    .getByRole('combobox', { name: 'Lista que quieres consultar' })
    .selectOption(fixtureId(85000))
  await page
    .getByRole('button', { name: 'Eliminar edición', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirmar eliminar edición', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Cambia o quita la edición de referencia',
  )
  await page
    .getByRole('button', { name: 'Conservar edición', exact: true })
    .click()
  await openExperience(page)
  await page
    .getByRole('combobox', { name: 'Edición de referencia', exact: true })
    .selectOption('')
  await saved(page)
  await openAlbumArea(page, 'tracks')
  await page
    .getByRole('combobox', { name: 'Lista que quieres consultar' })
    .selectOption(fixtureId(85000))
  await page
    .getByRole('button', { name: 'Eliminar edición', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirmar eliminar edición', exact: true })
    .click()
  await expect(
    page.getByText('Edición eliminada.', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.experience-summary')).toContainText('9,5 / 10')
})
