import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fixtureId } from '../src/domain/catalog/catalog.fixture'
import { parseBackupText } from '../src/domain/backup'
import { openSettings } from './helpers/library-navigation'

test.use({ serviceWorkers: 'block', actionTimeout: 10_000 })
const artist = {
  id: fixtureId(9000),
  name: 'Grupo de Prueba',
  country: 'CL',
  disambiguation: 'Datos ficticios',
}
const group = (id: number, title: string, secondary: string[] = []) => ({
  id: fixtureId(id),
  title,
  'primary-type': 'Album',
  'secondary-types': secondary,
  'first-release-date': '2001',
  'artist-credit': [{ artist }],
})
async function catalog(page: Page, status = 200) {
  await page.route(
    'https://catalog-test.example/api/musicbrainz/**',
    async (route) => {
      const url = new URL(route.request().url())
      const more = url.searchParams.get('offset') === '2'
      await route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(
          url.pathname.endsWith('/artist')
            ? { artists: [artist] }
            : {
                'release-group-count': 3,
                'release-group-offset': more ? 2 : 0,
                'release-groups': more
                  ? [group(9003, 'Segundo Disco')]
                  : [
                      group(9001, 'Primer Disco'),
                      group(9002, 'Directo de Prueba', ['Live']),
                    ],
              },
        ),
      })
    },
  )
}
async function search(page: Page) {
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('button', { name: 'Buscar discografía', exact: true })
    .click()
  await page.getByLabel('Banda o artista').fill('Grupo de Prueba')
  await page
    .getByRole('button', { name: 'Buscar artista', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Ver discografía de Grupo de Prueba' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Discografía de Grupo de Prueba' }),
  ).toBeVisible()
}
async function backup(page: Page) {
  await openSettings(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const download = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON sin audio' })
    .click()
  const path = await (await download).path()
  if (!path) throw new Error('Falta el respaldo de prueba')
  return parseBackupText(await readFile(path, 'utf8'))
}
test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
  await request.post('/__test/fail-assets?value=false')
})
test('busca, pagina, confirma un lote y reconoce los vínculos al repetir sin duplicar', async ({
  page,
}, testInfo) => {
  await catalog(page)
  await page.goto('/')
  await search(page)
  await expect(
    page.getByRole('checkbox', { name: /Directo de Prueba/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Seleccionar visibles' }).click()
  await page.getByRole('button', { name: 'Cargar más obras' }).click()
  await expect(
    page.getByRole('checkbox', { name: /Segundo Disco/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Seleccionar visibles' }).click()
  await page.getByRole('button', { name: 'Revisar importación' }).click()
  await expect(
    page.getByRole('heading', { name: 'Confirma tu selección' }),
  ).toBeFocused()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: testInfo.outputPath('discography-preview.jpg'),
    fullPage: true,
  })
  await expect(
    page.getByText('2 álbumes nuevos · 0 álbumes existentes para vincular.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar importación' }).click()
  await expect(
    page.getByRole('heading', { name: 'Mi colección', exact: true }),
  ).toBeVisible()
  const first = await backup(page)
  expect(first.schemaVersion).toBe(9)
  expect(first.data.catalog.albums).toHaveLength(2)
  expect(
    first.data.library.userAlbums.every(
      (row) => row.listeningStatus === 'untracked',
    ),
  ).toBe(true)
  expect(first.data.library.ownedItems).toEqual([])
  expect(
    first.data.catalog.albums.map((row) => row.musicBrainz?.id).sort(),
  ).toEqual([fixtureId(9001), fixtureId(9003)])
  expect(
    first.data.catalog.albums.every((row) => row.id !== row.musicBrainz?.id),
  ).toBe(true)
  await search(page)
  await page.getByRole('button', { name: 'Cargar más obras' }).click()
  await expect(page.getByText('Ya incorporado', { exact: true })).toHaveCount(2)
  await expect(
    page.getByRole('checkbox', { name: /Primer Disco/ }),
  ).toBeDisabled()
  expect((await backup(page)).data).toEqual(first.data)
})
test('móvil: filtros, selección y salida protegida son accesibles y no desbordan', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await catalog(page)
  await page.goto('/')
  await search(page)
  await page.getByRole('checkbox', { name: /Primer Disco/ }).check()
  await page.getByLabel('Mostrar', { exact: true }).selectOption('live')
  await expect(page.getByText(/incluye otros filtros/)).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Seguir editando' }).click()
  await page.getByRole('button', { name: 'Limpiar selección' }).click()
  await expect(
    page.getByRole('button', { name: 'Revisar importación' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Mi colección', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Aún no hay álbumes' }),
  ).toBeVisible()
})
test('la indisponibilidad del servicio conserva el registro manual', async ({
  page,
}) => {
  await catalog(page, 503)
  await page.goto('/#/anadir')
  await page
    .getByRole('button', { name: 'Buscar discografía', exact: true })
    .click()
  await page.getByLabel('Banda o artista').fill('Grupo de Prueba')
  await page
    .getByRole('button', { name: 'Buscar artista', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('solicita esperar')
  await page
    .getByRole('button', { name: 'Registro manual', exact: true })
    .click()
  await expect(
    page.getByRole('combobox', { name: 'Artista', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByRole('textbox', { name: 'Título', exact: true }),
  ).toBeEnabled()
})
