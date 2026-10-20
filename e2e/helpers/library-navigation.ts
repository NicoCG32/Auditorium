import type { Page } from '@playwright/test'

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
