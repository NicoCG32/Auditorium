import { openAlbumArea, openExperience } from './helpers/library-navigation'
import {
  openLibraryOptions,
  openLibraryFilters,
} from './helpers/library-navigation'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { parseBackupText, serializeBackup } from '../src/domain/backup'
import { makeBackup } from '../src/domain/backup.fixture'
import { fixtureId, ids } from '../src/domain/catalog/catalog.fixture'

// These flows use isolated, fictitious libraries. Real service-worker offline
// reloads remain covered by persistence.spec.ts and pwa.spec.ts.
test.use({ serviceWorkers: 'block' })

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQs6n4DwADIAHS+lr7fQAAAABJRU5ErkJggg==',
  'base64',
)

async function suggestionSeed(page: Page, repeatedCredit = false) {
  const backup = makeBackup()
  backup.data.catalog.albums[0]!.genres = ['Death Metal', 'Power Metal']
  backup.data.catalog.artists[0]!.name = 'Banda Delta'
  backup.data.catalog.artists[0]!.country = 'Chile'
  if (repeatedCredit)
    backup.data.catalog.albumArtists.push({
      ...backup.data.catalog.albumArtists[0]!,
      role: 'collaborator',
      position: 2,
    })
  backup.data.catalog.artists.push({
    id: fixtureId(15000),
    name: 'Banda Delta',
    country: 'Perú',
    catalogScope: 'personal',
  })
  backup.data.catalog.albums.push({
    ...backup.data.catalog.albums[0]!,
    id: fixtureId(15001),
    title: 'Disco Del Norte',
  })
  backup.data.catalog.albumArtists.push({
    albumId: fixtureId(15001),
    artistId: fixtureId(15000),
    position: 1,
    role: 'primary',
  })
  await ready(page)
  await restore(page, serializeBackup(backup))
  return backup
}

test('autocompleta bandas y géneros offline, edita el fragmento central y conserva identidad al recargar', async ({
  page,
  context,
}) => {
  await suggestionSeed(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  const artist = page.getByRole('combobox', { name: 'Artista', exact: true })
  await artist.fill('ban')
  await expect(
    page
      .getByRole('listbox', { name: 'Artistas del catálogo local' })
      .getByRole('option'),
  ).toHaveCount(2)
  await artist.press('ArrowUp')
  await artist.press('Enter')
  await expect(artist).toHaveValue('Banda Delta')
  await expect(
    page.getByRole('heading', { name: 'Añadir álbum', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Disco Con Sugerencias')
  await page
    .getByText('Detalles del álbum (opcionales)', { exact: true })
    .click()
  const genres = page.getByRole('combobox', {
    name: 'Géneros (separados por comas)',
  })
  await genres.fill('Rock, De, Power Metal')
  await genres.press('Home')
  for (let step = 0; step < 8; step++) await genres.press('ArrowRight')
  await genres.press('ArrowDown')
  await genres.press('Enter')
  await expect(genres).toHaveValue('Rock, Death Metal, Power Metal')
  await genres.fill('Death Metal, De')
  await expect(genres).toHaveAttribute('aria-expanded', 'false')
  await genres.fill('Death Metal, Po')
  await genres.press('ArrowDown')
  await genres.press('Escape')
  await expect(genres).toHaveValue('Death Metal, Po')
  await genres.press('ArrowDown')
  await genres.press('Tab')
  await expect(genres).toHaveValue('Death Metal, Po')
  await genres.fill('Death Metal, Po')
  await genres.press('End')
  await genres.press('ArrowDown')
  await expect(genres).toHaveAttribute('aria-activedescendant', /option/u)
  await genres.press('Enter')
  await expect(
    page.getByRole('heading', { name: 'Añadir álbum', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Disco Con Sugerencias', exact: true }),
  ).toBeVisible()
  await context.setOffline(false)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Disco Con Sugerencias', exact: true }),
  ).toBeVisible()
  const backup = await exportBackup(page)
  const album = backup.data.catalog.albums.find(
    (row) => row.title === 'Disco Con Sugerencias',
  )!
  expect(album.genres).toEqual(['Death Metal', 'Power Metal'])
  expect(backup.data.catalog.artists).toHaveLength(2)
  expect(
    backup.data.catalog.albumArtists.find((row) => row.albumId === album.id)
      ?.artistId,
  ).toBe(fixtureId(15000))
})

test('edición reutiliza otra banda sin duplicarla y cancelar no persiste sugerencias', async ({
  page,
}) => {
  await suggestionSeed(page, true)
  const original = await exportBackup(page)
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await editor(page)
  const artist = page.getByRole('combobox', { name: 'Artista 1', exact: true })
  await artist.press('End')
  await artist.press('ArrowDown')
  await page
    .getByRole('listbox', { name: 'Artistas del catálogo local 1' })
    .getByRole('option', { name: /Perú/u })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'País de origen 1', exact: true }),
  ).toHaveValue('Perú')
  await expect(
    page.getByRole('textbox', { name: 'País de origen 1', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Cancelar edición', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click()
  expect((await exportBackup(page)).data).toEqual(original.data)
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await editor(page)
  await artist.press('End')
  await artist.press('ArrowDown')
  await page
    .getByRole('listbox', { name: 'Artistas del catálogo local 1' })
    .getByRole('option', { name: /Perú/u })
    .click()
  const genres = page.getByRole('combobox', {
    name: 'Géneros (separados por comas)',
  })
  await genres.fill('De')
  await genres.press('ArrowDown')
  await expect(genres).toHaveAttribute('aria-activedescendant', /option/u)
  await genres.press('Enter')
  await expect(
    page.getByRole('heading', { name: 'Editar álbum', exact: true }),
  ).toBeVisible()
  await artist.fill('  BANDA   DELTA ')
  await expect(
    page.getByRole('textbox', { name: 'País de origen 1', exact: true }),
  ).toBeDisabled()
  await save(page)
  const after = await exportBackup(page)
  expect(after.data.catalog.artists).toEqual(original.data.catalog.artists)
  expect(after.data.library).toEqual(original.data.library)
  expect(
    after.data.catalog.albumArtists.find(
      (row) => row.albumId === ids.album && row.role === 'collaborator',
    ),
  ).toEqual(
    original.data.catalog.albumArtists.find(
      (row) => row.albumId === ids.album && row.role === 'collaborator',
    ),
  )
  expect(
    after.data.catalog.albumArtists.find(
      (row) => row.albumId === ids.album && row.role === 'primary',
    )?.artistId,
  ).toBe(fixtureId(15000))
  expect(
    after.data.catalog.albumArtists.filter((row) => row.albumId !== ids.album),
  ).toEqual(
    original.data.catalog.albumArtists.filter(
      (row) => row.albumId !== ids.album,
    ),
  )
})

test('sugerencias accesibles a320px en ambos temas y créditos múltiples con selección táctil', async ({
  page,
  browser,
  browserName,
}, info) => {
  await page.setViewportSize({ width: 320, height: 850 })
  await suggestionSeed(page)
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
    await page
      .getByRole('button', { name: 'Añadir álbum', exact: true })
      .click()
    const artist = page.getByRole('combobox', { name: 'Artista', exact: true })
    await artist.fill('Ban')
    await accessible(page)
    await page.screenshot({
      path: info.outputPath(`sugerencias-${theme}-320.png`),
      fullPage: true,
    })
    await artist.press('Escape')
    await page.getByRole('button', { name: 'Añadir otro artista' }).click()
    const credit = page.getByRole('combobox', {
      name: 'Nombre del artista 2',
      exact: true,
    })
    await credit.fill('ban')
    const option = page
      .getByRole('listbox', { name: 'Artistas del catálogo local 2' })
      .getByRole('option', { name: /Perú/u })
    await option.click()
    await expect(credit).toHaveValue('Banda Delta')
    await expect(
      page.getByRole('radio', { name: /Usar Banda Delta Perú/u }),
    ).toBeChecked()
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible())
      await dialog
        .getByRole('button', { name: 'Descartar cambios', exact: true })
        .click()
    await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  }
  if (browserName === 'chromium') {
    const touch = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      hasTouch: true,
      viewport: { width: 320, height: 850 },
      serviceWorkers: 'block',
    })
    try {
      const mobile = await touch.newPage()
      await suggestionSeed(mobile)
      await mobile
        .getByRole('button', { name: 'Añadir álbum', exact: true })
        .tap()
      const artist = mobile.getByRole('combobox', {
        name: 'Artista',
        exact: true,
      })
      await artist.fill('Ban')
      await mobile
        .getByRole('listbox', { name: 'Artistas del catálogo local' })
        .getByRole('option', { name: /Perú/u })
        .tap()
      await expect(artist).toHaveValue('Banda Delta')
      await expect(
        mobile.getByRole('radio', { name: /Usar Banda Delta Perú/u }),
      ).toBeChecked()
    } finally {
      await touch.close()
    }
  }
})

test('capitaliza alta y edición, conserva IDs al recargar y revisa coincidencias de mayúsculas', async ({
  page,
}) => {
  await ready(page)
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByText('Detalles del álbum (opcionales)', { exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Artista', exact: true })
    .fill('conjunto del sur')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('canción del océano')
  await page
    .getByRole('combobox', { name: 'Géneros (separados por comas)' })
    .fill('metal progresivo, METAL   PROGRESIVO, EDM')
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
    .getByText('Detalles del álbum (opcionales)', { exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Artista', exact: true })
    .fill('Conjunto del SUR')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('CANCIÓN DEL OCÉANO')
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
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON sin audio' })
    .click()
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
  await page
    .getByText('Detalles del álbum (opcionales)', { exact: true })
    .click()
  await page
    .getByRole('combobox', { name: 'Artista', exact: true })
    .fill(artist)
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill(title)
  await page
    .getByRole('combobox', { name: 'Géneros (separados por comas)' })
    .fill(genres)
  await page
    .getByRole('textbox', {
      name: 'País de origen de la banda o artista',
      exact: true,
    })
    .fill(country)
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
    .getByRole('combobox', { name: 'Tipo principal', exact: true })
    .selectOption('ep')
  await page
    .getByRole('textbox', { name: 'Año original', exact: true })
    .fill('2001')
  await page
    .getByRole('combobox', { name: 'Géneros (separados por comas)' })
    .fill('Metal Progresivo, Jazz')
  await page
    .getByRole('textbox', { name: 'País de origen 1', exact: true })
    .fill('Chile')
  await page
    .getByRole('textbox', { name: 'Descripción del álbum', exact: true })
    .fill('Descripción corregida ficticia.')
  await save(page)
  await openExperience(page)
  await expect(
    page.getByRole('textbox', { name: 'Nota del álbum', exact: true }),
  ).toHaveValue('9,5')
  await openExperience(page)
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
  await openAlbumArea(page, 'data')
  await expect(
    page.getByText('Metal Progresivo · Jazz', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Umbral Eléctrico: Chile', { exact: true }),
  ).toBeVisible()
  const after = await exportBackup(page)
  expect(after.schemaVersion).toBe(7)
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
    primaryType: 'ep',
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
  expect(backup.schemaVersion).toBe(7)
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
      .getByRole('combobox', { name: 'Géneros (separados por comas)' })
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
