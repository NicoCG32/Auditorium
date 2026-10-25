import { openAlbumArea, openExperience } from './helpers/library-navigation'
import { openLibraryOptions } from './helpers/library-navigation'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { parseBackupText, serializeBackup } from '../src/domain/backup'
import { makeBackup } from '../src/domain/backup.fixture'

async function ready(page: Page) {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Añadir álbum', exact: true }),
  ).toBeEnabled()
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(result.violations).toEqual([])
}
async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll('body *'))
      .filter(
        (element) =>
          element.getBoundingClientRect().right >
          document.documentElement.clientWidth + 1,
      )
      .map((element) => ({
        tag: element.tagName,
        class: element.className,
        text: element.textContent?.slice(0, 60),
      }))
      .slice(0, 12),
  }))
  expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.width,
  )
}
async function add(page: Page, title: string, artist: string) {
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByText('Detalles del álbum (opcionales)', { exact: true })
    .click()
  await page.getByRole('textbox', { name: 'Artista', exact: true }).fill(artist)
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill(title)
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
    page.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: title, exact: true }),
  ).toBeVisible()
}
async function fixture(page: Page) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'respaldo-ficticio.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(makeBackup())),
  })
  await expect(
    page.getByRole('button', { name: 'Confirmar restauración', exact: true }),
  ).toBeVisible()
}

test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
  await request.post('/__test/fail-assets?value=false')
})

test('recorrido musical completo conserva notas independientes, copias, deseos y respaldo', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await ready(page)
  await add(page, 'Horizonte Ficticio', 'Conjunto Ficticio')
  await add(page, 'Segundo Álbum Ficticio', 'Otro Artista Ficticio')
  await page
    .getByRole('searchbox', { name: 'Buscar en tu biblioteca' })
    .fill('horizonte')
  await expect(
    page.getByRole('button', { name: 'Segundo Álbum Ficticio', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page
    .getByRole('button', { name: 'Horizonte Ficticio', exact: true })
    .click()
  await openExperience(page)
  await page
    .getByRole('textbox', { name: 'Nota del álbum', exact: true })
    .fill('9,5')
  await openExperience(page)
  await page
    .getByRole('button', { name: 'Guardar experiencia', exact: true })
    .click()
  await expect(
    page.getByText('Experiencia guardada.', { exact: true }),
  ).toBeVisible()
  await openExperience(page)
  await page
    .getByRole('combobox', { name: 'Estado de escucha' })
    .selectOption('completed')
  await openExperience(page)
  await page
    .getByRole('textbox', { name: 'Notas personales' })
    .fill('Comentario ficticio de aceptación.')
  await openExperience(page)
  await page.getByRole('button', { name: 'Guardar experiencia' }).click()
  await expect(
    page.getByText('Experiencia guardada.', { exact: true }),
  ).toBeVisible()
  await openAlbumArea(page, 'tracks')
  await page.getByRole('button', { name: 'Editar lista original' }).click()
  await page.getByRole('button', { name: 'Añadir aparición' }).click()
  await page
    .getByRole('textbox', { name: 'Título nuevo 1' })
    .fill('Pista ficticia')
  await page.getByRole('button', { name: 'Guardar lista', exact: true }).click()
  await openAlbumArea(page, 'tracks')
  await page
    .getByRole('button', { name: 'Valorar pista Pista ficticia', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Nota de la pista', exact: true })
    .fill('8,5')
  await page
    .getByRole('button', { name: 'Guardar nota de pista', exact: true })
    .click()
  await expect(
    page.getByText('Nota de pista guardada.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar valoración de pista' }).click()
  await openAlbumArea(page, 'tracks')
  await page.getByRole('button', { name: 'Nueva edición', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Nombre de edición' })
    .fill('CD ficticio')
  await page
    .getByRole('button', { name: 'Guardar edición', exact: true })
    .click()
  await expect(page.getByRole('list', { name: /CD ficticio/ })).toContainText(
    '8,5',
  )
  await openAlbumArea(page, 'actions')
  await page.getByRole('button', { name: 'Registrar deseo' }).click()
  await page
    .getByRole('combobox', { name: 'Formato deseado', exact: true })
    .selectOption('cd')
  await page
    .getByRole('textbox', { name: 'Notas del deseo' })
    .fill('Deseo ficticio de CD')
  await page.getByRole('button', { name: 'Guardar deseo', exact: true }).click()
  for (const note of ['Primera copia ficticia', 'Segunda copia ficticia']) {
    await openAlbumArea(page, 'collection')
    await page.getByRole('button', { name: 'Registrar ejemplar' }).click()
    await page.getByRole('textbox', { name: 'Notas del ejemplar' }).fill(note)
    await page
      .getByRole('button', { name: 'Guardar ejemplar', exact: true })
      .click()
    await openAlbumArea(page, 'collection')
    await expect(
      page.getByRole('list', { name: 'Ejemplares de este álbum' }),
    ).toContainText(note)
  }
  await page.getByRole('button', { name: /Marcar cumplido Deseo/ }).click()
  await openAlbumArea(page, 'actions')
  await expect(
    page.getByRole('list', { name: 'Deseos de este álbum' }),
  ).toContainText('Cumplido')
  await openAlbumArea(page, 'collection')
  const firstCopy = page
    .getByRole('list', { name: 'Ejemplares de este álbum' })
    .getByRole('listitem')
    .filter({ hasText: 'Primera copia ficticia' })
  await firstCopy.getByRole('button', { name: /Eliminar ejemplar/ }).click()
  await page
    .getByRole('button', { name: 'Confirmar eliminación', exact: true })
    .click()
  await expect(firstCopy).toHaveCount(0)
  await openAlbumArea(page, 'collection')
  await expect(
    page.getByRole('list', { name: 'Ejemplares de este álbum' }),
  ).toContainText('Segunda copia ficticia')
  await openAlbumArea(page, 'actions')
  await page.getByRole('button', { name: 'Quitar álbum de biblioteca' }).click()
  await page.getByRole('button', { name: 'Confirmar retirada' }).click()
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Álbumes retirados (1)' }).click()
  await page
    .getByRole('button', { name: /Restaurar Horizonte Ficticio, entrada/ })
    .click()
  await openExperience(page)
  await expect(
    page.getByRole('textbox', { name: 'Nota del álbum' }),
  ).toHaveValue('9,5')
  await expect(
    page.getByRole('button', { name: 'Volver a álbumes retirados' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await page.reload()
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const download = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON sin audio' })
    .click()
  const path = await (await download).path()
  if (!path) throw new Error('Missing acceptance backup')
  const backup = parseBackupText(await readFile(path, 'utf8'))
  expect(backup.data.library.albumRatings[0]?.scoreUnits).toBe(19)
  expect(backup.data.library.trackRatings[0]?.scoreUnits).toBe(17)
  expect(backup.data.library.ownedItems).toHaveLength(1)
  expect(backup.data.library.purchaseWishes[0]?.status).toBe('fulfilled')
  const restored = backup.data.library.userAlbums.find(
    (entry) => entry.personalNotes === 'Comentario ficticio de aceptación.',
  )
  expect(restored).toMatchObject({ listeningStatus: 'completed' })
  expect(restored?.deletedAt).toBeUndefined()
  expect(errors).toEqual([])
})

test('auditoría de accesibilidad en vacío, formularios, ficha y confirmaciones', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await ready(page)
  await accessible(page)
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByText('Detalles del álbum (opcionales)', { exact: true })
    .click()
  await accessible(page)
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
  await accessible(page)
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await fixture(page)
  await accessible(page)
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await accessible(page)
  await openExperience(page)
  await page
    .getByRole('button', { name: 'Quitar nota del borrador', exact: true })
    .click()
  await accessible(page)
  await page
    .getByRole('button', { name: 'Cancelar experiencia', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click()
  await openAlbumArea(page, 'tracks')
  await page.getByRole('button', { name: 'Editar lista original' }).click()
  await accessible(page)
  await page
    .getByRole('button', { name: 'Descartar borrador', exact: true })
    .click()
  await openAlbumArea(page, 'collection')
  await page.getByRole('button', { name: 'Registrar ejemplar' }).click()
  await accessible(page)
  await page
    .getByRole('button', { name: 'Cancelar registro', exact: true })
    .click()
  await openAlbumArea(page, 'actions')
  await page.getByRole('button', { name: 'Registrar deseo' }).click()
  await accessible(page)
  await page
    .getByRole('button', { name: 'Cancelar formulario de deseo', exact: true })
    .click()
  await openAlbumArea(page, 'actions')
  await page.getByRole('button', { name: 'Quitar álbum de biblioteca' }).click()
  await accessible(page)
  await page.getByRole('button', { name: 'Confirmar retirada' }).click()
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Álbumes retirados (2)' }).click()
  await accessible(page)
  await page.getByText('Aplicación y almacenamiento', { exact: true }).click()
  await accessible(page)
})

test('teclado mantiene foco visible, devuelve foco al cancelar y permite Escape', async ({
  page,
  browserName,
}) => {
  await ready(page)
  // Windows WebKit does not tab through links/buttons. Still exercise native
  // keyboard activation and application focus restoration on those targets.
  const limitedTabs = browserName === 'webkit' && process.platform === 'win32'
  const tabKey =
    browserName === 'webkit' && process.platform === 'darwin'
      ? 'Alt+Tab'
      : 'Tab'
  const skip = page.getByRole('link', { name: 'Ir al contenido' })
  if (limitedTabs) await skip.focus()
  else await page.keyboard.press(tabKey)
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
  const addButton = page.getByRole('button', {
    name: 'Añadir álbum',
    exact: true,
  })
  if (limitedTabs) await addButton.focus()
  else {
    await page.keyboard.press(tabKey)
    await expect(
      page.getByRole('button', { name: 'Biblioteca', exact: true }),
    ).toBeFocused()
    await page.keyboard.press(tabKey)
  }
  await expect(addButton).toBeFocused()
  await addButton.press('Enter')
  await expect(
    page.getByRole('textbox', { name: 'Artista', exact: true }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Cancelar', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(addButton).toBeFocused()
  await fixture(page)
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await page.getByRole('button', { name: 'Eclipse', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('heading', { name: 'Eclipse', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Editar experiencia', exact: true })
    .click()
  await openExperience(page)
  await page
    .getByRole('textbox', { name: 'Nota del álbum', exact: true })
    .fill('8')
  await page
    .getByRole('button', { name: 'Cancelar experiencia', exact: true })
    .click()
  const keep = page.getByRole('button', {
    name: 'Seguir editando',
    exact: true,
  })
  await expect(keep).toBeFocused()
  await keep.press('Escape')
  await expect(
    page.getByRole('button', { name: 'Cancelar experiencia', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Cancelar experiencia', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click()
  const summary = page.getByText('Aplicación y almacenamiento', { exact: true })
  await summary.focus()
  await summary.press('Enter')
  await expect(
    page.getByText(/Los datos permanecen en este navegador/),
  ).toBeVisible()
  expect(
    await summary.evaluate((element) => getComputedStyle(element).outlineWidth),
  ).toBe('3px')
})

test('pantallas a 320, 768 y 1280 px y texto al 200 % permiten operar sin desborde', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  await fixture(page)
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await noOverflow(page)
    await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
    await noOverflow(page)
    await openAlbumArea(page, 'collection')
    await page.getByRole('button', { name: 'Registrar ejemplar' }).click()
    await noOverflow(page)
    await page
      .getByRole('button', { name: 'Cancelar registro', exact: true })
      .click()
    await page.getByRole('button', { name: 'Volver a biblioteca' }).click()
  }
  await page.setViewportSize({ width: 320, height: 900 })
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  await noOverflow(page)
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await noOverflow(page)
  expect(
    await page
      .getByRole('button', { name: 'Volver a biblioteca' })
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44)
})
