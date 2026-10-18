import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { makeBackup } from '../src/domain/backup.fixture'
import { parseBackupText, serializeBackup } from '../src/domain/backup'

test.use({ serviceWorkers: 'block' })

test('guardar y salir con título inválido vuelve al campo sin abandonar el editor', async ({
  page,
}) => {
  await seed(page)
  await edit(page)
  const title = page.getByRole('textbox', { name: 'Título', exact: true })
  await title.fill('')
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar y salir' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Cambios sin guardar' }),
  ).not.toBeVisible()
  await expect(page).toHaveURL(/\/editar$/)
  await expect(title).toHaveValue('')
  await expect(title).toBeFocused()
})

async function seed(page: Page) {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Respaldos', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'biblioteca-navegacion-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(makeBackup())),
  })
  await page.getByRole('button', { name: 'Confirmar restauración' }).click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
}
async function edit(page: Page) {
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await page.getByRole('button', { name: 'Editar álbum', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Título', exact: true }),
  ).toHaveValue('Eclipse')
}

test('Atrás, Escape y un salto de varias entradas conservan o descartan sólo por decisión', async ({
  page,
}) => {
  await seed(page)
  await page
    .getByRole('button', { name: 'Recomendaciones', exact: true })
    .click()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await edit(page)
  const title = page.getByRole('textbox', { name: 'Título', exact: true })
  await title.fill('Borrador de navegación ficticio')
  await page.goBack()
  const dialog = page.getByRole('dialog', { name: 'Cambios sin guardar' })
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/editar$/)
  await expect(
    dialog.getByRole('button', { name: 'Seguir editando' }),
  ).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(title).toHaveValue('Borrador de navegación ficticio')
  await expect(title).toBeFocused()
  await page.evaluate(() => history.go(-3))
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/editar$/)
  await dialog.getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page).toHaveURL(/#\/opciones\/recomendaciones$/)
  await page.goForward()
  await expect(page).toHaveURL(/#\/biblioteca$/)
  await page.goForward()
  await expect(
    page.getByRole('heading', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  await page.goForward()
  await expect(title).toHaveValue('Eclipse')
})

test('guardar y salir conserva identidad y datos ajenos, y abre el destino pedido', async ({
  page,
}) => {
  await seed(page)
  await edit(page)
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Eclipse corregido en navegación')
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar y salir' }).click()
  await expect(page).toHaveURL(/#\/coleccion$/)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar respaldo JSON' }).click()
  const path = await (await downloading).path()
  if (!path) throw new Error('No se descargó el respaldo ficticio.')
  const after = parseBackupText(await readFile(path, 'utf8'))
  const before = makeBackup()
  expect(after.data.identity).toEqual(before.data.identity)
  expect(after.data.library).toEqual(before.data.library)
  expect(after.data.catalog.albums).toHaveLength(
    before.data.catalog.albums.length,
  )
  expect(after.data.catalog.albums[0]).toEqual({
    ...before.data.catalog.albums[0],
    title: 'Eclipse corregido en navegación',
  })
})

test('regreso conserva consulta, orden, vista, foco y posición de biblioteca', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await seed(page)
  const search = page.getByRole('searchbox', {
    name: 'Buscar en tu biblioteca',
  })
  await search.fill('Eclipse')
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  const button = page.getByRole('button', { name: 'Eclipse', exact: true })
  await button.scrollIntoViewIfNeeded()
  const position = await page.evaluate(() => scrollY)
  await button.click()
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
  await expect(search).toHaveValue('Eclipse')
  await expect(
    page.getByRole('button', { name: 'Lista', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(button).toBeFocused()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(position, 0)
})

test('recarga conserva la pantalla y una ruta desconocida permite volver sin perder datos', async ({
  page,
}) => {
  await seed(page)
  await edit(page)
  await page.reload()
  await expect(
    page.getByRole('textbox', { name: 'Título', exact: true }),
  ).toHaveValue('Eclipse')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Borrador después de recargar')
  await page.goBack()
  const dialog = page.getByRole('dialog', { name: 'Cambios sin guardar' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(
    page.getByRole('heading', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  await page.goto('/#/pantalla-que-no-existe')
  await expect(
    page.getByRole('heading', { name: 'No encontramos esta pantalla' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
})

test('diálogo accesible a 320px, teclado y ambos temas sin desbordamiento horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await seed(page)
  await edit(page)
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Borrador para revisar el diálogo')
  for (const theme of ['Oscuro', 'Claro']) {
    await page.getByText('Apariencia', { exact: true }).click()
    await page.getByRole('radio', { name: theme, exact: true }).check()
    await page.getByText('Apariencia', { exact: true }).click()
    await page
      .getByRole('button', { name: 'Calificaciones', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Cambios sin guardar' })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Seguir editando' }),
    ).toBeFocused()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  }
})
