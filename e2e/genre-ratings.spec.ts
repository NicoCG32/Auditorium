import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { makeBackup } from '../src/domain/backup.fixture'
import { ids } from '../src/domain/catalog/catalog.fixture'
import { libraryIds, times } from '../src/domain/library/library.fixture'
import { parseBackupText, serializeBackup } from '../src/domain/backup'
import {
  openLibraryOptions,
  openLibraryFilters,
  openExperience,
  openAlbumArea,
} from './helpers/library-navigation'
test.use({ serviceWorkers: 'block' })
const longGenre = 'Metal ' + 'Extremo '.repeat(8).trim()
async function seed(page: Page, notes = false, long = false) {
  const backup = makeBackup()
  delete backup.data.library.userAlbums[1]!.deletedAt
  backup.data.catalog.albums.forEach((row) => {
    row.genres = ['Death Metal', 'Power Metal', ...(long ? [longGenre] : [])]
  })
  if (notes)
    backup.data.library.albumGenreRatings = [
      {
        userAlbumId: libraryIds.entry,
        genreKey: 'death metal',
        scoreUnits: 2,
        updatedAt: times.updated,
      },
      {
        userAlbumId: libraryIds.entry,
        genreKey: 'power metal',
        scoreUnits: 20,
        updatedAt: times.updated,
      },
      {
        userAlbumId: libraryIds.otherEntry,
        genreKey: 'death metal',
        scoreUnits: 20,
        updatedAt: times.updated,
      },
    ]
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Añadir álbum', exact: true }),
  ).toBeEnabled()
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'generos-ficticios.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(backup)),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  return backup
}
async function save(page: Page, keyboard = false) {
  const button = page.getByRole('button', {
    name: 'Guardar experiencia',
    exact: true,
  })
  if (keyboard) {
    await button.focus()
    await page.keyboard.press('Enter')
  } else await button.click()
  await expect(
    page.getByText('Experiencia guardada.', { exact: true }),
  ).toBeVisible()
}
async function exported(page: Page) {
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
  if (!path) throw Error('Missing fictional export')
  return parseBackupText(await readFile(path, 'utf8'))
}
test('experiencia por género valida, guarda referencias propias, cancela y conserva notas al quitar la general', async ({
  page,
  context,
}) => {
  const before = await seed(page)
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await openExperience(page)
  await page
    .getByRole('textbox', { name: 'Nota del álbum', exact: true })
    .fill('8,5')
  await page.getByText('Valorar por género', { exact: false }).click()
  await page
    .getByRole('textbox', { name: 'Nota en Death Metal', exact: true })
    .fill('9')
  await page
    .getByRole('textbox', { name: 'Nota en Death Metal', exact: true })
    .press('Tab')
  await expect(
    page.getByRole('combobox', {
      name: 'Edición de referencia en Death Metal',
      exact: true,
    }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', {
      name: 'Quitar nota de Death Metal del borrador',
      exact: true,
    }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('textbox', { name: 'Nota en Power Metal', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('textbox', { name: 'Nota en Power Metal', exact: true })
    .fill('7,7')
  await page
    .getByRole('button', { name: 'Guardar experiencia', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('Power Metal')
  await expect(
    page.getByRole('textbox', { name: 'Nota en Power Metal', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('textbox', { name: 'Nota en Power Metal', exact: true })
    .fill('3')
  await page
    .getByRole('combobox', {
      name: 'Edición de referencia en Death Metal',
      exact: true,
    })
    .selectOption(ids.deluxe)
  await page
    .getByRole('combobox', {
      name: 'Edición de referencia en Power Metal',
      exact: true,
    })
    .selectOption(ids.original)
  await context.setOffline(true)
  await save(page, true)
  await expect(page.locator('.experience-summary')).toContainText('8,5 / 10')
  await openExperience(page)
  await page.getByText('Valorar por género', { exact: false }).click()
  await expect(
    page.getByRole('combobox', {
      name: 'Edición de referencia en Death Metal',
      exact: true,
    }),
  ).toHaveValue(ids.deluxe)
  await expect(
    page.getByRole('combobox', { name: 'Edición de referencia', exact: true }),
  ).toHaveValue('')
  await page
    .getByRole('textbox', { name: 'Nota en Death Metal', exact: true })
    .fill('1')
  await page
    .getByRole('button', { name: 'Cancelar experiencia', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click()
  await openExperience(page)
  await page
    .getByRole('button', { name: 'Quitar nota del borrador', exact: true })
    .click()
  await save(page)
  await context.setOffline(false)
  await page.reload()
  await expect(page.locator('.experience-summary')).toContainText('Sin nota')
  await page.getByText('Valoraciones por género (2)', { exact: true }).click()
  await expect(
    page.locator('.genre-rating-row').filter({ hasText: 'Death Metal' }),
  ).toContainText('9 / 10')
  const after = await exported(page)
  expect(after.data.catalog).toEqual(before.data.catalog)
  expect(after.data.library.ownedItems).toEqual(before.data.library.ownedItems)
  expect(
    after.data.library.albumGenreRatings.find(
      (row) => row.genreKey === 'death metal',
    )?.referenceReleaseId,
  ).toBe(ids.deluxe)
  expect(
    after.data.library.albumRatings.find(
      (row) => row.userAlbumId === libraryIds.entry,
    ),
  ).toBeUndefined()
})
test('Biblioteca y Calificaciones comparan un género explícito sin rellenar con la general y conservan el contexto al volver', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await seed(page, true, true)
  await openLibraryFilters(page)
  const genre = page.getByRole('combobox', { name: 'Género', exact: true })
  await genre.selectOption(longGenre.toLocaleLowerCase('es'))
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)
  await genre.selectOption('death metal')
  await page
    .getByRole('combobox', { name: 'Ordenar por', exact: true })
    .selectOption('rating')
  const cards = page.locator('li[data-entry-id]')
  await expect(cards.first()).toHaveAttribute(
    'data-entry-id',
    libraryIds.otherEntry,
  )
  await expect(cards.last()).toContainText('Mi nota · Death Metal')
  await page
    .getByRole('combobox', { name: 'Nota', exact: true })
    .selectOption('high')
  await expect(cards).toHaveCount(1)
  await page
    .getByRole('combobox', { name: 'Valoración usada', exact: true })
    .selectOption('general')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toHaveAttribute('data-entry-id', libraryIds.entry)
  await genre.selectOption('power metal')
  await expect(cards).toHaveCount(1)
  await page
    .getByRole('combobox', { name: 'Nota', exact: true })
    .selectOption('unrated')
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('Sin valoración en este género')
  await cards.getByRole('button', { name: 'Otra órbita', exact: true }).click()
  await expect(page.locator('.experience-summary')).toContainText(
    'Comparación en Power Metal: Sin valoración en este género',
  )
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
  await openLibraryFilters(page)
  await expect(genre).toHaveValue('power metal')
  await page
    .getByRole('button', { name: 'Calificaciones', exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Género a valorar', exact: true })
    .selectOption(longGenre.toLocaleLowerCase('es'))
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)
  await page
    .getByRole('combobox', { name: 'Género a valorar', exact: true })
    .selectOption('power metal')
  await expect(
    page.getByRole('button', { name: 'Calificar Otra órbita', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Valoración usada', exact: true })
    .selectOption('general')
  await expect(
    page.getByText('No hay álbumes que coincidan.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Calificados', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Género a valorar', exact: true })
    .selectOption('death metal')
  await page
    .getByRole('button', { name: 'Recalificar Otra órbita', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Nota en Death Metal', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Cancelar experiencia', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Volver a calificaciones', exact: true })
    .click()
  await expect(
    page.getByRole('combobox', { name: 'Género a valorar', exact: true }),
  ).toHaveValue('death metal')
})
test('conflicto conserva borrador, renombrado protege notas y formularios son accesibles en ambos temas a320px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 950 })
  await seed(page, true)
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await openExperience(page)
  await page.getByText('Valorar por género', { exact: false }).click()
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
    const layout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('*')]
        .filter(
          (element) =>
            element.getBoundingClientRect().right >
            document.documentElement.clientWidth + 1,
        )
        .slice(0, 12)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          width: element.getBoundingClientRect().width,
          text: element.textContent?.slice(0, 70),
        })),
    }))
    if (layout.scroll > layout.width) console.log(JSON.stringify(layout))
    await page.screenshot({
      path: info.outputPath(`generos-${theme}-diagnostico.png`),
      fullPage: true,
    })
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: info.outputPath(`generos-${theme}-320.png`),
      fullPage: true,
    })
  }
  await page
    .getByRole('textbox', { name: 'Nota del álbum', exact: true })
    .fill('4')
  await page.evaluate(async (entry) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('auditorium')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(request.error ?? new Error('Fictitious database open failed'))
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('albumGenreRatings', 'readwrite'),
        store = tx.objectStore('albumGenreRatings'),
        request = store.get([entry, 'death metal'])
      request.onsuccess = () => {
        const row = request.result as { scoreUnits: number; updatedAt: string }
        store.put({
          ...row,
          scoreUnits: 14,
          updatedAt: '2026-10-26T12:00:00.000Z',
        })
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () =>
        reject(tx.error ?? new Error('Fictitious concurrent write failed'))
    })
    db.close()
  }, libraryIds.entry)
  await page
    .getByRole('button', { name: 'Guardar experiencia', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('El borrador se conserva')
  await expect(
    page.getByRole('textbox', { name: 'Nota del álbum', exact: true }),
  ).toHaveValue('4')
  await page
    .getByRole('button', { name: 'Cargar datos guardados', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Nota del álbum', exact: true }),
  ).toHaveValue('9,5')
  await page
    .getByRole('button', { name: 'Cancelar experiencia', exact: true })
    .click()
  await openAlbumArea(page, 'data')
  await page
    .getByText('Renombrar un género conservando sus valoraciones', {
      exact: true,
    })
    .click()
  await page
    .getByRole('combobox', { name: 'Género a renombrar', exact: true })
    .selectOption('Death Metal')
  await page
    .getByRole('textbox', { name: 'Nuevo nombre del género', exact: true })
    .fill('Power Metal')
  await page
    .getByRole('button', { name: 'Confirmar renombrado', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('No se fusionan')
  await page
    .getByRole('textbox', { name: 'Nuevo nombre del género', exact: true })
    .fill('doom metal')
  await page
    .getByRole('button', { name: 'Confirmar renombrado', exact: true })
    .click()
  await expect(
    page.getByText(
      'Género renombrado. Valoraciones, fechas y referencias conservadas.',
      { exact: true },
    ),
  ).toBeVisible()
  const after = await exported(page),
    note = after.data.library.albumGenreRatings.find(
      (row) =>
        row.userAlbumId === libraryIds.entry && row.genreKey === 'doom metal',
    )!
  expect(note.scoreUnits).toBe(14)
  expect(note.updatedAt).toBe('2026-10-26T12:00:00.000Z')
  expect(
    after.data.catalog.albums.find((row) => row.id === ids.album)?.genres,
  ).toEqual(['Doom Metal', 'Power Metal'])
  expect(
    after.data.library.albumRatings.find(
      (row) => row.userAlbumId === libraryIds.entry,
    )?.scoreUnits,
  ).toBe(19)
})
