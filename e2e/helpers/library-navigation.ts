import type { Page } from '@playwright/test'

export async function openAlbumArea(
  page: Page,
  area: 'data' | 'tracks' | 'collection' | 'actions',
) {
  const panel = page.locator(`details[data-album-area="${area}"]`)
  if ((await panel.getAttribute('open')) === null)
    await panel.locator(':scope > summary').click()
}

export async function openExperience(page: Page) {
  if (
    !(await page
      .getByRole('button', { name: 'Guardar experiencia', exact: true })
      .count())
  )
    await page
      .getByRole('button', { name: 'Editar experiencia', exact: true })
      .click()
}

export async function openLibraryOptions(page: Page) {
  const menu = page.locator('details.library-utilities')
  if ((await menu.getAttribute('open')) === null)
    await menu.locator('summary').click()
}

export async function openLibraryFilters(page: Page) {
  const toggle = page.getByRole('button', { name: /^Filtros/ })
  if ((await toggle.getAttribute('aria-expanded')) === 'false')
    await toggle.click()
}
