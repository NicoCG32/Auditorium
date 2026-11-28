import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { PALETTES, parsePersonalDesign } from '../src/domain/personal-design'
import { PERSONAL_DESIGN_STORAGE_KEY } from '../src/infrastructure/browser/personal-design-storage'
import { readStoredZip } from '../src/infrastructure/browser/stored-zip'
import { makeBackup } from '../src/domain/backup.fixture'
import { serializeBackup } from '../src/domain/backup'
import { openSettings, waitForOfflineReady } from './helpers/library-navigation'
import { openBackups } from './helpers/audio-fixture'

test.use({ serviceWorkers: 'block' })
async function settings(page: Page) {
  await openSettings(page)
  return page.getByRole('dialog', { name: 'Ajustes', exact: true })
}
async function wallpaper(page: Page, color = '#236b91') {
  const buffer = Buffer.from(
    await page.evaluate((color) => {
      const canvas = document.createElement('canvas')
      canvas.width = 2800
      canvas.height = 1400
      const context = canvas.getContext('2d')!
      context.fillStyle = color
      context.fillRect(0, 0, 2800, 1400)
      context.fillStyle = '#192e39'
      context.fillRect(0, 1000, 2800, 400)
      return canvas.toDataURL('image/png').split(',')[1]!
    }, color),
    'base64',
  )
  await page.getByLabel('Imagen de fondo', { exact: true }).setInputFiles({
    name: 'wallpaper-ficticio.png',
    mimeType: 'image/png',
    buffer,
  })
  await expect(
    page.getByRole('button', { name: 'Quitar imagen', exact: true }),
  ).toBeVisible()
  return buffer
}
async function accessible(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true)
}
async function saved(page: Page) {
  return parsePersonalDesign(
    await page.evaluate(
      (key) => localStorage.getItem(key)!,
      PERSONAL_DESIGN_STORAGE_KEY,
    ),
  )
}
async function download(page: Page, name: string) {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name, exact: true }).click()
  const path = await (await event).path()
  if (!path) throw new Error('No se descargó el archivo ficticio.')
  return path
}

test('wallpaper persistente, paleta automática y ajustes manuales funcionan también a 320px', async ({
  page,
}) => {
  await page.goto('/')
  const panel = await settings(page)
  const png = await wallpaper(page)
  await expect(page.locator('.app-workspace')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
  await expect(page.locator('.aud-app')).toHaveAttribute(
    'data-aud-palette',
    'ocean',
  )
  expect((await saved(page)).wallpaper).toMatchObject({
    width: 1920,
    height: 960,
    palette: 'ocean',
  })
  expect((await saved(page)).wallpaper!.url.length).toBeLessThanOrEqual(600000)
  await panel.getByText('Ajustar imagen', { exact: true }).click()
  await panel
    .getByRole('combobox', { name: 'Encuadre', exact: true })
    .selectOption('right')
  const slider = panel.getByRole('slider', { name: /Intensidad/ })
  await slider.focus()
  await slider.press('Home')
  await slider.press('ArrowRight')
  await expect(page.locator('.appearance-poster')).toHaveCSS('opacity', '0.11')
  await panel.getByText('Violeta', { exact: true }).click()
  await wallpaper(page, '#287a40')
  await expect(page.locator('.aud-app')).toHaveAttribute(
    'data-aud-palette',
    'violet',
  )
  await panel
    .getByRole('radio', { name: 'Combinar con el fondo', exact: true })
    .check()
  await expect(page.locator('.aud-app')).toHaveAttribute(
    'data-aud-palette',
    'forest',
  )
  const before = await saved(page)
  await page.reload()
  await expect(page.locator('.appearance-poster')).toHaveCount(1)
  expect(await saved(page)).toEqual(before)
  const reopened = await settings(page)
  await page.setViewportSize({ width: 320, height: 850 })
  await accessible(page)
  await reopened.getByRole('radio', { name: 'Claro', exact: true }).check()
  await accessible(page)
  await reopened
    .getByRole('button', { name: 'Quitar imagen', exact: true })
    .click()
  await expect(page.locator('.appearance-poster')).toHaveCount(0)
  await page.reload()
  expect((await saved(page)).wallpaper).toBeNull()
  if (test.info().project.name === 'chromium') {
    await mkdir('.vitest', { recursive: true })
    await writeFile('.vitest/wallpaper-demo.png', png)
  }
})

test('las seis paletas mantienen contraste en superficies, botones y foco en ambos temas', async ({
  page,
}) => {
  await page.goto('/')
  const panel = await settings(page)
  for (const theme of ['Oscuro', 'Claro']) {
    const accents = new Set<string>()
    await panel.getByRole('radio', { name: theme, exact: true }).check()
    for (const palette of PALETTES) {
      await panel.getByText(palette.name, { exact: true }).click()
      const ratios = await page.locator('.aud-app').evaluate((element) => {
        const style = getComputedStyle(element)
        function luminance(color: string) {
          const hex = color.trim().slice(1)
          const values = (
            hex.length === 3 ? [...hex].map((v) => v + v) : hex.match(/../g)!
          ).map((v) => {
            const value = parseInt(v, 16) / 255
            return value <= 0.04045
              ? value / 12.92
              : ((value + 0.055) / 1.055) ** 2.4
          })
          return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722
        }
        function ratio(a: string, b: string) {
          const x = luminance(style.getPropertyValue(a)),
            y = luminance(style.getPropertyValue(b))
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
        }
        return {
          accent: style.getPropertyValue('--accent').trim(),
          text: ['--background', '--surface', '--surface-raised'].flatMap(
            (bg) =>
              ['--foreground', '--muted', '--accent-text'].map((fg) => ({
                pair: `${fg}/${bg}`,
                ratio: ratio(fg, bg),
              })),
          ),
          button: [
            ratio('--on-accent', '--accent'),
            ratio('--on-accent', '--accent-hover'),
          ],
          focus: [
            ratio('--focus', '--background'),
            ratio('--focus', '--surface-raised'),
          ],
        }
      })
      accents.add(ratios.accent)
      for (const entry of ratios.text)
        expect(
          entry.ratio,
          `${theme}/${palette.name}/${entry.pair}`,
        ).toBeGreaterThanOrEqual(4.5)
      for (const ratio of ratios.button)
        expect(ratio, `${theme}/${palette.name}/botón`).toBeGreaterThanOrEqual(
          4.5,
        )
      for (const ratio of ratios.focus)
        expect(ratio, `${theme}/${palette.name}/foco`).toBeGreaterThanOrEqual(3)
      await expect(page.locator('html')).toHaveAttribute(
        'data-aud-palette',
        palette.id,
      )
    }
    expect(accents.size).toBe(PALETTES.length)
    await accessible(page)
  }
})

test('guardar, revisar y abrir un diseño recupera imagen y presentación sin aplicar archivos inválidos', async ({
  page,
}) => {
  await page.goto('/')
  const panel = await settings(page)
  await wallpaper(page)
  await panel
    .getByRole('textbox', { name: 'Nombre de tu colección' })
    .fill('Discos de casa')
  await panel
    .getByRole('combobox', { name: 'Tamaño de las portadas' })
    .selectOption('large')
  await panel.getByRole('radio', { name: 'Claro', exact: true }).check()
  await panel.getByText('Guardar o abrir un diseño', { exact: true }).click()
  const path = await download(page, 'Guardar diseño')
  const design = parsePersonalDesign(await readFile(path, 'utf8'))
  expect(design).toEqual(await saved(page))
  await panel.getByRole('radio', { name: 'Oscuro', exact: true }).check()
  await panel
    .getByRole('textbox', { name: 'Nombre de tu colección' })
    .fill('Otro diseño')
  const current = await saved(page)
  await panel.getByLabel('Abrir diseño', { exact: true }).setInputFiles(path)
  await expect(
    panel.getByRole('button', { name: 'Aplicar diseño', exact: true }),
  ).toBeFocused()
  expect(await saved(page)).toEqual(current)
  await panel
    .getByRole('button', { name: 'Aplicar diseño', exact: true })
    .click()
  expect(await saved(page)).toEqual(design)
  await panel.getByLabel('Abrir diseño', { exact: true }).setInputFiles({
    name: 'invalido.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...design, css: '*{display:none}' })),
  })
  await expect(panel.getByRole('alert')).toContainText('diseño válido')
  expect(await saved(page)).toEqual(design)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Discos de casa', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.aud-app')).toHaveAttribute(
    'data-aud-theme',
    'light',
  )
})

test('respaldo completo traslada el diseño y permite conservar el del destino', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  await openBackups(page)
  await page.locator('#backup-file').setInputFiles({
    name: 'biblioteca-ficticia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeBackup(makeBackup())),
  })
  await page
    .getByRole('button', { name: 'Confirmar restauración', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Eclipse', exact: true }),
  ).toBeVisible()
  const panel = await settings(page)
  await wallpaper(page)
  await panel
    .getByRole('textbox', { name: 'Nombre de tu colección' })
    .fill('Discos de casa')
  const design = await saved(page)
  await panel.getByRole('button', { name: 'Respaldos', exact: true }).click()
  const path = await download(page, 'Descargar respaldo completo (ZIP)')
  const entries = await readStoredZip(new Uint8Array(await readFile(path)))
  expect(
    JSON.parse(new TextDecoder().decode(entries.get('audio-manifest.json'))),
  ).toMatchObject({ version: 3 })
  expect(
    parsePersonalDesign(new TextDecoder().decode(entries.get('design.json'))),
  ).toEqual(design)
  for (const mode of ['apply', 'keep', 'retry']) {
    const apply = mode !== 'keep'
    const context = await browser.newContext({ serviceWorkers: 'block' })
    try {
      if (mode === 'retry')
        await context.addInitScript((key) => {
          let blocked = true
          window.addEventListener('allow-design-test', () => {
            blocked = false
          })
          const write = Reflect.get(Storage.prototype, 'setItem')
          Storage.prototype.setItem = function (name, value) {
            if (name === key && blocked)
              throw new DOMException('Cuota ficticia', 'QuotaExceededError')
            write.call(this, name, value)
          }
        }, PERSONAL_DESIGN_STORAGE_KEY)
      const target = await context.newPage()
      await target.goto(new URL('/', page.url()).toString())
      await openBackups(target)
      await target.locator('#complete-audio-file').setInputFiles(path)
      const confirm = target.getByRole('dialog', {
        name: 'Confirmar restauración completa',
        exact: true,
      })
      await expect(confirm).toBeVisible()
      if (!apply)
        await confirm
          .getByRole('checkbox', {
            name: 'Usar también el diseño del respaldo',
          })
          .uncheck()
      await confirm
        .getByRole('button', {
          name: 'Confirmar restauración completa',
          exact: true,
        })
        .click()
      if (mode === 'retry') {
        await expect(target.getByRole('alert')).toContainText(
          'Tu colección ya está restaurada',
        )
        await expect(target.locator('#complete-audio-file')).toBeDisabled()
        await target.evaluate(() =>
          window.dispatchEvent(new Event('allow-design-test')),
        )
        await target
          .getByRole('button', {
            name: 'Reintentar guardar diseño',
            exact: true,
          })
          .click()
      }
      await expect(
        target.getByRole('button', { name: 'Eclipse', exact: true }),
      ).toBeVisible()
      await expect(
        target.getByRole('heading', {
          name: apply ? 'Discos de casa' : 'Mi colección',
          exact: true,
        }),
      ).toBeVisible()
      if (apply) expect(await saved(target)).toEqual(design)
      else await expect(target.locator('.appearance-poster')).toHaveCount(0)
      await target.reload()
      await expect(
        target.getByRole('button', { name: 'Eclipse', exact: true }),
      ).toBeVisible()
    } finally {
      await context.close()
    }
  }
})

test.describe('Diseño sin conexión', () => {
  test.use({ serviceWorkers: 'allow' })
  test('la PWA vuelve a abrir el fondo y sus colores con el dispositivo sin red', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await waitForOfflineReady(page)
    const panel = await settings(page)
    await wallpaper(page)
    const before = await saved(page)
    await panel
      .getByRole('button', { name: 'Cerrar ajustes', exact: true })
      .click()
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('.appearance-poster')).toHaveCount(1)
    await expect(page.locator('.aud-app')).toHaveAttribute(
      'data-aud-palette',
      'ocean',
    )
    expect(await saved(page)).toEqual(before)
    const offlinePanel = await settings(page)
    await expect(
      offlinePanel.getByRole('button', { name: 'Quitar imagen', exact: true }),
    ).toBeVisible()
    await offlinePanel.getByText('Bosque', { exact: true }).click()
    await expect(page.locator('.aud-app')).toHaveAttribute(
      'data-aud-palette',
      'forest',
    )
    await accessible(page)
  })
})
