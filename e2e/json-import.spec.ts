import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { makeBackup } from '../src/domain/backup.fixture'
import { parseBackupText, serializeBackup } from '../src/domain/backup'
import { fixtureId, ids } from '../src/domain/catalog/catalog.fixture'
import { openLibraryOptions } from './helpers/library-navigation'

test.use({ serviceWorkers: 'block', actionTimeout: 10_000 })
async function backups(page: Page) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Respaldos de tu biblioteca' }),
  ).toBeVisible()
}
function catalog() {
  return {
    format: 'auditorium-catalog',
    schemaVersion: 1,
    artists: [{ id: ids.artist, name: 'Umbral Eléctrico' }],
    albums: [
      {
        id: fixtureId(1500),
        title: 'nuevo horizonte',
        artistIds: [ids.artist],
        primaryType: 'full_length',
        categories: [],
        publicationStatus: 'published',
        genres: ['death metal'],
        originalYear: 2026,
      },
    ],
  }
}
async function upload(page: Page, value: unknown) {
  await page.locator('#json-import-file').setInputFiles({
    name: 'catalogo-ficticio.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  })
  await expect(
    page.getByRole('heading', { name: 'Revisar importación' }),
  ).toBeVisible()
}
async function snapshot(page: Page) {
  const event = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON sin audio' })
    .click()
  const path = await (await event).path()
  if (!path) throw Error('Falta descarga ficticia')
  return parseBackupText(await readFile(path, 'utf8'))
}
async function restore(page: Page) {
  await page.goto('/')
  await backups(page)
  const source = makeBackup()
  await page.locator('#backup-file').setInputFiles({
    name: 'base-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(source)),
  })
  await page.getByRole('button', { name: 'Confirmar restauración' }).click()
  await expect(
    page.getByRole('heading', { name: 'Tu biblioteca' }),
  ).toBeVisible()
  return source
}

test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
  await request.post('/__test/fail-assets?value=false')
})

test('ejemplo del contrato documentado añade música sin valoraciones', async ({
  page,
}) => {
  const guide = await readFile('docs/IMPORTACION_JSON.md', 'utf8')
  const json = guide.match(/```json\s*\n([\s\S]*?)```/)?.[1]
  if (!json) throw Error('Falta ejemplo documentado')
  await page.goto('/')
  await backups(page)
  await page.locator('#json-import-file').setInputFiles({
    name: 'ejemplo-ficticio.json',
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  })
  await page.getByRole('button', { name: 'Confirmar importación' }).click()
  await expect(
    page.getByRole('button', { name: 'Horizonte De Ejemplo', exact: true }),
  ).toBeVisible()
  await backups(page)
  const result = await snapshot(page)
  expect(result.data.library.albumRatings).toEqual([])
  expect(result.data.library.userAlbums[0]?.listeningStatus).toBe('untracked')
})

test('incorpora catálogo, cancela sin escribir y conserva experiencia en recarga y reimportación', async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).hostname === '127.0.0.1')
      await route.continue()
    else {
      external.push(route.request().url())
      await route.abort()
    }
  })
  const before = await restore(page)
  await backups(page)
  await upload(page, catalog())
  await expect(
    page.getByRole('button', { name: 'Cancelar importación' }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('#json-import-file')).toBeFocused()
  expect((await snapshot(page)).data).toEqual(before.data)
  await upload(page, catalog())
  await page.getByRole('button', { name: 'Confirmar importación' }).click()
  await expect(
    page.getByRole('button', { name: 'Nuevo Horizonte', exact: true }),
  ).toBeVisible()
  await page.reload()
  await backups(page)
  const after = await snapshot(page)
  expect(after.data.identity).toEqual(before.data.identity)
  expect(after.data.library.albumRatings).toEqual(
    before.data.library.albumRatings,
  )
  expect(after.data.library.ownedItems).toEqual(before.data.library.ownedItems)
  expect(after.data.catalog.tracks).toEqual(before.data.catalog.tracks)
  expect(
    after.data.library.userAlbums.find((row) => row.albumId === fixtureId(1500))
      ?.listeningStatus,
  ).toBe('untracked')
  await upload(page, catalog())
  await expect(page.getByText(/0 conflictos o coincidencias/)).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar importación' }).click()
  await backups(page)
  expect((await snapshot(page)).data).toEqual(after.data)
  expect(errors).toEqual([])
  expect(external).toEqual([])
})

test('nota conflictiva exige elegir y la revisión se adapta a 320px con teclado y axe', async ({
  page,
}) => {
  await restore(page)
  await backups(page)
  const changed = makeBackup()
  changed.data.library.albumRatings[0]!.scoreUnits = 2
  await upload(page, changed)
  await page.setViewportSize({ width: 320, height: 900 })
  await expect(
    page.getByRole('button', { name: 'Confirmar importación' }),
  ).toBeDisabled()
  await expect(page.getByText('Nota: 9,5 / 10')).toBeVisible()
  await expect(page.getByText('Nota: 1 / 10')).toBeVisible()
  const check = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(check.violations).toEqual([])
  await page.screenshot({
    path: test.info().outputPath('revision-json-320.png'),
    fullPage: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  )
  const decision = page.getByRole('combobox', {
    name: /Decisión: Nota general/,
  })
  await decision.focus()
  await decision.selectOption('incoming')
  await page.getByRole('button', { name: 'Confirmar importación' }).click()
  await backups(page)
  expect((await snapshot(page)).data.library.albumRatings[0]?.scoreUnits).toBe(
    2,
  )
})

test('identidad homónima y álbum duplicado se deciden antes de añadir', async ({
  page,
}) => {
  const before = await restore(page)
  await backups(page)
  const input = catalog()
  input.artists[0]!.id = fixtureId(1600)
  input.albums[0]!.artistIds = [fixtureId(1600)]
  input.albums[0]!.title = 'Eclipse'
  await upload(page, input)
  await expect(
    page.getByRole('button', { name: 'Confirmar importación' }),
  ).toBeDisabled()
  await page
    .getByRole('combobox', { name: /Decisión: Posible álbum duplicado/ })
    .selectOption('skip')
  await page.getByRole('button', { name: 'Confirmar importación' }).click()
  await backups(page)
  expect((await snapshot(page)).data).toEqual(before.data)
})
