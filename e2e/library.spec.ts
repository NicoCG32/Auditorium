import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { serializeBackup } from '../src/domain/backup'
import {
  visualCover,
  visualLibraryBackup,
} from '../src/test/visual-library.fixture'
import {
  openLibraryFilters,
  openLibraryOptions,
} from './helpers/library-navigation'

test.use({ serviceWorkers: 'block' })

async function appearance(page: Page, theme: 'dark' | 'light') {
  const panel = page.locator('.appearance-panel')
  if ((await panel.getAttribute('open')) === null)
    await panel.locator('summary').click()
  await page
    .getByRole('radio', {
      name: theme === 'dark' ? 'Oscuro' : 'Claro',
      exact: true,
    })
    .check()
  await panel.locator('summary').click()
}

async function populated(page: Page) {
  await page
    .context()
    .route('https://covers.example.invalid/visual-*.svg', (route) => {
      const index = Number(/visual-(\d+)/.exec(route.request().url())?.[1] ?? 0)
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: visualCover(index),
      })
    })
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'biblioteca-visual-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(await visualLibraryBackup())),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Marea De Ceniza', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Marea De Ceniza', exact: true }),
  ).toBeVisible()
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)
}

test('Biblioteca vacía y poblada conserva jerarquía y legibilidad en ambos temas y tamaños', async ({
  page,
}, info) => {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Añadir álbum', exact: true }),
  ).toBeEnabled()
  await writeFile(
    info.outputPath('biblioteca-visual-ficticia.json'),
    serializeBackup(await visualLibraryBackup()),
  )
  for (const state of ['empty', 'populated'] as const) {
    if (state === 'populated') await populated(page)
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      for (const theme of ['dark', 'light'] as const) {
        await appearance(page, theme)
        await page.evaluate(() => window.scrollTo(0, 0))
        await noOverflow(page)
        if (state === 'populated') {
          const first = await page.locator('.album-card').first().boundingBox()
          const search = await page
            .getByRole('searchbox', { name: 'Buscar en tu biblioteca' })
            .boundingBox()
          expect(first).not.toBeNull()
          expect(search).not.toBeNull()
          expect(first!.y).toBeGreaterThanOrEqual(0)
          expect(first!.y).toBeLessThan(720)
          expect(search!.y + search!.height).toBeLessThan(800)
          const title = await page
            .locator('.album-card')
            .first()
            .locator('.album-title-button')
            .boundingBox()
          expect(title).not.toBeNull()
          expect(
            title!.y + title!.height,
            `${width}px / ${theme}: título completo visible`,
          ).toBeLessThan(800)
          await expect(
            page.getByRole('combobox', { name: 'Género', exact: true }),
          ).toHaveCount(0)
        }
        const violations = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
        expect(violations.violations).toEqual([])
        await page.locator('img').evaluateAll(async (images) => {
          await Promise.all(
            images.map((image) =>
              image instanceof HTMLImageElement
                ? image.decode()
                : Promise.resolve(),
            ),
          )
        })
        await page.screenshot({
          path: info.outputPath(`library-${state}-${width}-${theme}.png`),
          fullPage: false,
          scale: 'css',
        })
      }
    }
  }
})

test('filtros combinados, portada, regreso, teclado y texto ampliado conservan el recorrido', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  await populated(page)
  await openLibraryFilters(page)
  await page
    .getByRole('combobox', { name: 'Género', exact: true })
    .selectOption('metal progresivo')
  await page
    .getByRole('combobox', { name: 'País de origen', exact: true })
    .selectOption('chile')
  await page
    .getByRole('combobox', { name: 'Escucha', exact: true })
    .selectOption('queued')
  await page
    .getByRole('combobox', { name: 'Nota', exact: true })
    .selectOption('high')
  await expect(page.getByRole('button', { name: 'Filtros (4)' })).toBeVisible()
  await page.getByRole('button', { name: 'Filtros (4)' }).click()
  await page
    .getByRole('combobox', { name: 'Ordenar por' })
    .selectOption('title')
  await page.getByRole('searchbox').fill('marea')
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  const cover = page.getByRole('button', {
    name: 'Abrir ficha de Marea De Ceniza',
    exact: true,
  })
  await cover.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('heading', { name: 'Marea De Ceniza', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
  await expect(cover).toBeFocused()
  await expect(page.getByRole('searchbox')).toHaveValue('marea')
  await expect(
    page.getByRole('button', { name: 'Lista', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue(
    'title',
  )
  await expect(
    page.getByRole('button', { name: 'Filtros (4)' }),
  ).toHaveAttribute('aria-expanded', 'false')
  await page
    .getByRole('button', { name: 'Quitar filtro País: Chile', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Filtros (3)' })).toBeVisible()
  await page
    .getByRole('button', { name: 'Limpiar búsqueda y filtros', exact: true })
    .click()
  await page.getByRole('searchbox').fill('sin-coincidencia-ficticia')
  await expect(
    page.getByRole('heading', { name: 'No encontramos coincidencias' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Mostrar todos los álbumes' }).click()
  const appearancePanel = page.locator('.appearance-panel')
  await appearancePanel.locator('summary').click()
  await page
    .getByRole('checkbox', { name: 'Ambientación decorativa' })
    .uncheck()
  await appearancePanel.locator('summary').click()
  await expect(page.locator('.aud-app')).toHaveAttribute(
    'data-aud-ambient',
    'off',
  )
  await page.setViewportSize({ width: 320, height: 800 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  await noOverflow(page)
  await openLibraryFilters(page)
  await expect(
    page.getByRole('combobox', { name: 'Género', exact: true }),
  ).toBeVisible()
  await noOverflow(page)
  await page.locator('.library-utilities summary').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.library-utilities')).not.toHaveAttribute('open')
  await expect(page.locator('.library-utilities summary')).toBeFocused()
})
