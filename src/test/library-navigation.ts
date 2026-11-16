import { fireEvent, screen } from '@testing-library/react'

export function openAlbumArea(
  area:
    | 'data'
    | 'tracks'
    | 'collection'
    | 'wishes'
    | 'experience'
    | 'audio'
    | 'actions',
) {
  const panel = document.querySelector<HTMLDetailsElement>(
    `details[data-album-area="${area}"]`,
  )
  const summary = panel?.querySelector('summary')
  if (panel && !panel.open && summary) fireEvent.click(summary)
}

export function openExperience() {
  openAlbumArea('experience')
  const action = screen.queryByRole('button', { name: 'Editar experiencia' })
  if (action) fireEvent.click(action)
}

export function openOwnedDetails() {
  const panel = document.querySelector<HTMLDetailsElement>('.owned-details')
  const summary = panel?.querySelector('summary')
  if (panel && !panel.open && summary) fireEvent.click(summary)
}

export function openAlbumEditorDetails() {
  for (const panel of document.querySelectorAll<HTMLDetailsElement>(
    'details.album-edit-details',
  )) {
    const summary = panel.querySelector('summary')
    if (!panel.open && summary) fireEvent.click(summary)
  }
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
