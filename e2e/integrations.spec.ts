import { openLibraryOptions } from './helpers/library-navigation'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { parseBackupText, serializeBackup } from '../src/domain/backup'
import { makeBackup } from '../src/domain/backup.fixture'

// Remote responses must reach Playwright routes in every engine. Dedicated PWA
// tests exercise the service worker separately with real production caching.
test.use({ serviceWorkers: 'block' })

const albumTitle = 'Horizonte Ficticio'
const albumId = 'Q900000001'
const otherAlbumId = 'Q900000002'
const artistId = 'Q900000101'
const collaboratorId = 'Q900000102'
const otherArtistId = 'Q900000103'
const mbid = '00000000-0000-4000-8000-000000000099'
const fictitiousKey = 'clave-ficticia-solo-para-pruebas'
const wikidataRoute = 'https://www.wikidata.org/w/api.php?*'
const groqRoute = 'https://api.groq.com/openai/v1/chat/completions'
const geminiRoute =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, x-goog-api-key, Api-User-Agent',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: cors,
    body: JSON.stringify(body),
  })
}

function statement(value: unknown) {
  return {
    rank: 'normal',
    mainsnak: { snaktype: 'value', datavalue: { value } },
  }
}

async function mockCatalog(page: Page) {
  const requests: URL[] = []
  await page.route(wikidataRoute, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors })
      return
    }
    const url = new URL(route.request().url())
    requests.push(url)
    expect(route.request().headers()['api-user-agent']).toContain('Auditorium/')
    if (url.searchParams.get('action') === 'wbsearchentities') {
      await fulfill(route, { search: [{ id: otherAlbumId }, { id: albumId }] })
    } else if (url.searchParams.get('props') === 'labels') {
      await fulfill(route, {
        entities: Object.fromEntries(
          (
            [
              [artistId, 'Conjunto Ficticio A'],
              [collaboratorId, 'Conjunto Ficticio B'],
              [otherArtistId, 'Otro conjunto ficticio'],
            ] as const
          ).map(
            ([id, name]) =>
              [id, { id, labels: { es: { value: name } } }] as const,
          ),
        ),
      })
    } else {
      await fulfill(route, {
        entities: {
          [albumId]: {
            id: albumId,
            labels: { es: { value: albumTitle } },
            claims: {
              P31: [statement({ id: 'Q482994' })],
              P175: [
                statement({ id: artistId }),
                statement({ id: collaboratorId }),
              ],
              P577: [
                statement({
                  time: '+1999-00-00T00:00:00Z',
                  precision: 9,
                  calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
                }),
              ],
              P436: [statement(mbid)],
              P2205: [statement('A'.repeat(22))],
              P1651: [statement('a'.repeat(11))],
            },
          },
          [otherAlbumId]: {
            id: otherAlbumId,
            labels: { es: { value: albumTitle } },
            claims: {
              P31: [statement({ id: 'Q482994' })],
              P175: [statement({ id: otherArtistId })],
            },
          },
        },
      })
    }
  })
  return requests
}

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
    name: 'respaldo-ficticio-integraciones.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
}

async function seed(page: Page) {
  await ready(page)
  await restore(page, serializeBackup(makeBackup()))
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
}

async function addForm(page: Page) {
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByText('Detalles del álbum (opcionales)', { exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Artista', exact: true })
    .fill('Conjunto Ficticio A')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill(albumTitle)
}

async function searchCatalog(page: Page) {
  const reference = page.getByText('Buscar referencia en Wikidata (opcional)', {
    exact: true,
  })
  if ((await reference.locator('..').getAttribute('open')) === null)
    await reference.click()
  await page.getByRole('button', { name: 'Buscar en Wikidata' }).click()
  await expect(page.locator('.catalog-candidate')).toHaveCount(2)
}

async function exportText(page: Page) {
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar respaldo JSON' }).click()
  const path = await (await downloaded).path()
  if (!path) throw new Error('No se obtuvo el respaldo ficticio.')
  return readFile(path, 'utf8')
}

function recommendationBody(provider: 'groq' | 'gemini', reference = 'a1') {
  const text = JSON.stringify({
    items: [
      {
        reference,
        action: 'reevaluate',
        reason: 'Revisa tu valoración tras otra escucha.',
      },
    ],
  })
  return provider === 'groq'
    ? { choices: [{ finish_reason: 'stop', message: { content: text } }] }
    : { candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }
}

async function consent(page: Page, provider: 'groq' | 'gemini') {
  await page
    .getByLabel(`Clave API de ${provider === 'groq' ? 'Groq' : 'Gemini'}`, {
      exact: true,
    })
    .fill(fictitiousKey)
  await page
    .getByRole('checkbox', { name: /Acepto enviar estos datos/u })
    .check()
}

async function persistedText(page: Page) {
  return page.evaluate(async () => {
    const opening = indexedDB.open('auditorium')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result)
      opening.onerror = () =>
        reject(new Error('No se pudo leer la biblioteca ficticia.'))
    })
    const names = Array.from(database.objectStoreNames)
    const transaction = database.transaction(names, 'readonly')
    const rows = await Promise.all(
      names.map(
        (name) =>
          new Promise<unknown>((resolve) => {
            const reading = transaction.objectStore(name).getAll()
            reading.onsuccess = () => {
              const values: unknown = reading.result
              resolve([name, values])
            }
          }),
      ),
    )
    database.close()
    const cachedUrls: string[] = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) cachedUrls.push(request.url)
    }
    return JSON.stringify({
      rows,
      local: Object.fromEntries(
        Object.keys(localStorage).map((key) => [
          key,
          localStorage.getItem(key),
        ]),
      ),
      session: Object.fromEntries(
        Object.keys(sessionStorage).map((key) => [
          key,
          sessionStorage.getItem(key),
        ]),
      ),
      cachedUrls,
    })
  })
}

function assertPayload(bodyText: string, provider: 'groq' | 'gemini') {
  const body: unknown = JSON.parse(bodyText)
  const content =
    provider === 'groq'
      ? z
          .object({
            messages: z.array(
              z.object({ role: z.string(), content: z.string() }),
            ),
          })
          .parse(body)
          .messages.find((message) => message.role === 'user')?.content
      : z
          .object({
            contents: z.array(
              z.object({ parts: z.array(z.object({ text: z.string() })) }),
            ),
          })
          .parse(body).contents[0]?.parts[0]?.text
  if (!content) throw new Error('Falta el contexto ficticio.')
  const parsed: unknown = JSON.parse(content)
  const payload = z
    .object({
      candidates: z.array(z.record(z.string(), z.unknown())),
      recentReferences: z.array(z.string()),
    })
    .parse(parsed)
  expect(payload.candidates).toHaveLength(1)
  expect(Object.keys(payload.candidates[0]!).sort()).toEqual([
    'addedOrder',
    'artist',
    'listeningStatus',
    'reference',
    'score',
    'title',
    'year',
  ])
  expect(payload.candidates[0]).toMatchObject({
    title: 'Eclipse',
    score: 9.5,
    listeningStatus: 'queued',
  })
  expect(content).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu,
  )
  for (const excluded of [
    'Comentario ficticio',
    'Copia ficticia',
    'Deseo ficticio',
    fictitiousKey,
  ])
    expect(bodyText).not.toContain(excluded)
}

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

test.beforeEach(async ({ request }) => {
  await request.post('/__test/version?value=a')
  await request.post('/__test/fail-assets?value=false')
})

test('catálogo conserva selección, créditos y respaldo3; la portada elegida carga automáticamente', async ({
  page,
  browser,
}) => {
  const requests = await mockCatalog(page)
  let covers = 0
  await page.route('https://coverartarchive.org/**', async (route) => {
    covers += 1
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="black"/></svg>',
    })
  })
  await ready(page)
  await addForm(page)
  expect(requests).toHaveLength(0)
  await searchCatalog(page)
  expect(requests).toHaveLength(3)
  expect(covers).toBe(0)
  await expect(
    page.getByText(
      'El artista no coincide con el texto escrito. Revisa esta referencia.',
    ),
  ).toBeVisible()
  await page
    .locator('.catalog-candidate')
    .filter({ hasText: 'Conjunto Ficticio A · Conjunto Ficticio B' })
    .getByRole('button', { name: `Revisar ${albumTitle}` })
    .click()
  const prepared = page.getByRole('region', { name: 'Referencia preparada' })
  await expect(prepared).toContainText(
    'Se conservará cada artista por separado',
  )
  await expect(
    page.getByRole('checkbox', { name: /Guardar enlace de portada/u }),
  ).not.toBeChecked()
  await page
    .getByRole('checkbox', { name: /Guardar enlace de portada/u })
    .check()
  await expect(
    page.getByRole('img', { name: 'Portada de vista previa' }),
  ).toBeVisible()
  await expect.poll(() => covers).toBeGreaterThan(0)
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
    page.getByRole('heading', { name: albumTitle, exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: albumTitle, exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: `Wikidata · ${albumId}` }),
  ).toHaveAttribute('href', `https://www.wikidata.org/wiki/${albumId}`)
  await expect(
    page.getByRole('link', { name: 'Álbum en Spotify' }),
  ).toHaveAttribute('href', `https://open.spotify.com/album/${'A'.repeat(22)}`)
  await expect(
    page.getByRole('link', { name: 'Vídeo en YouTube' }),
  ).toHaveAttribute('href', `https://www.youtube.com/watch?v=${'a'.repeat(11)}`)
  await expect(
    page.getByRole('img', { name: `Portada de ${albumTitle}` }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Mostrar portada' }),
  ).toHaveCount(0)
  const text = await exportText(page)
  const backup = parseBackupText(text)
  expect(backup.schemaVersion).toBe(5)
  expect(
    backup.data.catalog.artists.map((artist) => artist.name).sort(),
  ).toEqual(['Conjunto Ficticio A', 'Conjunto Ficticio B'])
  expect(backup.data.catalog.albumArtists).toHaveLength(2)
  expect(backup.data.catalog.albums[0]).toMatchObject({
    catalogReference: { entityId: albumId },
    coverUrl: `https://coverartarchive.org/release-group/${mbid}/front-500`,
  })
  const restoredContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    serviceWorkers: 'block',
  })
  try {
    const restoredPage = await restoredContext.newPage()
    await restoredPage.route('https://coverartarchive.org/**', (route) =>
      route.abort('failed'),
    )
    await ready(restoredPage)
    await restore(restoredPage, text)
    const restored = parseBackupText(await exportText(restoredPage))
    expect(restored.data).toEqual(backup.data)
  } finally {
    await restoredContext.close()
  }
  expect(requests).toHaveLength(3)
})

test('fallo del catálogo conserva el formulario y permite registrar sin conexión', async ({
  page,
  context,
}) => {
  await page.route(wikidataRoute, (route) => route.abort('failed'))
  await ready(page)
  await addForm(page)
  const reference = page.getByText('Buscar referencia en Wikidata (opcional)', {
    exact: true,
  })
  if ((await reference.locator('..').getAttribute('open')) === null)
    await reference.click()
  await page.getByRole('button', { name: 'Buscar en Wikidata' }).click()
  await expect(
    page.getByText(
      'No pudimos consultar Wikidata. Puedes continuar con el registro manual.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: 'Título', exact: true }),
  ).toHaveValue(albumTitle)
  await expect(
    page.getByRole('textbox', { name: 'Artista', exact: true }),
  ).toHaveValue('Conjunto Ficticio A')
  await page
    .getByRole('button', { name: 'Continuar con el registro manual' })
    .click()
  await context.setOffline(true)
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
    page.getByRole('heading', { name: albumTitle, exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /Wikidata/u })).toHaveCount(0)
  await context.setOffline(false)
})

test('Groq usa consentimiento y datos mínimos sin persistir clave ni alterar la valoración', async ({
  page,
}) => {
  const calls: Array<{
    url: string
    body: string
    authorization: string | undefined
  }> = []
  await page.route(groqRoute, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors })
      return
    }
    calls.push({
      url: route.request().url(),
      body: route.request().postData() ?? '',
      authorization: route.request().headers().authorization,
    })
    await fulfill(route, recommendationBody('groq'))
  })
  await seed(page)
  await openLibraryOptions(page)
  await page
    .getByRole('button', { name: 'Recomendaciones', exact: true })
    .click()
  await page
    .getByLabel('Clave API de Groq', { exact: true })
    .fill(fictitiousKey)
  await expect(
    page.getByRole('button', { name: 'Generar recomendaciones' }),
  ).toBeDisabled()
  expect(calls).toHaveLength(0)
  await page
    .getByRole('checkbox', { name: /Acepto enviar estos datos/u })
    .check()
  await page.getByRole('button', { name: 'Generar recomendaciones' }).click()
  await expect(
    page.getByRole('list', { name: 'Orden recomendado' }),
  ).toContainText('Revisa tu valoración tras otra escucha.')
  expect(calls).toHaveLength(1)
  expect(calls[0]?.authorization).toBe(`Bearer ${fictitiousKey}`)
  expect(calls[0]?.url).toBe(groqRoute)
  assertPayload(calls[0]!.body, 'groq')
  const persisted = await persistedText(page)
  expect(persisted).not.toContain(fictitiousKey)
  expect(persisted).not.toContain('api.groq.com')
  expect(persisted).not.toContain('Revisa tu valoración tras otra escucha.')
  await page
    .getByRole('button', { name: 'Abrir álbum Eclipse', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Nota del álbum', exact: true }),
  ).toHaveValue('9,5')
  await expect(
    page.getByRole('textbox', { name: 'Notas personales', exact: true }),
  ).toHaveValue('  Comentario ficticio.\nSegunda línea.  ')
  await openLibraryOptions(page)
  await page
    .getByRole('button', { name: 'Recomendaciones', exact: true })
    .click()
  await expect(
    page.getByLabel('Clave API de Groq', { exact: true }),
  ).toHaveValue(fictitiousKey)
  await page.getByRole('button', { name: 'Olvidar clave' }).click()
  await expect(
    page.getByLabel('Clave API de Groq', { exact: true }),
  ).toHaveValue('')
  await page
    .getByLabel('Clave API de Groq', { exact: true })
    .fill(fictitiousKey)
  await page.reload()
  await openLibraryOptions(page)
  await page
    .getByRole('button', { name: 'Recomendaciones', exact: true })
    .click()
  await expect(
    page.getByLabel('Clave API de Groq', { exact: true }),
  ).toHaveValue('')
  expect(calls).toHaveLength(1)
  const text = await exportText(page)
  expect(text).not.toContain(fictitiousKey)
  expect(parseBackupText(text).data.library.albumRatings[0]?.scoreUnits).toBe(
    19,
  )
})

test('Gemini permite recuperarse de cuota, referencia desconocida y cancelación sin mostrar respuestas tardías', async ({
  page,
}) => {
  let calls = 0
  let release: (() => void) | undefined
  let delayedFinished: (() => void) | undefined
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const finished = new Promise<void>((resolve) => {
    delayedFinished = resolve
  })
  await page.route(geminiRoute, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors })
      return
    }
    calls += 1
    expect(route.request().url()).toBe(geminiRoute)
    expect(route.request().headers()['x-goog-api-key']).toBe(fictitiousKey)
    assertPayload(route.request().postData() ?? '', 'gemini')
    if (calls === 1)
      await fulfill(
        route,
        { error: { message: 'Texto remoto que no debe mostrarse' } },
        429,
      )
    else if (calls === 2)
      await fulfill(route, recommendationBody('gemini', 'a999'))
    else if (calls === 3) {
      await released
      await fulfill(route, recommendationBody('gemini')).catch(() => undefined)
      delayedFinished?.()
    } else await fulfill(route, recommendationBody('gemini'))
  })
  await seed(page)
  await openLibraryOptions(page)
  await page
    .getByRole('button', { name: 'Recomendaciones', exact: true })
    .click()
  await page
    .getByLabel('Clave API de Groq', { exact: true })
    .fill('otra-clave-ficticia')
  await page
    .getByRole('combobox', { name: 'Proveedor', exact: true })
    .selectOption('gemini')
  await expect(
    page.getByLabel('Clave API de Gemini', { exact: true }),
  ).toHaveValue('')
  await expect(
    page.getByText(/Gemini gratuito puede usar entradas y respuestas/u),
  ).toBeVisible()
  await consent(page, 'gemini')
  await page.getByRole('button', { name: 'Generar recomendaciones' }).click()
  await expect(
    page.getByText(
      'El proveedor ha alcanzado un límite de uso. Inténtalo más tarde.',
    ),
  ).toBeVisible()
  await expect(
    page.getByText('Texto remoto que no debe mostrarse'),
  ).toHaveCount(0)
  expect(calls).toBe(1)
  await page.getByRole('button', { name: 'Generar recomendaciones' }).click()
  await expect(
    page.getByText(
      'El proveedor no devolvió un orden válido. Puedes volver a intentarlo.',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Orden recomendado' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Generar recomendaciones' }).click()
  await expect.poll(() => calls).toBe(3)
  await page.getByRole('button', { name: 'Cancelar solicitud' }).click()
  release?.()
  await finished
  await expect(
    page.getByText('Solicitud cancelada. Puedes volver a intentarlo.'),
  ).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Orden recomendado' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Generar recomendaciones' }).click()
  await expect(
    page.getByRole('button', { name: 'Abrir álbum Eclipse', exact: true }),
  ).toBeVisible()
  expect(calls).toBe(4)
  expect(await persistedText(page)).not.toContain(fictitiousKey)
})

test('catálogo y recomendaciones son accesibles a360px en temas oscuro y claro', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 360, height: 900 })
  await mockCatalog(page)
  await page.route(groqRoute, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors })
      return
    }
    await fulfill(route, recommendationBody('groq'))
  })
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
    await openLibraryOptions(page)
    await page
      .getByRole('button', { name: 'Recomendaciones', exact: true })
      .click()
    await consent(page, 'groq')
    await page.getByRole('button', { name: 'Generar recomendaciones' }).click()
    await expect(
      page.getByRole('list', { name: 'Orden recomendado' }),
    ).toBeVisible()
    await accessible(page)
    await page
      .getByRole('button', { name: 'Volver a la biblioteca', exact: true })
      .click()
    await addForm(page)
    await searchCatalog(page)
    await accessible(page)
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await page
      .getByRole('button', { name: 'Descartar cambios', exact: true })
      .click()
  }
})
