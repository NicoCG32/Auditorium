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
  const panel = page.locator('details.appearance-panel')
  if (
    !(await panel.evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await panel.locator('summary').click()
  return panel
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
      await panel.locator('summary').click()
      await page.getByRole('button', { name: 'Añadir tu primer álbum' }).click()
      await accessible(page)
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
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
      await page.getByRole('button', { name: 'Lista', exact: true }).click()
      await accessible(page)
      await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
      await accessible(page)
      await page
        .getByRole('textbox', { name: 'Notas personales', exact: true })
        .fill('Borrador ficticio conservado')
      const settings = await appearance(page)
      await settings
        .getByRole('checkbox', { name: 'Ambientación decorativa' })
        .uncheck()
      await settings
        .getByRole('radio', {
          name: theme === 'dark' ? 'Claro' : 'Oscuro',
          exact: true,
        })
        .check()
      await expect(
        page.getByRole('textbox', { name: 'Notas personales', exact: true }),
      ).toHaveValue('Borrador ficticio conservado')
      await accessible(page)
      await settings
        .getByRole('radio', {
          name: theme === 'dark' ? 'Oscuro' : 'Claro',
          exact: true,
        })
        .check()
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

test('foto local sólo aparece tras selección, se puede ocultar y no persiste al recargar', async ({
  page,
}) => {
  await page.goto('/')
  const panel = await appearance(page)
  await expect(page.locator('.appearance-poster')).toHaveCount(0)
  await panel
    .getByLabel('Foto de fondo opcional', { exact: true })
    .setInputFiles('public/auditorium/icons/icon-192.png')
  await expect(page.locator('.appearance-poster')).toHaveCount(1)
  await panel
    .getByRole('combobox', { name: 'Posición de la foto', exact: true })
    .selectOption('right')
  await expect(page.locator('.appearance-poster')).toHaveCSS(
    'background-position',
    '100% 50%',
  )
  await accessible(page)
  await panel
    .getByRole('checkbox', { name: 'Ambientación decorativa' })
    .uncheck()
  await expect(page.locator('.appearance-poster')).toHaveCount(0)
  await panel.getByRole('checkbox', { name: 'Ambientación decorativa' }).check()
  await expect(page.locator('.appearance-poster')).toHaveCount(1)
  await panel.getByRole('button', { name: 'Quitar foto', exact: true }).click()
  await expect(page.locator('.appearance-poster')).toHaveCount(0)
  await panel
    .getByLabel('Foto de fondo opcional', { exact: true })
    .setInputFiles('public/auditorium/icons/icon-192.png')
  await expect(page.locator('.appearance-poster')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.appearance-poster')).toHaveCount(0)
  await expect(
    (await appearance(page)).getByRole('button', {
      name: 'Quitar foto',
      exact: true,
    }),
  ).toHaveCount(0)
})
