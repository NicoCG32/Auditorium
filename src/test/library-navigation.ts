import { fireEvent, screen } from '@testing-library/react'

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
