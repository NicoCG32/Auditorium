import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { fixtureId } from '../src/domain/catalog/catalog.fixture'
import {
  mockStreaming,
  playbackBackup,
  restorePlayback,
  type MockYouTubeHost,
} from './helpers/streaming-fixture'

test.use({ serviceWorkers: 'block' })
test('favorito, alternativas, referencia temporal y cancelación conservan todos los datos', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 800 })
  const network = await mockStreaming(page),
    fixture = await restorePlayback(page)
  const choice = page.getByRole('combobox', { name: 'Enlace para escuchar' })
  await expect(choice).toHaveValue(fixtureId(900))
  await expect(choice.getByRole('option')).toHaveCount(6)
  expect(network.requests).toEqual([])
  await expect(
    page
      .getByRole('region', { name: 'Comprar', exact: true })
      .getByRole('link', { name: 'Compra elegida' }),
  ).toHaveAttribute('href', fixture.data.library.userAlbums[0]!.links![3]!.url)
  await page
    .getByRole('button', { name: 'Cargar reproductor de Spotify' })
    .click()
  const frame = page.locator('iframe[title="Reproductor de Spotify"]')
  await expect(frame).toHaveAttribute(
    'src',
    'https://open.spotify.com/embed/album/' + 'a'.repeat(22),
  )
  await expect(frame).toHaveAttribute(
    'referrerpolicy',
    'strict-origin-when-cross-origin',
  )
  await expect(page.getByText(/Marco de Spotify cargado/)).toBeVisible()
  await page.getByText('Revisar los datos del recurso (opcional)').click()
  await page
    .getByRole('button', { name: 'Consultar referencia de Spotify' })
    .click()
  await expect(
    page.getByText('Referencia Ficticia De Spotify', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('img', { name: /Miniatura del recurso/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  network.delay()
  await page
    .getByRole('button', { name: 'Consultar referencia de Spotify' })
    .click()
  await expect.poll(network.hasPending).toBe(true)
  await page
    .getByRole('button', { name: 'Cancelar consulta', exact: true })
    .click()
  network.release()
  await expect(
    page.getByText('Consulta cancelada. La ficha se conserva.'),
  ).toBeVisible()
  await expect(
    page.getByText('Referencia Ficticia De Spotify', { exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Cerrar reproductor', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Cargar reproductor de Spotify' }),
  ).toBeFocused()
  await expect(frame).toHaveCount(0)
  for (const [id, kind, resource] of [
    [905, 'track', 'b'],
    [906, 'playlist', 'c'],
  ] as const) {
    await choice.selectOption(fixtureId(id))
    await expect(page.locator('iframe')).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Cargar reproductor de Spotify' })
      .click()
    await expect(frame).toHaveAttribute(
      'src',
      `https://open.spotify.com/embed/${kind}/${resource.repeat(22)}`,
    )
  }
  await page.getByRole('button', { name: 'Cerrar reproductor' }).click()
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
    path: info.outputPath('reproduccion-320.png'),
    fullPage: true,
  })
  expect((await playbackBackup(page)).data).toEqual(fixture.data)
  expect(
    network.referrers.every(
      (value) => value === new URL(page.url()).origin + '/',
    ),
  ).toBe(true)
})

test('errores, callbacks tardíos, lista y navegación liberan YouTube sin autoplay ni cambios personales', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await mockStreaming(page)
  const fixture = await restorePlayback(page)
  await page
    .getByRole('combobox', { name: 'Enlace para escuchar' })
    .selectOption(fixtureId(901))
  await page
    .getByRole('button', { name: 'Cargar reproductor de YouTube' })
    .click()
  await expect(
    page.getByText('YouTube está listo. Pulsa reproducir en sus controles.'),
  ).toBeVisible()
  const frame = page.locator('iframe[title="Reproductor de YouTube"]')
  const bounds = await frame.boundingBox()
  expect(bounds!.width).toBeGreaterThanOrEqual(200)
  expect(bounds!.height).toBeGreaterThanOrEqual(200)
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
    path: info.outputPath('youtube-dark-320.png'),
    fullPage: true,
  })
  const appearance = page.locator('details.appearance-panel')
  await appearance.locator('summary').click()
  await appearance.getByRole('radio', { name: 'Claro', exact: true }).check()
  await appearance.locator('summary').click()
  await page.setViewportSize({ width: 1280, height: 900 })
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.screenshot({
    path: info.outputPath('youtube-light-1280.png'),
    fullPage: true,
  })
  expect(
    await page.evaluate(() => (window as MockYouTubeHost).__ytSessions!.length),
  ).toBe(1)
  expect(
    new URL((await frame.getAttribute('src'))!).searchParams.get('autoplay'),
  ).toBe('0')
  for (const [index, code] of [2, 5, 100, 101, 150, 153].entries()) {
    if (index) {
      await page
        .getByRole('button', { name: 'Reintentar reproductor de YouTube' })
        .click()
      await expect(
        page.getByText(
          'YouTube está listo. Pulsa reproducir en sus controles.',
        ),
      ).toBeVisible()
    }
    await page.evaluate((code) => {
      const host = window as MockYouTubeHost,
        last = host.__ytSessions!.at(-1)!
      last.events.onError({ data: code })
      last.events.onReady()
      last.events.onStateChange({ data: 1 })
    }, code)
    await frame.dispatchEvent('load')
    await expect(page.locator('[data-playback-state="error"]')).toHaveCount(1)
    await expect(
      page.getByRole('link', { name: 'Abrir en el servicio: YouTube' }),
    ).toBeVisible()
  }
  await page
    .getByRole('combobox', { name: 'Enlace para escuchar' })
    .selectOption(fixtureId(904))
  await expect(frame).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Cargar reproductor de YouTube' })
    .click()
  await expect(
    page.getByText('YouTube está listo. Pulsa reproducir en sus controles.'),
  ).toBeVisible()
  expect(
    new URL((await frame.getAttribute('src'))!).searchParams.get('list'),
  ).toBe('PLficticia12345')
  await page.evaluate(() =>
    (window as MockYouTubeHost)
      .__ytSessions!.at(-1)!
      .events.onStateChange({ data: 1 }),
  )
  await expect(
    page.getByText('Reproducción iniciada en YouTube.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click()
  await expect(page.locator('iframe')).toHaveCount(0)
  const result = await page.evaluate(() => {
    const host = window as MockYouTubeHost
    host.__ytSessions![0]!.events.onError({ data: 100 })
    return {
      destroyed: host.__ytSessions!.every((session) => session.destroyed),
      playCalls: host.__ytPlayCalls ?? 0,
    }
  })
  expect(result).toEqual({ destroyed: true, playCalls: 0 })
  expect((await playbackBackup(page)).data).toEqual(fixture.data)
})

test('salida genérica, desconexión y fallo de script permiten continuar y reintentar por teclado', async ({
  page,
  context,
}) => {
  const network = await mockStreaming(page),
    fixture = await restorePlayback(page)
  const choice = page.getByRole('combobox', { name: 'Enlace para escuchar' })
  await choice.selectOption(fixtureId(902))
  await expect(
    page.getByRole('link', { name: 'Abrir en el servicio: service.example' }),
  ).toHaveAttribute('href', 'https://service.example/music')
  await expect(
    page.getByRole('button', { name: /Cargar reproductor/ }),
  ).toHaveCount(0)
  await choice.selectOption(fixtureId(901))
  await context.setOffline(true)
  const load = page.getByRole('button', {
    name: 'Cargar reproductor de YouTube',
  })
  await load.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(/No hay conexión/)).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  await context.setOffline(false)
  network.failScript()
  await page
    .getByRole('button', { name: 'Reintentar reproductor de YouTube' })
    .click()
  await expect(page.getByText(/No pudimos conectar con YouTube/)).toBeVisible()
  await page
    .getByRole('button', { name: 'Reintentar reproductor de YouTube' })
    .click()
  await expect(
    page.getByText('YouTube está listo. Pulsa reproducir en sus controles.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Editar álbum', exact: true }).click()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page
    .getByRole('textbox', { name: 'Título', exact: true })
    .fill('Borrador Manual Ficticio')
  await page
    .getByRole('button', { name: 'Cancelar edición', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Descartar cambios', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  expect((await playbackBackup(page)).data).toEqual(fixture.data)
})
