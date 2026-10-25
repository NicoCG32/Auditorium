import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { parseBackupText } from '../src/domain/backup'
import { openLibraryOptions } from './helpers/library-navigation'

test.use({ serviceWorkers: 'block' })

test('alta mínima, créditos múltiples y clasificación independiente hasta ficha y edición', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await expect(
    page.getByRole('combobox', { name: 'Tipo principal' }),
  ).toBeHidden()
  await page
    .getByRole('textbox', { name: 'Artista', exact: true })
    .fill('Umbral Ficticio')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Ecos Del Sur')
  await page
    .getByRole('button', { name: 'Continuar con el registro manual' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Revisar y guardar' }),
  ).toBeFocused()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: info.outputPath('alta-minima.png'),
    fullPage: true,
  })
  await page
    .getByRole('region', { name: 'Añadir álbum', exact: true })
    .screenshot({ path: info.outputPath('alta-formulario.png') })
  await page.getByRole('button', { name: 'Añadir otro artista' }).click()
  await expect(
    page.getByRole('textbox', { name: 'Nombre del artista 2', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('textbox', { name: 'Nombre del artista 2', exact: true })
    .fill('Otra Banda Ficticia')
  await expect(
    page.getByRole('textbox', { name: 'Artista', exact: true }),
  ).toHaveValue('Umbral Ficticio · Otra Banda Ficticia')
  await page.getByRole('button', { name: 'Añadir otro artista' }).click()
  await page
    .getByRole('button', { name: 'Quitar artista 3', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Nombre del artista 3', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('combobox', { name: 'Tipo principal' })
    .selectOption('ep')
  await page.getByRole('checkbox', { name: 'Demo', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Split', exact: true }).check()
  await page
    .getByRole('combobox', { name: 'Estado de publicación' })
    .selectOption('unreleased')
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Ecos Del Sur', exact: true }),
  ).toBeFocused()
  await expect(
    page.getByText('EP · Demo · Split · Inédito', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Editar álbum', exact: true }),
  ).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({
    path: info.outputPath('ficha-clasificada.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Editar álbum', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Tipo principal' })
    .selectOption('full_length')
  await page.getByRole('checkbox', { name: 'Demo', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: 'En vivo', exact: true }).check()
  await page.getByRole('button', { name: 'Guardar cambios del álbum' }).click()
  await expect(
    page.getByText('Full-length · Split · En vivo · Inédito', { exact: true }),
  ).toBeVisible()
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const download = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON sin audio' })
    .click()
  const file = await (await download).path()
  const snapshot = parseBackupText(await readFile(file, 'utf8')).data
  expect(snapshot.catalog.albums).toHaveLength(1)
  expect(snapshot.catalog.artists).toHaveLength(2)
  expect(snapshot.catalog.albumArtists).toHaveLength(2)
  expect(snapshot.catalog.releases).toEqual([])
  expect(snapshot.library.ownedItems).toEqual([])
  expect(snapshot.library.albumRatings).toEqual([])
  expect(snapshot.catalog.albums[0]).toMatchObject({
    primaryType: 'full_length',
    categories: ['split', 'live'],
    publicationStatus: 'unreleased',
  })
})

test('reutilizar artista requiere elección y una coincidencia local vuelve a su ficha', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Artista', exact: true })
    .fill('Banda Ficticia')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Álbum Ficticio')
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Álbum Ficticio', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Artista', exact: true })
    .fill('banda ficticia')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('álbum ficticio')
  const reuse = page.getByRole('radio', { name: /^Usar Banda Ficticia/ })
  const homonym = page.getByRole('radio', {
    name: 'Es otro artista con este nombre (crear uno nuevo)',
  })
  await expect(reuse).not.toBeChecked()
  await expect(homonym).not.toBeChecked()
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Revisa los campos')
  await reuse.check()
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Coincidencias en tu catálogo local' }),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Abrir álbum existente', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Álbum Ficticio', exact: true }),
  ).toBeFocused()
  await expect(
    page.getByText('Álbum disponible en tu biblioteca.', { exact: true }),
  ).toBeVisible()
})
