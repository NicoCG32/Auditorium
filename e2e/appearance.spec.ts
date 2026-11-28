import {
  openExperience,
  openLibraryFilters,
} from './helpers/library-navigation'
import { openSettings } from './helpers/library-navigation'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { serializeBackup } from '../src/domain/backup'
import { makeBackup } from '../src/domain/backup.fixture'

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(result.violations).toEqual([])
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  )
}

async function appearance(page: Page) {
  await openSettings(page)
  return page.getByRole('dialog', { name: 'Ajustes', exact: true })
}

async function rawDatabase(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('auditorium')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(new Error('No se pudo abrir la biblioteca ficticia.'))
    })
    const names = Array.from(database.objectStoreNames)
    const transaction = database.transaction(names, 'readonly')
    const rows = await Promise.all(
      names.map(
        (name) =>
          new Promise((resolve, reject) => {
            const reading = transaction.objectStore(name).getAll()
            reading.onsuccess = () => resolve([name, reading.result])
            reading.onerror = () =>
              reject(new Error('No se pudo leer la biblioteca ficticia.'))
          }),
      ),
    )
    database.close()
    return rows
  })
}

for (const theme of ['dark', 'light'] as const) {
  for (const width of [360, 1280]) {
    test(`${theme} a ${width}px conserva lectura, controles y datos al cambiar apariencia`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(
        page.getByRole('button', { name: 'Añadir álbum', exact: true }),
      ).toBeEnabled()
      const panel = await appearance(page)
      await panel
        .getByRole('radio', {
          name: theme === 'dark' ? 'Oscuro' : 'Claro',
          exact: true,
        })
        .check()
      await expect(page.locator('.aud-app')).toHaveAttribute(
        'data-aud-theme',
        theme,
      )
      await accessible(page)
      await panel
        .getByRole('button', { name: 'Cerrar ajustes', exact: true })
        .click()
      await page.getByRole('button', { name: 'Añadir tu primer álbum' }).click()
      await accessible(page)
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
      await openSettings(page)
      await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
      await page.locator('#backup-file').setInputFiles({
        name: 'biblioteca-ficticia-apariencia.json',
        mimeType: 'application/json',
        buffer: Buffer.from(serializeBackup(makeBackup())),
      })
      await page
        .getByRole('button', { name: 'Confirmar restauración', exact: true })
        .click()
      await expect(
        page.getByRole('button', { name: 'Eclipse', exact: true }),
      ).toBeVisible()
      const before = await rawDatabase(page)
      await accessible(page)
      await openLibraryFilters(page)
      await page.getByRole('button', { name: 'Lista', exact: true }).click()
      await accessible(page)
      await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
      await accessible(page)
      await openExperience(page)
      await page
        .getByRole('textbox', { name: 'Notas personales', exact: true })
        .fill('Borrador ficticio conservado')
      const settings = await appearance(page)
      await settings
        .getByRole('checkbox', { name: 'Fondo decorativo' })
        .uncheck()
      await settings
        .getByRole('radio', {
          name: theme === 'dark' ? 'Claro' : 'Oscuro',
          exact: true,
        })
        .check()
      await settings
        .getByRole('button', { name: 'Cerrar ajustes', exact: true })
        .click()
      await openExperience(page)
      await expect(
        page.getByRole('textbox', { name: 'Notas personales', exact: true }),
      ).toHaveValue('Borrador ficticio conservado')
      await accessible(page)
      const reopenedSettings = await appearance(page)
      await reopenedSettings
        .getByRole('radio', {
          name: theme === 'dark' ? 'Oscuro' : 'Claro',
          exact: true,
        })
        .check()
      await reopenedSettings
        .getByRole('button', { name: 'Cerrar ajustes', exact: true })
        .click()
      // This reload explicitly discards the fictitious draft after the theme check.
      page.once('dialog', (dialog) => dialog.accept())
      await page.reload()
      await expect(page.locator('.aud-app')).toHaveAttribute(
        'data-aud-theme',
        theme,
      )
      await expect(page.locator('.aud-app')).toHaveAttribute(
        'data-aud-ambient',
        'off',
      )
      await expect(
        page.getByRole('heading', { name: 'Eclipse', exact: true }),
      ).toBeVisible()
      const after = await rawDatabase(page)
      expect(after).toEqual(before)
      await accessible(page)
    })
  }
}
