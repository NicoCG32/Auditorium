import {
  openLibraryOptions,
  openLibraryFilters,
} from './helpers/library-navigation'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { parseBackupText, serializeBackup } from '../src/domain/backup'
import { makeBackup } from '../src/domain/backup.fixture'
import { ids } from '../src/domain/catalog/catalog.fixture'

// These flows use isolated, fictitious libraries. Real service-worker offline
// reloads remain covered by persistence.spec.ts and pwa.spec.ts.
test.use({ serviceWorkers: 'block' })

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQs6n4DwADIAHS+lr7fQAAAABJRU5ErkJggg==',
  'base64',
)

test('capitaliza alta y edición, conserva IDs al recargar y revisa coincidencias de mayúsculas', async ({
  page,
}) => {
  await ready(page)
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Artista', exact: true })
    .fill('conjunto del sur')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('canción del océano')
  await page
    .getByRole('textbox', { name: 'Géneros (separados por comas)' })
    .fill('metal progresivo, METAL   PROGRESIVO, EDM')
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Canción Del Océano', exact: true }),
  ).toBeVisible()
  const before = await exportBackup(page)
  expect(before.data.catalog.albums[0]!.genres).toEqual([
    'Metal Progresivo',
    'EDM',
  ])
  expect(before.data.catalog.artists[0]!.name).toBe('Conjunto Del Sur')
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await editor(page, 'Canción Del Océano')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('CANCIÓN DEL OCÉANO')
  await page.locator('input[name="artist-0"]').fill('CONJUNTO DEL SUR')
  await save(page)
  const after = await exportBackup(page)
  expect(after.data).toEqual(before.data)
  await page.reload()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Canción Del Océano', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Artista', exact: true })
    .fill('Conjunto del SUR')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('CANCIÓN DEL OCÉANO')
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await page
    .getByRole('button', { name: 'Abrir álbum existente', exact: true })
    .click()
  const final = await exportBackup(page)
  expect(final.data).toEqual(before.data)
})

async function ready(page: Page) {
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Añadir álbum', exact: true }),
  ).toBeEnabled()
}

async function restore(page: Page, text: string) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'biblioteca-ficticia-edicion.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await page.getByRole('button', { name: 'Confirmar restauración' }).click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
}

async function seed(page: Page) {
  await ready(page)
  await restore(page, serializeBackup(makeBackup()))
}

async function exportBackup(page: Page) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar respaldo JSON' }).click()
  const path = await (await downloading).path()
  if (!path) throw new Error('No se descargó el respaldo ficticio.')
  return parseBackupText(await readFile(path, 'utf8'))
}

async function editor(page: Page, title = 'Eclipse') {
  await page.getByRole('button', { name: title, exact: true }).click()
  await page.getByRole('button', { name: 'Editar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Editar álbum', exact: true }),
  ).toBeFocused()
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Guardar cambios del álbum' }).click()
  await expect(
    page.getByText('Datos del álbum guardados.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Editar álbum', exact: true }),
  ).toBeFocused()
}

async function back(page: Page) {
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
}

async function add(
  page: Page,
  title: string,
  artist: string,
  genres: string,
  country: string,
) {
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page.getByRole('textbox', { name: 'Artista', exact: true }).fill(artist)
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill(title)
  await page
    .getByRole('textbox', { name: 'Géneros (separados por comas)' })
    .fill(genres)
  await page
    .getByRole('textbox', {
      name: 'País de origen de la banda o artista',
      exact: true,
    })
    .fill(country)
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

test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
  await request.post('/__test/fail-assets?value=false')
})

test('cancelar no escribe y corregir metadatos conserva identidad, notas, valoraciones y relaciones', async ({
  page,
}) => {
  const before = makeBackup()
  await seed(page)
  await editor(page)
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Borrador descartado ficticio')
  await page
    .getByRole('textbox', { name: 'País de origen 1', exact: true })
    .fill('País descartado ficticio')
  await page.getByRole('button', { name: 'Cancelar edición' }).click()
  await page
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  expect((await exportBackup(page)).data).toEqual(before.data)
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
  await editor(page)
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Eclipse Corregido Ficticio')
  await page
    .getByRole('combobox', { name: 'Tipo', exact: true })
    .selectOption('ep')
  await page
    .getByRole('textbox', { name: 'Año original', exact: true })
    .fill('2001')
  await page
    .getByRole('textbox', { name: 'Géneros (separados por comas)' })
    .fill('Metal Progresivo, Jazz')
  await page
    .getByRole('textbox', { name: 'País de origen 1', exact: true })
    .fill('Chile')
  await page
    .getByRole('textbox', { name: 'Descripción del álbum', exact: true })
    .fill('Descripción corregida ficticia.')
  await save(page)
  await expect(
    page.getByRole('textbox', { name: 'Nota del álbum', exact: true }),
  ).toHaveValue('9,5')
  await expect(
    page.getByRole('textbox', { name: 'Notas personales', exact: true }),
  ).toHaveValue('  Comentario ficticio.\nSegunda línea.  ')
  await page.reload()
  await expect(
    page.getByRole('heading', {
      name: 'Eclipse Corregido Ficticio',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByText('Metal Progresivo · Jazz', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Umbral Eléctrico: Chile', { exact: true }),
  ).toBeVisible()
  const after = await exportBackup(page)
  expect(after.schemaVersion).toBe(4)
  expect(after.data.identity).toEqual(before.data.identity)
  expect(after.data.library).toEqual(before.data.library)
  for (const key of [
    'albumArtists',
    'tracks',
    'coreTracks',
    'releases',
    'releaseTracks',
  ] as const)
    expect(after.data.catalog[key]).toEqual(before.data.catalog[key])
  expect(
    after.data.catalog.albums.find((album) => album.id === ids.album),
  ).toMatchObject({
    id: ids.album,
    title: 'Eclipse Corregido Ficticio',
    originalYear: 2001,
    releaseType: 'ep',
    genres: ['Metal Progresivo', 'Jazz'],
  })
  expect(
    after.data.catalog.albums.find((album) => album.id === ids.otherAlbum),
  ).toEqual(
    before.data.catalog.albums.find((album) => album.id === ids.otherAlbum),
  )
  expect(after.data.catalog.artists).toEqual(
    before.data.catalog.artists.map((artist) => ({
      ...artist,
      country: 'Chile',
    })),
  )
})

test('géneros y países se combinan con búsqueda, orden y vistas sin cambiar la biblioteca', async ({
  page,
}) => {
  await ready(page)
  await add(
    page,
    'Álbum De Jazz Ficticio',
    'Conjunto Jazz Ficticio',
    'Jazz, Fusión',
    'Chile',
  )
  await add(
    page,
    'Álbum De Metal Ficticio',
    'Conjunto Metal Ficticio',
    'Metal',
    'Suecia',
  )
  const before = await exportBackup(page)
  await page
    .getByRole('button', { name: 'Volver a biblioteca', exact: true })
    .click()
  await openLibraryFilters(page)
  await page
    .getByRole('combobox', { name: 'Género', exact: true })
    .selectOption('jazz')
  await openLibraryFilters(page)
  await page
    .getByRole('combobox', { name: 'País de origen', exact: true })
    .selectOption('chile')
  await page.getByRole('searchbox').fill('FUSION CHILE')
  await expect(
    page.getByRole('button', { name: 'Álbum De Jazz Ficticio', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Álbum De Metal Ficticio', exact: true }),
  ).toHaveCount(0)
  await openLibraryFilters(page)
  await page
    .getByRole('combobox', { name: 'País de origen', exact: true })
    .selectOption('suecia')
  await expect(
    page.getByRole('heading', { name: 'No encontramos coincidencias' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Mostrar todos los álbumes' }).click()
  await openLibraryFilters(page)
  await expect(
    page.getByRole('combobox', { name: 'Género', exact: true }),
  ).toHaveValue('')
  await openLibraryFilters(page)
  await expect(
    page.getByRole('combobox', { name: 'País de origen', exact: true }),
  ).toHaveValue('')
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page
    .getByRole('combobox', { name: 'Ordenar por' })
    .selectOption('genre')
  const titles = page
    .getByRole('list', { name: 'Álbumes de tu biblioteca' })
    .getByRole('heading', { level: 2 })
  await expect(titles).toHaveText([
    'Álbum De Jazz Ficticio',
    'Álbum De Metal Ficticio',
  ])
  await page
    .getByRole('combobox', { name: 'Ordenar por' })
    .selectOption('country')
  await page.getByRole('button', { name: 'Cuadrícula', exact: true }).click()
  await expect(titles).toHaveText([
    'Álbum De Jazz Ficticio',
    'Álbum De Metal Ficticio',
  ])
  expect((await exportBackup(page)).data).toEqual(before.data)
})

test('PNG local se valida, carga automáticamente, persiste al recargar y restaura su respaldo3 sin conexión', async ({
  page,
  context,
  browser,
}) => {
  await seed(page)
  await editor(page)
  const input = page.getByLabel('Archivo de portada (JPG o PNG)', {
    exact: true,
  })
  await input.setInputFiles({
    name: 'portada-grande-ficticia.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
  })
  await expect(
    page.getByText('La portada puede ocupar como máximo 2 MiB.', {
      exact: true,
    }),
  ).toBeVisible()
  await input.setInputFiles({
    name: 'portada-ficticia.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(
    page.getByRole('img', { name: 'Portada de vista previa' }),
  ).toBeVisible()
  await save(page)
  const cover = page.getByRole('img', {
    name: 'Portada de Eclipse',
    exact: true,
  })
  await expect(cover).toBeVisible()
  await expect(cover).toHaveAttribute(
    'src',
    `data:image/png;base64,${png.toString('base64')}`,
  )
  await expect(
    page.getByRole('button', { name: 'Mostrar portada' }),
  ).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  await expect(cover).toBeVisible()
  await context.setOffline(true)
  const backup = await exportBackup(page)
  expect(backup.schemaVersion).toBe(4)
  expect(
    backup.data.catalog.albums.find((album) => album.id === ids.album)
      ?.coverImage,
  ).toBe(`data:image/png;base64,${png.toString('base64')}`)
  const destination = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    serviceWorkers: 'block',
  })
  try {
    const restored = await destination.newPage()
    await ready(restored)
    await destination.setOffline(true)
    await restore(restored, serializeBackup(backup))
    await restored.getByRole('button', { name: 'Eclipse', exact: true }).click()
    await expect(
      restored.getByRole('img', { name: 'Portada de Eclipse', exact: true }),
    ).toBeVisible()
    expect((await exportBackup(restored)).data).toEqual(backup.data)
  } finally {
    await destination.close()
    await context.setOffline(false)
  }
})

test('edición y nuevos filtros son accesibles a360px en los dos temas', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 360, height: 900 })
  await seed(page)
  for (const theme of ['dark', 'light'] as const) {
    const appearance = page.locator('details.appearance-panel')
    await appearance.locator('summary').click()
    await appearance
      .getByRole('radio', {
        name: theme === 'dark' ? 'Oscuro' : 'Claro',
        exact: true,
      })
      .check()
    await appearance.locator('summary').click()
    await editor(page)
    await page
      .getByRole('textbox', { name: 'Géneros (separados por comas)' })
      .fill('Rock, Metal')
    await page
      .getByRole('textbox', { name: 'País de origen 1', exact: true })
      .fill('Chile')
    await accessible(page)
    await save(page)
    await back(page)
    await openLibraryFilters(page)
    await page
      .getByRole('combobox', { name: 'Género', exact: true })
      .selectOption('metal')
    await openLibraryFilters(page)
    await page
      .getByRole('combobox', { name: 'País de origen', exact: true })
      .selectOption('chile')
    await accessible(page)
  }
})

async function accessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  )
}
