import { test, expect, type Page } from '@playwright/test'
import { makeBackup } from '../src/domain/backup.fixture'
import { serializeBackup } from '../src/domain/backup'
import { openSettings } from './helpers/library-navigation'

test.use({ serviceWorkers: 'block' })

async function seed(page: Page) {
  await page.goto('/')
  await openSettings(page)
  await page.getByRole('button', { name: 'Respaldos', exact: true }).click()
  await page.locator('#backup-file').setInputFiles({
    name: 'colección-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(makeBackup())),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
}

test('navegación musical directa, catálogo y artistas con regreso a la búsqueda', async ({
  page,
}) => {
  await seed(page)
  const nav = page.getByRole('navigation', { name: 'Navegación principal' })
  await expect(nav.getByRole('button')).toHaveText([
    'Buscar',
    'Mi colección',
    'Deseos',
    'Sugerencias',
    'Ajustes',
  ])
  await expect(page.getByText('Más opciones', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Personalizar', { exact: true })).toHaveCount(0)
  await expect(
    page.getByText('Ajustes de la aplicación', { exact: true }),
  ).toHaveCount(0)
  await nav.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Buscar música', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Guardar álbum', exact: true }),
  ).toHaveCount(0)
  await nav.getByRole('button', { name: 'Mi colección', exact: true }).click()
  await page.getByRole('button', { name: 'Artistas', exact: true }).click()
  await page
    .getByRole('searchbox', { name: 'Buscar en tus artistas', exact: true })
    .fill('umbral')
  const artist = page.getByRole('button', {
    name: 'Ver artista Umbral Eléctrico',
    exact: true,
  })
  await expect(artist).toContainText('1 álbum')
  await artist.click()
  await expect(
    page.getByRole('heading', { name: 'Umbral Eléctrico', level: 1 }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Volver a artistas', exact: true })
    .click()
  await expect(
    page.getByRole('searchbox', { name: 'Buscar en tus artistas' }),
  ).toHaveValue('umbral')
  await expect(artist).toBeFocused()
  await nav.getByRole('button', { name: 'Deseos', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Deseos de compra', level: 1 }),
  ).toBeVisible()
})

test('sugerencias muestra música sin pedir claves ni iniciar llamadas externas', async ({
  page,
}) => {
  await seed(page)
  const external: string[] = []
  for (const endpoint of [
    'https://api.groq.com/**',
    'https://generativelanguage.googleapis.com/**',
  ])
    await page.route(endpoint, (route) => {
      external.push(route.request().url())
      return route.abort()
    })
  await page.getByRole('button', { name: 'Sugerencias', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Ver álbum Eclipse', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('Clave API de Groq', { exact: true }),
  ).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Generar recomendaciones' }),
  ).toBeHidden()
  expect(external).toEqual([])
  await page
    .getByRole('button', { name: 'Ver álbum Eclipse', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  expect(external).toEqual([])
})
