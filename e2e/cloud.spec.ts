import { openLibraryOptions } from './helpers/library-navigation'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { makeBackup } from '../src/domain/backup.fixture'
import { fixtureId } from '../src/domain/catalog/catalog.fixture'
import { remoteLibrarySchema, type RemoteLibrary } from '../src/domain/sync'

const email = 'listener@example.invalid'
const userId = fixtureId(901)
const password = 'Fictitious-Password-Only'

for (const error of [
  '#error=access_denied&error_code=otp_expired&error_description=fictitious-private-description',
  '?error=access_denied&error_code=otp_expired&code=fictitious-private-code',
]) {
  test(`un enlace caducado permite volver a solicitar acceso: ${error.startsWith('#') ? 'fragmento' : 'consulta'}`, async ({
    page,
    context,
  }) => {
    await mock(context, new Map())
    await page.goto(`/${error}`)
    await expect(
      page.getByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeVisible()
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'El enlace de acceso ha caducado' }),
    ).toBeVisible()
    expect(new URL(page.url()).hash).toBe('#/opciones/cuenta')
    expect(new URL(page.url()).search).toBe('')
    await page
      .getByRole('button', { name: 'Olvidé mi contraseña', exact: true })
      .click()
    await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email)
    await page
      .getByRole('button', { name: 'Enviar enlace', exact: true })
      .click()
    await expect(
      page.getByText(
        'Si el correo corresponde a una cuenta, recibirás un enlace de recuperación.',
        { exact: true },
      ),
    ).toBeVisible()
    expect(page.url()).not.toContain('fictitious-private')
  })
}

function fakeSession(id = userId, address = email) {
  const claims = Buffer.from(
    JSON.stringify({
      sub: id,
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url')
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${claims}.fictitious`,
    token_type: 'bearer',
    refresh_token: 'fictitious-refresh-token',
    expires_in: 3600,
    user: {
      id,
      email: address,
      role: 'authenticated',
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00.000Z',
      email_confirmed_at: '2026-01-01T00:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
    },
  }
}
async function mock(
  context: BrowserContext,
  state: Map<string, RemoteLibrary>,
) {
  await context.route(
    'https://auditorium-test.supabase.co/**',
    async (route) => {
      const request = route.request(),
        url = new URL(request.url())
      const reply = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
          },
          body: JSON.stringify(body),
        })
      if (request.method() === 'OPTIONS')
        return route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
            'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
          },
        })
      if (url.pathname.endsWith('/token')) {
        if (url.searchParams.get('grant_type') === 'pkce') {
          const input = request.postDataJSON() as { auth_code: string }
          if (input.auth_code === 'fictitious-expired-code')
            return reply(
              {
                code: 'flow_state_expired',
                msg: 'Fictitious private error: expired flow state',
              },
              422,
            )
          return reply(fakeSession())
        }
        const input = request.postDataJSON() as {
          email: string
          password: string
        }
        expect(input.password).toBe(password)
        return reply(
          fakeSession(
            input.email === email ? userId : fixtureId(902),
            input.email,
          ),
        )
      }
      if (url.pathname.endsWith('/user')) return reply(fakeSession().user)
      if (url.pathname.endsWith('/logout'))
        return route.fulfill({ status: 204 })
      if (url.pathname.endsWith('/signup'))
        return reply({ user: null, session: null })
      if (url.pathname.endsWith('/recover')) return reply({})
      if (url.pathname.endsWith('/library_snapshots')) {
        const id = url.searchParams.get('owner_id')?.slice(3) ?? ''
        const value = state.get(id) ?? null
        return reply(value)
      }
      if (url.pathname.endsWith('/save_library_snapshot')) {
        const input = request.postDataJSON() as {
          account_id: string
          expected_revision: number
          document: unknown
        }
        const current = state.get(input.account_id)
        if (input.expected_revision !== (current?.revision ?? 0))
          return reply({ code: '40001', message: 'Revision conflict' }, 409)
        const next = remoteLibrarySchema.parse({
          revision: (current?.revision ?? 0) + 1,
          snapshot: input.document,
        })
        state.set(input.account_id, next)
        return reply(next)
      }
      throw new Error(`Unexpected mocked endpoint ${url.pathname}`)
    },
  )
}
async function accountPage(page: Page) {
  await openLibraryOptions(page)
  await page
    .getByRole('button', { name: 'Cuenta y dispositivos', exact: true })
    .click()
}
async function login(page: Page, address = email) {
  await page.goto('/#/opciones/cuenta')
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(address)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Tu biblioteca conectada' }),
  ).toBeVisible()
}

async function requestRecovery(page: Page) {
  await page.goto('/#/opciones/cuenta')
  await page
    .getByRole('button', { name: 'Olvidé mi contraseña', exact: true })
    .click()
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email)
  await page.getByRole('button', { name: 'Enviar enlace', exact: true }).click()
  await expect(
    page.getByText(
      'Si el correo corresponde a una cuenta, recibirás un enlace de recuperación.',
      { exact: true },
    ),
  ).toBeVisible()
}

test('un intercambio PKCE caducado permite solicitar otro enlace y recuperar acceso', async ({
  page,
  context,
}) => {
  await mock(context, new Map())
  await requestRecovery(page)
  const failedExchange = page.waitForResponse(
    (response) =>
      response.url().includes('/token?grant_type=pkce') &&
      response.status() === 422,
  )
  await page.goto('/?entrada=prueba&code=fictitious-expired-code')
  await failedExchange
  await expect(
    page.getByRole('heading', { name: 'Iniciar sesión' }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'El enlace de acceso ha caducado' }),
  ).toBeVisible()
  expect(new URL(page.url()).search).toBe('?entrada=prueba')
  expect(new URL(page.url()).hash).toBe('#/opciones/cuenta')
  await expect(
    page.getByText('Fictitious private error', { exact: false }),
  ).toHaveCount(0)
  await requestRecovery(page)
  const recovered = await context.newPage()
  await recovered.goto('/?code=fictitious-recovery-code')
  await expect(
    recovered.getByRole('heading', { name: 'Elige una contraseña nueva' }),
  ).toBeVisible()
  expect(new URL(recovered.url()).search).toBe('')
  await recovered.close()
})

test('un intercambio caducado conserva la sesión y su biblioteca', async ({
  page,
  context,
}) => {
  await mock(
    context,
    new Map([[userId, { revision: 1, snapshot: makeBackup().data }]]),
  )
  await login(page)
  await page
    .getByRole('button', { name: 'Sincronizar ahora', exact: true })
    .click()
  const requestPage = await context.newPage()
  await requestRecovery(requestPage)
  await requestPage.close()
  const failedExchange = page.waitForResponse(
    (response) =>
      response.url().includes('/token?grant_type=pkce') &&
      response.status() === 422,
  )
  await page.goto('/?code=fictitious-expired-code')
  await failedExchange
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'El enlace de acceso ha caducado' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Tu biblioteca conectada' }),
  ).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
})

test('login, dos dispositivos, sincronización y aislamiento al cerrar/cambiar cuenta', async ({
  page,
  context,
  browser,
}) => {
  const snapshot = makeBackup().data
  const entry = snapshot.library.userAlbums[0]!
  const linkId = '00000000-0000-4000-8000-000000056000'
  entry.links = [
    {
      id: linkId,
      purpose: 'playback',
      url: 'https://servicio.example/album/ficticio',
      label: 'Escucha elegida',
      createdAt: entry.addedAt,
      updatedAt: entry.updatedAt,
    },
  ]
  entry.preferredPlaybackLinkId = linkId
  const state = new Map<string, RemoteLibrary>([
    [userId, { revision: 1, snapshot }],
  ])
  await mock(context, state)
  await login(page)
  await page
    .getByRole('button', { name: 'Sincronizar ahora', exact: true })
    .click()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  const second = await browser.newContext()
  await mock(second, state)
  const other = await second.newPage()
  await login(other)
  await other
    .getByRole('button', { name: 'Sincronizar ahora', exact: true })
    .click()
  await other.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(
    other.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  await other.getByRole('button', { name: 'Eclipse', exact: true }).click()
  await expect(
    other
      .getByRole('region', { name: 'Escuchar', exact: true })
      .getByRole('link', { name: /Escucha elegida/ }),
  ).toHaveAttribute('href', 'https://servicio.example/album/ficticio')
  await expect(
    other.getByRole('region', { name: 'Escuchar', exact: true }),
  ).toContainText('Favorito de reproducción')
  await accountPage(page)
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(result.violations).toEqual([])
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toHaveCount(0)
  await login(page, 'other@example.invalid')
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toHaveCount(0)
  await second.close()
})

test('registro y recuperación limpian contraseñas y no guardan credenciales en historial o backups', async ({
  page,
  context,
}) => {
  await mock(context, new Map())
  await page.goto('/#/opciones/cuenta')
  await page
    .getByRole('button', { name: 'Crear una cuenta', exact: true })
    .click()
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(
    page.getByText(
      'Revisa tu correo para confirmar la cuenta antes de iniciar sesión.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('')
  expect(page.url()).not.toContain(email)
  expect(page.url()).not.toContain(password)
  await page
    .getByRole('button', { name: 'Olvidé mi contraseña', exact: true })
    .click()
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill(email)
  await page.getByRole('button', { name: 'Enviar enlace', exact: true }).click()
  await expect(
    page.getByText(
      'Si el correo corresponde a una cuenta, recibirás un enlace de recuperación.',
      { exact: true },
    ),
  ).toBeVisible()
  const recovered = await context.newPage()
  await recovered.goto('/?code=fictitious-recovery-code')
  await expect(
    recovered.getByRole('heading', { name: 'Elige una contraseña nueva' }),
  ).toBeVisible()
  await recovered
    .getByLabel('Contraseña', { exact: true })
    .fill('New-Fictitious-Password')
  await recovered
    .getByRole('button', { name: 'Guardar contraseña', exact: true })
    .click()
  await expect(
    recovered.getByRole('button', { name: 'Biblioteca', exact: true }),
  ).toBeEnabled()
  await recovered.close()
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  )
  expect(storage).not.toContain(password)
  await openLibraryOptions(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const downloadEvent = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar respaldo JSON', exact: true })
    .click()
  const path = await (await downloadEvent).path()
  if (!path) throw new Error('Missing fictional backup')
  const text = await readFile(path, 'utf8')
  expect(text).not.toContain(password)
  expect(text).not.toContain(email)
  expect(text).not.toContain('access_token')
})

test('incorporar la biblioteca sin cuenta conserva el original y comparte cambios offline', async ({
  page,
  context,
}) => {
  const state = new Map<string, RemoteLibrary>()
  await mock(context, state)
  await page.goto('/')
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Artista', exact: true })
    .fill('Artista Ficticio')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Biblioteca Original')
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Biblioteca Original', exact: true }),
  ).toBeVisible()
  await login(page)
  await page
    .getByText('Traer mi biblioteca sin cuenta', { exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Copiar biblioteca a mi cuenta', exact: true })
    .click()
  await expect(
    page.getByText(
      'Biblioteca local incorporada. Comprueba el estado de sincronización.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    page.getByText('Biblioteca sincronizada.', { exact: true }),
  ).toBeVisible()
  await expect
    .poll(() => state.get(userId)?.snapshot.catalog.albums[0]?.title)
    .toBe('Biblioteca Original')
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Añadir álbum', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Artista', exact: true })
    .fill('Otro Artista')
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Añadido Sin Conexión')
  await page.getByRole('button', { name: 'Guardar álbum', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Añadido Sin Conexión', exact: true }),
  ).toBeVisible()
  await context.setOffline(false)
  await accountPage(page)
  await page
    .getByRole('button', { name: 'Sincronizar ahora', exact: true })
    .click()
  await expect
    .poll(() => state.get(userId)?.snapshot.catalog.albums.length)
    .toBe(2)
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Biblioteca Original', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Añadido Sin Conexión', exact: true }),
  ).toHaveCount(0)
})
