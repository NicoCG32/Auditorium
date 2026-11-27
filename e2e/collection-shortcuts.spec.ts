import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseBackupText, serializeBackup } from '../src/domain/backup'
import {
  collectionShortcutsBackup,
  shortcutsIds,
} from '../src/test/collection-shortcuts.fixture'
import { libraryIds } from '../src/domain/library/library.fixture'
import { openSettings } from './helpers/library-navigation'

test.use({ serviceWorkers: 'block' })
const albums = (page: Page) =>
  page.getByRole('list', { name: 'Álbumes de tu biblioteca' })
const selection = (page: Page) =>
  page.getByRole('region', { name: 'Seleccionar álbumes' })
async function seed(page: Page) {
  const backup = collectionShortcutsBackup()
  await page.goto('/')
  await openSettings(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'colección-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(backup)),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Mi colección', exact: true }),
  ).toBeVisible()
  await expect(albums(page).getByRole('heading')).toHaveCount(4)
  if (test.info().project.name === 'chromium') {
    await mkdir('.vitest', { recursive: true })
    await writeFile(
      '.vitest/collection-shortcuts-demo.json',
      serializeBackup(backup),
    )
  }
  return backup
}
async function exported(page: Page) {
  await openSettings(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('button', {
      name: 'Descargar respaldo JSON sin audio',
      exact: true,
    })
    .click()
  const path = await (await downloading).path()
  if (!path) throw new Error('Falta el respaldo ficticio')
  return parseBackupText(await readFile(path, 'utf8'))
}

test('seleccionar, revisar y registrar formatos conserva copias previas y excluye álbumes retirados', async ({
  page,
}) => {
  const before = await seed(page)
  await page.getByRole('button', { name: 'Seleccionar', exact: true }).click()
  await page
    .getByRole('button', { name: 'Seleccionar visibles', exact: true })
    .click()
  await expect(selection(page)).toContainText('4 álbumes seleccionados')
  await page
    .getByRole('combobox', { name: 'Ordenar por' })
    .selectOption('title')
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await expect(selection(page)).toContainText('4 álbumes seleccionados')
  await selection(page)
    .getByRole('button', { name: 'Lo tengo', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Actualizar 4 álbumes' })
  await expect(dialog).toContainText(
    '3 álbumes cambiarán · 1 ya está actualizado',
  )
  await expect(
    dialog.getByRole('listitem').filter({ hasText: 'Eclipse' }),
  ).toContainText('Ya tienes CD')
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(
    selection(page).getByRole('button', { name: 'Lo tengo', exact: true }),
  ).toBeFocused()
  await selection(page)
    .getByRole('button', { name: 'Lo tengo', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'Confirmar cambios', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByText('Cambios guardados en 3 álbumes. 1 ya estaba actualizado.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Seleccionar', exact: true }),
  ).toBeFocused()
  await page.getByRole('button', { name: /^Físico 4$/ }).click()
  await page
    .getByRole('combobox', { name: 'Formato físico', exact: true })
    .selectOption('cd')
  await expect(albums(page).getByRole('heading')).toHaveCount(4)
  const after = await exported(page)
  expect(after.data.library.ownedItems).toHaveLength(
    before.data.library.ownedItems.length + 3,
  )
  expect(after.data.library.ownedItems).toEqual(
    expect.arrayContaining(before.data.library.ownedItems),
  )
  expect({
    ...after.data,
    library: {
      ...after.data.library,
      ownedItems: before.data.library.ownedItems,
    },
  }).toEqual(before.data)
})

test('cambiar filtros vacía la selección y las acciones rápidas aplican deseos o escucha sólo a los discos revisados', async ({
  page,
}) => {
  const before = await seed(page)
  await page.getByRole('button', { name: 'Seleccionar', exact: true }).click()
  await page
    .getByRole('button', { name: 'Seleccionar visibles', exact: true })
    .click()
  await page.getByRole('button', { name: /^Digital 1$/ }).click()
  await expect(selection(page)).toContainText('0 álbumes seleccionados')
  await expect(
    selection(page).getByRole('button', { name: 'Escucha', exact: true }),
  ).toBeDisabled()
  await albums(page)
    .getByRole('button', { name: 'Otra órbita', exact: true })
    .click()
  await expect(selection(page)).toContainText('1 álbum seleccionado')
  await page
    .getByRole('searchbox', { name: 'Buscar en tu biblioteca' })
    .fill('Otra')
  await expect(selection(page)).toContainText('0 álbumes seleccionados')
  await page
    .getByRole('button', { name: 'Seleccionar visibles', exact: true })
    .click()
  await selection(page)
    .getByRole('button', { name: 'Escucha', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Actualizar un álbum' })
  await dialog
    .getByRole('combobox', { name: 'Estado de escucha', exact: true })
    .selectOption('queued')
  await expect(dialog).toContainText('1 álbum cambiará')
  await dialog
    .getByRole('button', { name: 'Confirmar cambios', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  await page
    .getByRole('button', { name: 'Limpiar búsqueda y filtros', exact: true })
    .click()
  const quick = page.getByRole('button', {
    name: 'Acciones de Eclipse',
    exact: true,
  })
  await quick.focus()
  await quick.press('Enter')
  await dialog.getByRole('button', { name: 'Lo quiero', exact: true }).click()
  await dialog
    .getByRole('combobox', { name: 'Formato', exact: true })
    .selectOption('vinyl')
  await expect(dialog).toContainText('Ya está en deseos')
  await expect(
    dialog.getByRole('button', { name: 'Confirmar cambios', exact: true }),
  ).toBeDisabled()
  await dialog
    .getByRole('button', { name: 'Cancelar', exact: true })
    .press('Escape')
  await expect(quick).toBeFocused()
  await page
    .getByRole('button', {
      name: 'Acciones de Ritos del horizonte',
      exact: true,
    })
    .focus()
  await page
    .getByRole('button', {
      name: 'Acciones de Ritos del horizonte',
      exact: true,
    })
    .press('Enter')
  await dialog.getByRole('button', { name: 'Lo quiero', exact: true }).click()
  await dialog
    .getByRole('combobox', { name: 'Formato', exact: true })
    .selectOption('digital')
  await expect(dialog).toContainText('1 álbum cambiará')
  await dialog
    .getByRole('button', { name: 'Confirmar cambios', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  const after = await exported(page)
  expect(after.data.library.ownedItems).toEqual(before.data.library.ownedItems)
  expect(after.data.library.purchaseWishes).toHaveLength(
    before.data.library.purchaseWishes.length + 1,
  )
  expect(after.data.library.purchaseWishes).toContainEqual(
    expect.objectContaining({
      userAlbumId: shortcutsIds.empty,
      targetFormat: 'digital',
      status: 'active',
    }),
  )
  expect(after.data.library.userAlbums).toEqual(
    before.data.library.userAlbums.map((entry) =>
      entry.id === libraryIds.otherEntry
        ? { ...entry, listeningStatus: 'queued', updatedAt: expect.any(String) }
        : entry,
    ),
  )
})

test('una vista con nombre recupera filtros, formato, orden y presentación tras volver o reabrir; renombrar y deshacer no tocan datos musicales', async ({
  page,
}) => {
  const before = await seed(page)
  await page.getByRole('button', { name: /^Físico 2$/ }).click()
  await page
    .getByRole('combobox', { name: 'Formato físico', exact: true })
    .selectOption('vinyl')
  await expect(albums(page).getByRole('heading')).toHaveText(['Jardín lunar'])
  await page
    .getByRole('combobox', { name: 'Ordenar por' })
    .selectOption('title')
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page
    .getByRole('button', { name: 'Vistas guardadas', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Vistas guardadas',
    exact: true,
  })
  await dialog
    .getByRole('button', { name: 'Guardar vista actual', exact: true })
    .click()
  await expect(
    dialog.getByRole('textbox', { name: 'Nombre de la vista', exact: true }),
  ).toBeFocused()
  await dialog
    .getByRole('textbox', { name: 'Nombre de la vista', exact: true })
    .fill('Mis vinilos')
  await dialog
    .getByRole('button', { name: 'Guardar vista', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Vistas guardadas', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Abrir ficha de Jardín lunar', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
  await expect(
    page.getByRole('combobox', { name: 'Formato físico', exact: true }),
  ).toHaveValue('vinyl')
  await page.reload()
  await expect(albums(page).getByRole('heading')).toHaveCount(4)
  await page.getByRole('button', { name: 'Cuadrícula', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Ordenar por' })
    .selectOption('artist')
  await page
    .getByRole('button', { name: 'Vistas guardadas', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Mis vinilos', exact: true }).click()
  await expect(albums(page).getByRole('heading')).toHaveText(['Jardín lunar'])
  await expect(
    page.getByRole('combobox', { name: 'Formato físico', exact: true }),
  ).toHaveValue('vinyl')
  await expect(page.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue(
    'title',
  )
  await expect(
    page.getByRole('button', { name: 'Lista', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page
    .getByRole('button', { name: 'Vistas guardadas', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'Cambiar nombre de Mis vinilos', exact: true })
    .click()
  await dialog
    .getByRole('textbox', { name: 'Nombre de la vista', exact: true })
    .fill('Vinilos de casa')
  await dialog
    .getByRole('button', { name: 'Guardar nombre', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Vistas guardadas', exact: true })
    .click()
  await dialog
    .getByRole('button', {
      name: 'Eliminar vista Vinilos de casa',
      exact: true,
    })
    .click()
  await expect(
    dialog.getByText('Vista «Vinilos de casa» eliminada.', { exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: /^Vinilos de casa/ }),
  ).toBeVisible()
  await dialog
    .getByRole('button', { name: 'Cerrar vistas guardadas', exact: true })
    .click()
  expect((await exported(page)).data).toEqual(before.data)
})

test('acciones y vistas son legibles por teclado, a 320 px y con texto al 200 % en ambos temas', async ({
  page,
}) => {
  await seed(page)
  await page.setViewportSize({ width: 320, height: 760 })
  for (const theme of ['dark', 'light'] as const) {
    await openSettings(page)
    await page
      .getByRole('radio', {
        name: theme === 'dark' ? 'Oscuro' : 'Claro',
        exact: true,
      })
      .check()
    await page
      .getByRole('button', { name: 'Cerrar ajustes', exact: true })
      .click()
    await page.getByRole('button', { name: 'Seleccionar', exact: true }).click()
    await page
      .getByRole('button', { name: 'Seleccionar visibles', exact: true })
      .click()
    await selection(page)
      .getByRole('button', { name: 'Lo tengo', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Actualizar 4 álbumes' })
    await expect(
      dialog.getByRole('button', { name: 'Confirmar cambios', exact: true }),
    ).toBeEnabled()
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await dialog
      .getByRole('button', { name: 'Cancelar', exact: true })
      .press('Escape')
    await expect(
      selection(page).getByRole('button', { name: 'Lo tengo', exact: true }),
    ).toBeFocused()
    await page
      .getByRole('button', { name: 'Terminar selección', exact: true })
      .click()
  }
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  await page
    .getByRole('button', { name: 'Vistas guardadas', exact: true })
    .click()
  const views = page.getByRole('dialog', {
    name: 'Vistas guardadas',
    exact: true,
  })
  await views
    .getByRole('button', { name: 'Guardar vista actual', exact: true })
    .click()
  await views
    .getByRole('textbox', { name: 'Nombre de la vista', exact: true })
    .fill('Una vista muy personal')
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        [...document.querySelectorAll('dialog[open]')].every(
          (dialog) => dialog.scrollWidth <= dialog.clientWidth,
        ),
    ),
  ).toBe(true)
  await expect(
    views.getByRole('button', { name: 'Guardar vista', exact: true }),
  ).toBeVisible()
  await views.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await views
    .getByRole('button', { name: 'Cerrar vistas guardadas', exact: true })
    .click()
})
