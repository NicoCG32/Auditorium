import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { makeBackup } from '../src/domain/backup.fixture'
import { parseBackupText, serializeBackup } from '../src/domain/backup'
import { fixtureId, ids } from '../src/domain/catalog/catalog.fixture'
import { openAlbumArea, openLibraryOptions } from './helpers/library-navigation'

test.use({ serviceWorkers: 'block', actionTimeout: 10_000 })
const artistId = fixtureId(9000),
  groupId = fixtureId(9001),
  editionId = fixtureId(9010)
const artist = {
  id: artistId,
  name: 'Umbral Eléctrico',
  country: 'CL',
  disambiguation: 'Banda ficticia de prueba',
}
const image =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#223b40"/><circle cx="200" cy="200" r="115" fill="#d4b474"/></svg>'
const edition = {
  id: editionId,
  title: 'Eclipse',
  date: '2001-03',
  country: 'CL',
  disambiguation: 'Edición de prueba',
  barcode: 'TEST-123',
  'release-group': { id: groupId },
  'label-info': [
    { label: { name: 'Sello ficticio' }, 'catalog-number': 'TEST-01' },
  ],
  media: [
    {
      position: 1,
      format: 'CD',
      'track-count': 1,
      tracks: [
        {
          position: 1,
          title: 'Eclipse',
          recording: { id: fixtureId(9020), title: 'Eclipse', length: 180000 },
        },
      ],
    },
    {
      position: 2,
      format: 'CD',
      'track-count': 1,
      tracks: [
        {
          position: 1,
          title: 'Nueva pista',
          recording: { id: fixtureId(9021), title: 'Nueva pista' },
        },
      ],
    },
  ],
}
function sourceGroup(id: string, title: string) {
  return {
    id,
    title,
    'primary-type': 'Album',
    'secondary-types': [],
    'first-release-date': '1998',
    'artist-credit': [{ artist }],
  }
}
async function mockCatalog(page: Page) {
  const state = {
    calls: [] as string[],
    covers: 0,
    failure: false,
    incomplete: false,
    missingCover: false,
  }
  await page.route('https://images.example/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: image }),
  )
  await page.route('https://coverartarchive.org/**', async (route) => {
    state.covers++
    await route.fulfill({
      status: state.missingCover ? 404 : 200,
      contentType: 'image/svg+xml',
      body: state.missingCover ? '' : image,
    })
  })
  await page.route(
    'https://catalog-test.example/api/musicbrainz/**',
    async (route) => {
      const url = new URL(route.request().url())
      state.calls.push(url.pathname + url.search)
      const more = url.searchParams.get('offset') === '1'
      let body: unknown
      if (url.pathname.endsWith('/artist')) body = { artists: [artist] }
      else if (url.pathname.endsWith('/release-group'))
        body = {
          'release-group-count': 2,
          'release-group-offset': 0,
          'release-groups': [
            sourceGroup(groupId, 'Eclipse'),
            sourceGroup(fixtureId(9002), 'Disco nuevo'),
          ],
        }
      else if (url.pathname.endsWith('/release'))
        body = {
          'release-count': 2,
          'release-offset': more ? 1 : 0,
          releases: [
            more
              ? {
                  ...edition,
                  id: fixtureId(9011),
                  disambiguation: 'Otra edición',
                }
              : edition,
          ],
        }
      else
        body = state.incomplete
          ? { ...edition, media: [{ ...edition.media[0], 'track-count': 3 }] }
          : edition
      await route.fulfill({
        status: state.failure ? 503 : 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(body),
      })
    },
  )
  return state
}
async function seed(
  page: Page,
  options: {
    manualArtist?: boolean
    homonym?: boolean
    manualEdition?: boolean
  } = {},
) {
  const before = makeBackup()
  const localArtist = before.data.catalog.artists.find(
    (row) => row.id === ids.artist,
  )!
  if (!options.manualArtist)
    localArtist.musicBrainz = { id: artistId, retrievedAt: before.exportedAt }
  const album = before.data.catalog.albums.find((row) => row.id === ids.album)!
  album.musicBrainz = { id: groupId, retrievedAt: before.exportedAt }
  album.coverUrl = 'https://images.example/current.svg'
  if (options.manualEdition) {
    const original = before.data.catalog.releases.find(
      (row) => row.id === ids.original,
    )!
    original.barcode = edition.barcode
    original.editionLabel = 'Mi edición original'
  }
  if (options.homonym) {
    before.data.catalog.artists.push({
      id: ids.collaborator,
      name: localArtist.name,
      catalogScope: 'personal',
    })
    before.data.catalog.albumArtists.find(
      (row) => row.albumId === ids.otherAlbum,
    )!.artistId = ids.collaborator
    delete before.data.library.userAlbums.find(
      (row) => row.albumId === ids.otherAlbum,
    )!.deletedAt
  }
  await page.goto('/')
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'catalogo-ficticio.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(before)),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  return before
}
async function exported(page: Page) {
  // Return to the header before opening the menu after a long edition review.
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' }),
  )
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const download = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON sin audio' })
    .click()
  const path = await (await download).path()
  if (!path) throw new Error('Falta el respaldo ficticio')
  return parseBackupText(await readFile(path, 'utf8'))
}
async function details(page: Page) {
  await page.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await openAlbumArea(page, 'tracks')
  await page.locator('.catalog-details-toggle > summary').click()
  return page.getByRole('region', { name: 'Completar desde el catálogo' })
}
async function choose(page: Page) {
  const panel = await details(page)
  await panel
    .getByRole('button', { name: 'Buscar ediciones y pistas', exact: true })
    .click()
  await panel.getByRole('button', { name: 'Cargar más ediciones' }).click()
  await expect(panel.getByText('2 de 2 ediciones cargadas.')).toBeVisible()
  await panel
    .getByRole('button', { name: 'Revisar edición', exact: true })
    .first()
    .click()
  await expect(
    panel.getByRole('heading', { name: 'Revisar Edición de prueba' }),
  ).toBeVisible()
  return panel
}
test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
  await request.post('/__test/fail-assets?value=false')
})

test('el artista reúne su colección local, distingue homónimos e incorpora discos sin salir de la comparación', async ({
  page,
}, info) => {
  const api = await mockCatalog(page),
    before = await seed(page, { homonym: true })
  const card = page
    .getByRole('list', { name: 'Álbumes de tu biblioteca' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Eclipse', exact: true }) })
  await card
    .getByRole('button', { name: 'Ver artista Umbral Eléctrico' })
    .click()
  await expect(page).toHaveURL(new RegExp(`#/artista/${ids.artist}$`))
  await expect(
    page.getByRole('button', { name: 'Abrir Eclipse', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Abrir Otra órbita' }),
  ).toHaveCount(0)
  expect(api.calls).toHaveLength(0)
  await expect(
    page.locator('.artist-albums').getByText(/1 ejemplar/),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Consultar discografía', exact: true })
    .click()
  const catalog = page.getByRole('list', { name: 'Obras disponibles' })
  await expect(
    catalog.getByText('Ya incorporado', { exact: true }),
  ).toHaveCount(1)
  await catalog.getByRole('checkbox', { name: /Disco nuevo/ }).check()
  await page
    .getByRole('button', { name: 'Revisar importación', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirmar importación', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Umbral Eléctrico' }),
  ).toBeVisible()
  await expect(
    catalog.getByText('Ya incorporado', { exact: true }),
  ).toHaveCount(2)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page
    .getByRole('heading', { level: 1, name: 'Umbral Eléctrico' })
    .focus()
  await page.screenshot({
    path: info.outputPath('artista.png'),
    fullPage: false,
  })
  await catalog
    .getByRole('button', { name: 'Abrir Eclipse', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Volver a Umbral Eléctrico', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`#/artista/${ids.artist}$`))
  const after = await exported(page)
  expect(after.data.library.ownedItems).toEqual(before.data.library.ownedItems)
  expect(after.data.library.albumRatings).toEqual(
    before.data.library.albumRatings,
  )
  expect(after.data.catalog.albums).toHaveLength(
    before.data.catalog.albums.length + 1,
  )
})

test('una edición importa pistas por disco, reutiliza sólo la pista elegida y conserva notas y portada', async ({
  page,
}, info) => {
  const api = await mockCatalog(page),
    before = await seed(page)
  const panel = await choose(page)
  await panel
    .getByText('Reutilizar pistas que ya tienes (opcional)', { exact: true })
    .click()
  await panel
    .getByRole('combobox', { name: 'Pista 1.1: Eclipse', exact: true })
    .selectOption(ids.eclipse)
  await panel
    .getByRole('button', { name: 'Revisar datos para guardar', exact: true })
    .click()
  await expect(
    panel.getByRole('heading', { name: 'Confirma los datos del catálogo' }),
  ).toBeFocused()
  await expect(
    panel.getByText('Se añadirá una edición. 1 pista nueva.', {
      exact: true,
    }),
  ).toBeVisible()
  await page.screenshot({
    path: info.outputPath('edicion-revision.png'),
    fullPage: true,
  })
  await panel
    .getByRole('button', { name: 'Confirmar datos del catálogo' })
    .click()
  await expect(panel.getByText(/Datos del catálogo guardados/)).toBeVisible()
  await expect(
    panel.getByText('Edición ya guardada', { exact: false }),
  ).toHaveCount(1)
  expect(api.covers).toBe(0)
  const after = await exported(page)
  expect(after.schemaVersion).toBe(9)
  expect(after.data.library).toEqual(before.data.library)
  expect(after.data.catalog.coreTracks).toEqual(before.data.catalog.coreTracks)
  expect(after.data.catalog.albums).toEqual(before.data.catalog.albums)
  const release = after.data.catalog.releases.find(
    (row) => row.musicBrainz?.id === editionId,
  )!
  expect(release.id).not.toBe(editionId)
  const positions = after.data.catalog.releaseTracks
    .filter((row) => row.releaseId === release.id)
    .sort((a, b) => a.discNumber - b.discNumber)
  expect(positions.map((row) => [row.discNumber, row.trackNumber])).toEqual([
    [1, 1],
    [2, 1],
  ])
  expect(positions[0]!.trackId).toBe(ids.eclipse)
  expect(
    after.data.catalog.tracks.find((row) => row.id === ids.eclipse)!.musicBrainz
      ?.id,
  ).toBe(fixtureId(9020))
  expect(after.data.catalog.tracks).toHaveLength(
    before.data.catalog.tracks.length + 1,
  )
})

test('una coincidencia con edición manual requiere elegir y conserva íntegra su lista', async ({
  page,
}) => {
  await mockCatalog(page)
  const before = await seed(page, { manualEdition: true }),
    panel = await choose(page)
  await expect(
    panel.getByRole('combobox', { name: 'Guardar edición', exact: true }),
  ).toHaveValue('')
  await expect(
    panel.getByRole('button', { name: 'Revisar datos para guardar' }),
  ).toBeDisabled()
  await panel
    .getByRole('combobox', { name: 'Guardar edición', exact: true })
    .selectOption(ids.original)
  await expect(panel.getByLabel('Incluir la lista de pistas')).toBeDisabled()
  await expect(
    panel.getByText(/La edición local ya tiene una lista/),
  ).toBeVisible()
  await panel
    .getByRole('button', { name: 'Revisar datos para guardar' })
    .click()
  await panel
    .getByRole('button', { name: 'Confirmar datos del catálogo' })
    .click()
  await expect(panel.getByText(/Datos del catálogo guardados/)).toBeVisible()
  const after = await exported(page)
  expect(after.data.catalog.releases).toHaveLength(
    before.data.catalog.releases.length,
  )
  const { musicBrainz, ...release } = after.data.catalog.releases.find(
    (row) => row.id === ids.original,
  )!
  expect(musicBrainz?.id).toBe(editionId)
  expect(release).toEqual(
    before.data.catalog.releases.find((row) => row.id === ids.original),
  )
  expect(after.data.catalog.tracks).toEqual(before.data.catalog.tracks)
  expect(after.data.catalog.releaseTracks).toEqual(
    before.data.catalog.releaseTracks,
  )
  expect(after.data.library).toEqual(before.data.library)
})

test('la portada se consulta a petición y sustituirla requiere revisión y confirmación', async ({
  page,
}) => {
  const api = await mockCatalog(page),
    before = await seed(page),
    panel = await details(page)
  expect(api.covers).toBe(0)
  await panel.getByRole('button', { name: 'Ver portada del álbum' }).click()
  await expect(
    panel.getByRole('img', { name: 'Portada propuesta por el catálogo' }),
  ).toBeVisible()
  await panel
    .getByRole('button', { name: 'Revisar sustitución de portada' })
    .click()
  await expect(panel.getByText(/La portada actual se sustituirá/)).toBeVisible()
  await panel.getByRole('button', { name: 'Volver a revisar' }).click()
  await panel
    .getByRole('button', { name: 'Revisar sustitución de portada' })
    .click()
  await panel
    .getByRole('button', { name: 'Confirmar datos del catálogo' })
    .click()
  await expect(panel.getByText(/Datos del catálogo guardados/)).toBeVisible()
  const after = await exported(page)
  expect(
    after.data.catalog.albums.find((row) => row.id === ids.album)!.coverUrl,
  ).toBe(`https://coverartarchive.org/release-group/${groupId}/front-500`)
  expect(after.data.library).toEqual(before.data.library)
  expect(after.data.catalog.releases).toEqual(before.data.catalog.releases)
})

test('un artista manual necesita confirmar su identidad y mantiene el nombre y los datos locales', async ({
  page,
}) => {
  const api = await mockCatalog(page),
    before = await seed(page, { manualArtist: true })
  await page
    .getByRole('button', { name: 'Ver artista Umbral Eléctrico' })
    .click()
  expect(api.calls).toHaveLength(0)
  await page
    .getByRole('button', { name: 'Buscar artista del catálogo' })
    .click()
  await page
    .getByRole('button', { name: 'Revisar vínculo con Umbral Eléctrico' })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'Vincular Umbral Eléctrico con Umbral Eléctrico',
    }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Seguir editando' }).click()
  await page
    .getByRole('button', { name: 'Confirmar vínculo de artista' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Consultar discografía', exact: true }),
  ).toBeVisible()
  expect(api.calls).toHaveLength(1)
  const after = await exported(page)
  const { musicBrainz, ...local } = after.data.catalog.artists.find(
    (row) => row.id === ids.artist,
  )!
  expect(musicBrainz?.id).toBe(artistId)
  expect(local).toEqual(
    before.data.catalog.artists.find((row) => row.id === ids.artist),
  )
  expect(after.data.library).toEqual(before.data.library)
})

test('un fallo del catálogo permite reintentar; una edición incompleta se puede guardar sin pistas', async ({
  page,
}) => {
  const api = await mockCatalog(page),
    before = await seed(page),
    panel = await details(page)
  api.failure = true
  await panel.getByRole('button', { name: 'Buscar ediciones y pistas' }).click()
  await expect(panel.getByRole('alert')).toContainText(
    'No pudimos consultar las ediciones',
  )
  api.failure = false
  api.incomplete = true
  await panel.getByRole('button', { name: 'Buscar ediciones y pistas' }).click()
  await panel
    .getByRole('button', { name: 'Revisar edición', exact: true })
    .click()
  await expect(panel.getByLabel('Incluir la lista de pistas')).toBeDisabled()
  api.missingCover = true
  await panel
    .getByRole('button', { name: 'Ver portada de esta edición' })
    .click()
  await expect(
    panel.getByText(
      'No hay una portada disponible. Puedes continuar con los demás datos.',
    ),
  ).toBeVisible()
  await panel
    .getByRole('button', { name: 'Revisar datos para guardar' })
    .click()
  await panel
    .getByRole('button', { name: 'Confirmar datos del catálogo' })
    .click()
  await expect(panel.getByText(/Datos del catálogo guardados/)).toBeVisible()
  const after = await exported(page)
  expect(after.data.catalog.releases).toHaveLength(
    before.data.catalog.releases.length + 1,
  )
  expect(after.data.catalog.tracks).toEqual(before.data.catalog.tracks)
  expect(after.data.catalog.releaseTracks).toEqual(
    before.data.catalog.releaseTracks,
  )
  expect(after.data.catalog.albums).toEqual(before.data.catalog.albums)
})

test('a 320 px la selección protege la salida, conserva el foco y es accesible en ambos temas', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 780 })
  await mockCatalog(page)
  await seed(page)
  const panel = await choose(page)
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(
    page.getByRole('button', {
      name: 'Biblioteca',
      exact: true,
    }),
  ).toBeFocused()
  for (const theme of ['Oscuro', 'Claro']) {
    await openLibraryOptions(page)
    const appearance = page.locator('details.appearance-panel')
    if ((await appearance.getAttribute('open')) === null)
      await appearance.locator(':scope > summary').click()
    await page.getByRole('radio', { name: theme, exact: true }).check()
    await page.locator('details.library-utilities > summary').click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([])
    await page.screenshot({
      path: info.outputPath(`edicion-320-${theme}.png`),
      fullPage: true,
    })
  }
  await panel.getByRole('button', { name: 'Cancelar selección' }).click()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
