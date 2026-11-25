import { expect, type Page } from '@playwright/test'

export async function waitForOfflineReady(page: Page) {
  const restore = await openSettingsSection(page, 'Aplicación')
  await expect(
    page.getByText('Aplicación preparada para usar sin conexión.', {
      exact: true,
    }),
  ).toBeVisible()
  await restore()
}

export async function openSettingsSection(
  page: Page,
  section:
    'Personalización' | 'Cuenta' | 'Respaldos' | 'Retirados' | 'Aplicación',
) {
  if (
    !(await page
      .getByRole('dialog', { name: 'Ajustes', exact: true })
      .isVisible())
  )
    await expect(
      page.getByRole('button', { name: 'Ajustes', exact: true }),
    ).toBeEnabled()
  const previous = page.url()
  let steps = 0
  await openSettings(page)
  if (page.url() !== previous) steps += 1
  const settingsUrl = page.url()
  await page.getByRole('button', { name: section, exact: true }).click()
  if (page.url() !== settingsUrl) steps += 1
  return async () => {
    const dialog = page.getByRole('dialog', { name: 'Ajustes', exact: true })
    if (await dialog.isVisible())
      await dialog
        .getByRole('button', { name: 'Cerrar ajustes', exact: true })
        .click()
    for (let index = 0; index < steps; index += 1) await page.goBack()
    await expect(page).toHaveURL(previous)
  }
}

export async function openAlbumArea(
  page: Page,
  area:
    | 'data'
    | 'tracks'
    | 'collection'
    | 'wishes'
    | 'experience'
    | 'audio'
    | 'actions',
) {
  const panel = page.locator(`details[data-album-area="${area}"]`)
  if ((await panel.getAttribute('open')) === null)
    await panel.locator(':scope > summary').click()
}

export async function openExperience(page: Page) {
  await openAlbumArea(page, 'experience')
  if (
    !(await page
      .getByRole('button', { name: 'Guardar experiencia', exact: true })
      .count())
  )
    await page
      .getByRole('button', { name: 'Editar experiencia', exact: true })
      .click()
}

export async function openOwnedDetails(page: Page) {
  const panel = page.locator('details.owned-details')
  if ((await panel.getAttribute('open')) === null)
    await panel.locator(':scope > summary').click()
}

export async function openAlbumEditorDetails(page: Page) {
  for (const panel of await page.locator('details.album-edit-details').all()) {
    if ((await panel.getAttribute('open')) === null)
      await panel.locator(':scope > summary').click()
  }
}

export async function openSettings(page: Page) {
  if (
    await page.getByRole('dialog', { name: 'Ajustes', exact: true }).isVisible()
  )
    return
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
}

export async function openLibraryFilters(page: Page) {
  const toggle = page.getByRole('button', { name: /^Filtros/ })
  if ((await toggle.getAttribute('aria-expanded')) === 'false')
    await toggle.click()
}
