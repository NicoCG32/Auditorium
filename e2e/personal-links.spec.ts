import { openAlbumArea } from './helpers/library-navigation'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { parseBackupText } from '../src/domain/backup'
import { openLibraryOptions } from './helpers/library-navigation'

test.use({ serviceWorkers: 'block' })
const spotify = 'https://open.spotify.com/album/' + 'a'.repeat(22)
const youtube = 'https://www.youtube.com/watch?v=ficticio_01'
const shop = 'https://tienda.example/album/umbral?edition=deluxe'
async function addLink(
  page: Page,
  index: number,
  url: string,
  label: string,
  purpose = 'playback',
) {
  await page.getByRole('button', { name: 'Añadir enlace', exact: true }).click()
  await page
    .getByRole('combobox', {
      name: `Propósito del enlace ${index}`,
      exact: true,
    })
    .selectOption(purpose)
  await page
    .getByRole('textbox', { name: `URL del enlace ${index}`, exact: true })
    .fill(url)
  await page
    .getByRole('textbox', { name: `Etiqueta del enlace ${index}`, exact: true })
    .fill(label)
}
async function addAlbum(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByText('Detalles del álbum (opcionales)', { exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Artista', exact: true })
    .fill('Banda Ficticia')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Umbral Ficticio')
  await addLink(page, 1, spotify, 'Mi versión original')
  await addLink(page, 2, youtube, 'Alternativa de escucha')
  await addLink(page, 3, shop, 'Tienda elegida', 'purchase')
  await page
    .getByRole('combobox', { name: 'Enlace favorito de reproducción' })
    .selectOption({ label: 'Mi versión original' })
  if (
    (await page
      .getByRole('radio', {
        name: 'Es otro artista con este nombre (crear uno nuevo)',
        exact: true,
      })
      .count()) === 1
  )
    await page
      .getByRole('radio', {
        name: 'Es otro artista con este nombre (crear uno nuevo)',
        exact: true,
      })
      .check()
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Umbral Ficticio', exact: true }),
  ).toBeVisible()
}
async function backup(page: Page) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON sin audio' })
    .click()
  const path = await (await downloading).path()
  expect(path).toBeTruthy()
  return parseBackupText(await readFile(path, 'utf8'))
}
async function openAlbum(page: Page) {
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await page
    .getByRole('button', { name: 'Umbral Ficticio', exact: true })
    .click()
}
test('alta, edición coordinada, favoritos, cancelación y proveedor genérico conservan independencia', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await addAlbum(page)
  const listen = page.getByRole('region', { name: 'Escuchar', exact: true }),
    buy = page.getByRole('region', { name: 'Comprar', exact: true })
  await expect(
    listen.getByRole('link', { name: /Mi versión original/ }),
  ).toHaveAttribute('href', spotify)
  await expect(
    buy.getByRole('link', { name: 'Tienda elegida', exact: true }),
  ).toHaveAttribute('href', shop)
  await expect(buy.getByRole('link')).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  )
  await expect(
    page.getByRole('region', {
      name: 'Referencias del catálogo',
      includeHidden: true,
    }),
  ).not.toContainText('Favorito de reproducción')
  const before = await backup(page)
  expect(before.schemaVersion).toBe(6)
  expect(before.data.library.albumRatings).toEqual([])
  expect(before.data.library.ownedItems).toEqual([])
  expect(before.data.library.userAlbums[0]!.listeningStatus).toBe('untracked')
  await openAlbum(page)
  await page
    .getByRole('button', { name: 'Editar enlaces', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'URL del enlace 1', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('textbox', { name: 'URL del enlace 1', exact: true })
    .fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Guardar cambios del álbum' }).click()
  await expect(page.getByRole('alert')).toContainText('HTTPS')
  await expect(
    page.getByRole('textbox', { name: 'URL del enlace 1', exact: true }),
  ).toHaveValue('javascript:alert(1)')
  await page
    .getByRole('textbox', { name: 'URL del enlace 1', exact: true })
    .fill('https://servicio.example/album/umbral')
  await page.getByRole('button', { name: 'Cancelar edición' }).click()
  await page
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click()
  expect((await backup(page)).data).toEqual(before.data)
  await openAlbum(page)
  await page.getByRole('button', { name: 'Editar álbum', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Umbral Ficticio Corregido')
  await page
    .getByRole('textbox', { name: 'URL del enlace 1', exact: true })
    .fill('https://servicio.example/album/umbral')
  await page
    .getByRole('combobox', { name: 'Enlace favorito de reproducción' })
    .selectOption({ label: 'Alternativa de escucha' })
  await page.getByRole('button', { name: 'Guardar cambios del álbum' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Umbral Ficticio Corregido',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    listen.getByRole('link', { name: /Alternativa de escucha/ }),
  ).toContainText('Favorito de reproducción')
  await expect(
    listen.getByRole('link', { name: 'Mi versión original', exact: true }),
  ).toHaveAttribute('href', 'https://servicio.example/album/umbral')
  await page
    .getByRole('region', { name: 'Tus enlaces personales' })
    .scrollIntoViewIfNeeded()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.screenshot({
    path: info.outputPath('personal-links-mobile.png'),
    scale: 'css',
  })
  await page.reload()
  await expect(listen.getByRole('link')).toHaveCount(2)
})

test('retirada, restauración y respaldo transportan enlaces y favorito sin compra ni nota implícita', async ({
  page,
  browser,
}, info) => {
  await addAlbum(page)
  const original = await backup(page)
  await openAlbum(page)
  await openAlbumArea(page, 'actions')
  await page
    .getByRole('button', { name: 'Quitar álbum de biblioteca', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirmar retirada', exact: true })
    .click()
  await openLibraryOptions(page)
  await page.getByRole('button', { name: /Álbumes retirados/ }).click()
  await page
    .getByRole('button', { name: /^Restaurar Umbral Ficticio, entrada/ })
    .click()
  const restored = await backup(page)
  expect(restored.data.library.userAlbums[0]!.links).toEqual(
    original.data.library.userAlbums[0]!.links,
  )
  expect(restored.data.library.userAlbums[0]!.preferredPlaybackLinkId).toBe(
    original.data.library.userAlbums[0]!.preferredPlaybackLinkId,
  )
  const destination = await browser.newContext({ serviceWorkers: 'block' })
  try {
    const other = await destination.newPage()
    await other.goto('/')
    await openLibraryOptions(other)
    await other.getByRole('button', { name: 'Respaldos', exact: true }).click()
    await other.locator('#backup-file').setInputFiles({
      name: 'enlaces-ficticios.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(restored)),
    })
    await other
      .getByRole('button', { name: 'Confirmar restauración', exact: true })
      .click()
    await openAlbum(other)
    await expect(
      other.getByRole('region', { name: 'Escuchar' }).getByRole('link'),
    ).toHaveCount(2)
    await expect(
      other.getByRole('region', { name: 'Comprar' }).getByRole('link'),
    ).toHaveCount(1)
    await other
      .getByRole('button', { name: 'Editar enlaces', exact: true })
      .click()
    await other
      .getByRole('button', { name: 'Quitar enlace 1', exact: true })
      .click()
    await expect(
      other.getByRole('combobox', { name: 'Enlace favorito de reproducción' }),
    ).toHaveValue('')
    await other
      .getByRole('button', { name: 'Guardar cambios del álbum' })
      .click()
    await expect(
      other.getByRole('region', { name: 'Escuchar' }).getByRole('link'),
    ).toHaveCount(1)
    await other
      .getByRole('region', { name: 'Tus enlaces personales' })
      .scrollIntoViewIfNeeded()
    await other.screenshot({
      path: info.outputPath('personal-links-desktop.png'),
      scale: 'css',
    })
  } finally {
    await destination.close()
  }
})
