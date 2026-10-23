import { fireEvent, screen } from '@testing-library/react'

export function openAlbumArea(
  area: 'data' | 'tracks' | 'collection' | 'actions',
) {
  const panel = document.querySelector<HTMLDetailsElement>(
    `details[data-album-area="${area}"]`,
  )
  const summary = panel?.querySelector('summary')
  if (panel && !panel.open && summary) fireEvent.click(summary)
}

export function openExperience() {
  const action = screen.queryByRole('button', { name: 'Editar experiencia' })
  if (action) fireEvent.click(action)
}

export function openLibraryFilters() {
  const toggle = screen.getByRole('button', { name: /^Filtros/ })
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle)
}

export function openLibraryOptions() {
  const menu = document.querySelector<HTMLDetailsElement>(
    'details.library-utilities',
  )
  const summary = menu?.querySelector('summary')
  if (menu && !menu.open && summary) fireEvent.click(summary)
}
