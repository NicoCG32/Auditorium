import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { parseBackupText, serializeBackup } from '../src/domain/backup'
import { makeBackup } from '../src/domain/backup.fixture'
import {
  openAlbumArea,
  openExperience,
  openLibraryFilters,
  openLibraryOptions,
} from './helpers/library-navigation'

test.use({ serviceWorkers: 'block', actionTimeout: 10_000 })

async function download(page: Page) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON sin audio' })
    .click()
  const path = await (await downloading).path()
  if (!path) throw new Error('Falta el respaldo del recorrido ficticio')
  return parseBackupText(await readFile(path, 'utf8'))
}

async function restore(page: Page, buffer: Buffer) {
  await page.goto('/')
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'recorrido-ficticio.json',
    mimeType: 'application/json',
    buffer,
  })
  await page.getByRole('button', { name: 'Confirmar restauración' }).click()
}

async function saveExperience(page: Page) {
  await page.getByRole('button', { name: 'Guardar experiencia' }).click()
  await expect(
    page.getByText('Experiencia guardada.', { exact: true }),
  ).toBeVisible()
}

test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
  await request.post('/__test/fail-assets?value=false')
})

test('del alta manual a la restauración conserva una identidad y conceptos independientes', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  const external: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).hostname === '127.0.0.1')
      await route.continue()
    else {
      external.push(new URL(route.request().url()).hostname)
      await route.abort()
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Artista', exact: true })
    .fill('conjunto de prueba')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('horizonte de prueba')
  await page
    .getByRole('button', { name: 'Continuar con el registro manual' })
    .click()
  await page
    .getByText('Detalles del álbum (opcionales)', { exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Géneros (separados por comas)' })
    .fill('death metal, power metal')
  await page.getByRole('button', { name: 'Añadir enlace', exact: true }).click()
  const url = 'https://audio.example/album/horizonte'
  await page
    .getByRole('textbox', { name: 'URL del enlace 1', exact: true })
    .fill(url)
  await page
    .getByRole('textbox', { name: 'Etiqueta del enlace 1', exact: true })
    .fill('Mi escucha de prueba')
  await page
    .getByRole('combobox', { name: 'Enlace favorito de reproducción' })
    .selectOption({ label: 'Mi escucha de prueba' })
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Horizonte De Prueba', exact: true }),
  ).toBeFocused()
  const first = await download(page)
  expect(first.data.catalog.albums).toHaveLength(1)
  expect(first.data.library.albumRatings).toEqual([])
  expect(first.data.library.albumGenreRatings).toEqual([])
  expect(first.data.library.ownedItems).toEqual([])
  const identity = first.data.library.userAlbums[0]!

  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await page
    .getByRole('button', { name: 'Horizonte De Prueba', exact: true })
    .click()
  await page.getByRole('button', { name: 'Editar álbum', exact: true }).click()
  const title = page.getByRole('textbox', { name: 'Título', exact: true })
  await title.fill('horizonte corregido de prueba')
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Cambios sin guardar' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(title).toHaveValue('horizonte corregido de prueba')
  await title.focus()
  await page.keyboard.press('Tab')
  await page.getByRole('button', { name: 'Guardar cambios del álbum' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Horizonte Corregido De Prueba',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Escuchar', exact: true })
      .getByRole('link'),
  ).toHaveAttribute('href', url)

  for (const [name, format] of [
    ['Original De Prueba', 'cd'],
    ['Deluxe De Prueba', 'vinyl'],
    ['Aniversario De Prueba', 'digital'],
  ]) {
    await openAlbumArea(page, 'tracks')
    await page
      .getByRole('button', { name: 'Nueva edición', exact: true })
      .click()
    await page.getByRole('textbox', { name: 'Nombre de edición' }).fill(name!)
    await page
      .getByRole('combobox', { name: 'Formato de edición' })
      .selectOption(format!)
    await page
      .getByRole('button', { name: 'Guardar edición', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Guardar edición', exact: true }),
    ).toHaveCount(0)
  }
  await openExperience(page)
  await page
    .getByRole('textbox', { name: 'Nota del álbum', exact: true })
    .fill('6')
  await page
    .getByRole('combobox', { name: 'Edición de referencia', exact: true })
    .selectOption({ label: 'Aniversario De Prueba · Digital' })
  await page.getByText('Valorar por género', { exact: false }).click()
  await page
    .getByRole('textbox', { name: 'Nota en Death Metal', exact: true })
    .fill('9')
  await page
    .getByRole('textbox', { name: 'Nota en Power Metal', exact: true })
    .fill('1')
  await saveExperience(page)
  await openExperience(page)
  await page
    .getByRole('textbox', { name: 'Nota del álbum', exact: true })
    .fill('6,5')
  await expect(
    page.getByRole('combobox', { name: 'Edición de referencia', exact: true }),
  ).toHaveValue(/.+/)
  await saveExperience(page)

  for (const medium of ['physical', 'purchased_digital']) {
    await openAlbumArea(page, 'collection')
    await page
      .getByRole('button', { name: 'Registrar ejemplar', exact: true })
      .click()
    await page
      .getByRole('combobox', { name: 'Medio del ejemplar', exact: true })
      .selectOption(medium)
    await page
      .getByRole('textbox', { name: 'Notas del ejemplar', exact: true })
      .fill(`Adquisición ficticia ${medium}`)
    await page
      .getByRole('button', { name: 'Guardar ejemplar', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Guardar ejemplar', exact: true }),
    ).toHaveCount(0)
  }
  await openAlbumArea(page, 'actions')
  await page
    .getByRole('button', { name: 'Registrar deseo', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Notas del deseo' })
    .fill('Deseo ficticio independiente')
  await page.getByRole('button', { name: 'Guardar deseo', exact: true }).click()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await openLibraryFilters(page)
  await page
    .getByRole('combobox', { name: 'Género', exact: true })
    .selectOption('power metal')
  await expect(page.locator('li[data-entry-id]')).toHaveCount(1)
  await expect(page.locator('li[data-entry-id]')).toContainText(
    'Mi nota · Power Metal',
  )
  await expect(page.locator('li[data-entry-id]')).toContainText('1 / 10')
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
  await expect(
    page
      .getByRole('list', { name: 'Adquisiciones registradas' })
      .getByRole('listitem'),
  ).toHaveCount(2)
  await page.screenshot({
    path: info.outputPath('recorrido-coleccion.png'),
    fullPage: true,
  })
  await page.reload()
  const final = await download(page)
  expect(final.data.catalog.albums).toHaveLength(1)
  expect(final.data.catalog.releases).toHaveLength(3)
  expect(final.data.library.userAlbums).toHaveLength(1)
  expect(final.data.library.userAlbums[0]).toMatchObject({
    id: identity.id,
    albumId: identity.albumId,
    addedAt: identity.addedAt,
  })
  expect(final.data.library.albumRatings).toHaveLength(1)
  expect(final.data.library.albumRatings[0]).toMatchObject({
    scoreUnits: 13,
    referenceReleaseId: final.data.catalog.releases.find(
      (row) => row.editionLabel === 'Aniversario De Prueba',
    )!.id,
  })
  expect(
    final.data.library.albumGenreRatings
      .map((row) => [row.genreKey, row.scoreUnits])
      .sort(),
  ).toEqual([
    ['death metal', 18],
    ['power metal', 2],
  ])
  expect(final.data.library.ownedItems.map((row) => row.medium).sort()).toEqual(
    ['physical', 'purchased_digital'],
  )
  expect(final.data.library.purchaseWishes).toHaveLength(1)
  expect(final.data.library.userAlbums[0]!.links).toEqual(
    first.data.library.userAlbums[0]!.links,
  )
  expect(final.data.library.userAlbums[0]!.preferredPlaybackLinkId).toBe(
    first.data.library.userAlbums[0]!.preferredPlaybackLinkId,
  )
  const restoredContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    serviceWorkers: 'block',
  })
  try {
    const restoredPage = await restoredContext.newPage()
    await restore(restoredPage, Buffer.from(serializeBackup(final)))
    expect((await download(restoredPage)).data).toEqual(final.data)
  } finally {
    await restoredContext.close()
  }
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('recorrido con texto al 200% conserva controles y reflujo en ambos temas', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  await restore(page, Buffer.from(serializeBackup(makeBackup())))
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).fontSize,
    ),
  ).toBe('32px')
  for (const theme of ['Oscuro', 'Claro']) {
    await page.getByText('Apariencia', { exact: true }).click()
    await page.getByRole('radio', { name: theme, exact: true }).check()
    await page.getByText('Apariencia', { exact: true }).click()
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      for (const destination of [
        'Biblioteca',
        'Añadir álbum',
        'Calificaciones',
        'Mi colección',
      ]) {
        await page
          .getByRole('button', { name: destination, exact: true })
          .click()
        if (destination === 'Biblioteca') await openLibraryFilters(page)
        if (destination === 'Añadir álbum')
          await page
            .getByText('Detalles del álbum (opcionales)', { exact: true })
            .click()
        if (destination === 'Calificaciones')
          await page
            .getByRole('button', { name: 'Calificados', exact: true })
            .click()
        if (destination === 'Mi colección') {
          const register = page.locator('details.collection-register')
          if ((await register.getAttribute('open')) === null)
            await register.locator('summary').click()
        }
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
          overflowing: [...document.querySelectorAll('body *')]
            .filter(
              (element) =>
                element.getBoundingClientRect().right >
                  document.documentElement.clientWidth + 1 ||
                element.scrollWidth > element.clientWidth + 1,
            )
            .slice(0, 8)
            .map((element) => ({
              tag: element.tagName,
              class: element.className,
              text: element.textContent?.slice(0, 80),
              client: element.clientWidth,
              scroll: element.scrollWidth,
            })),
        }))
        if (dimensions.content > dimensions.viewport)
          await page.screenshot({
            path: info.outputPath('desbordamiento.png'),
            fullPage: true,
          })
        expect(
          dimensions.content,
          JSON.stringify({ destination, theme, width, ...dimensions }),
        ).toBeLessThanOrEqual(dimensions.viewport)
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze()
          ).violations,
        ).toEqual([])
        if (width === 320) {
          await page.getByRole('heading', { level: 1 }).focus()
          await page.mouse.move(0, 0)
          await page.screenshot({
            path: info.outputPath(`texto-200-${theme}-${destination}.png`),
            fullPage: true,
          })
        }
      }
    }
  }
})
