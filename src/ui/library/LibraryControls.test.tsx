import { openLibraryFilters } from '../../test/library-navigation'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  defaultLibraryFilters,
  type LibraryAlbum,
} from '../../application/library-query'
import { LibraryControls } from './LibraryControls'

const albums: LibraryAlbum[] = [
  {
    id: 'entrada-ficticia-1',
    albumId: 'album-ficticio-1',
    title: 'Horizonte ficticio',
    artist: 'Artista ficticio',
    searchText: 'horizonte ficticio artista ficticio jazz espana',
    listeningStatus: 'queued',
    addedAt: '2026-01-01T00:00:00Z',
    genres: ['Jazz'],
    countries: ['España'],
  },
  {
    id: 'entrada-ficticia-2',
    albumId: 'album-ficticio-2',
    title: 'Otro horizonte ficticio',
    artist: 'Otro artista ficticio',
    searchText: 'otro horizonte ficticio artista ficticio rock chile',
    listeningStatus: 'completed',
    addedAt: '2026-01-02T00:00:00Z',
    genres: ['Rock'],
    countries: ['Chile'],
  },
]

test('mantiene todas las opciones aunque otros filtros estén seleccionados', () => {
  const onChange = vi.fn()
  render(
    <LibraryControls
      albums={albums}
      filters={{ ...defaultLibraryFilters, genre: 'jazz', country: 'espana' }}
      onChange={onChange}
      view="grid"
      onViewChange={vi.fn()}
    />,
  )
  openLibraryFilters()
  const genre = screen.getByRole('combobox', { name: 'Género' })
  openLibraryFilters()
  const country = screen.getByRole('combobox', { name: 'País de origen' })
  expect(
    within(genre)
      .getAllByRole('option')
      .map((row) => row.textContent),
  ).toEqual(['Todos los géneros', 'Jazz', 'Rock'])
  expect(
    within(country)
      .getAllByRole('option')
      .map((row) => row.textContent),
  ).toEqual(['Todos los países', 'Chile', 'España'])
  fireEvent.change(country, { target: { value: 'chile' } })
  expect(onChange).toHaveBeenLastCalledWith({
    ...defaultLibraryFilters,
    genre: 'jazz',
    country: 'chile',
  })
  fireEvent.change(genre, { target: { value: '' } })
  expect(onChange).toHaveBeenLastCalledWith({
    ...defaultLibraryFilters,
    genre: '',
    country: 'espana',
  })
})

test('una biblioteca anterior sin metadatos permite todos los filtros y nuevos órdenes', () => {
  const onChange = vi.fn()
  render(
    <LibraryControls
      filters={defaultLibraryFilters}
      onChange={onChange}
      view="list"
      onViewChange={vi.fn()}
    />,
  )
  openLibraryFilters()
  expect(
    screen.getByRole('option', { name: 'Todos los géneros' }),
  ).toBeVisible()
  expect(screen.getByRole('option', { name: 'Todos los países' })).toBeVisible()
  const order = screen.getByRole('combobox', { name: 'Ordenar por' })
  fireEvent.change(order, { target: { value: 'country' } })
  expect(onChange).toHaveBeenLastCalledWith({
    ...defaultLibraryFilters,
    order: 'country',
  })
  fireEvent.change(order, { target: { value: 'genre' } })
  expect(onChange).toHaveBeenLastCalledWith({
    ...defaultLibraryFilters,
    order: 'genre',
  })
  expect(screen.getByRole('searchbox')).toHaveAttribute(
    'placeholder',
    'Título, artista, género o país…',
  )
})

test('los filtros comienzan plegados y anuncian cuántas selecciones hay', () => {
  const onChange = vi.fn()
  render(
    <LibraryControls
      albums={albums}
      filters={{
        ...defaultLibraryFilters,
        genre: 'jazz',
        country: 'espana',
        search: 'horizonte',
        order: 'title',
      }}
      onChange={onChange}
      view="grid"
      onViewChange={vi.fn()}
    />,
  )
  const toggle = screen.getByRole('button', { name: 'Filtros (2)' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('combobox', { name: 'Género' })).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Quitar filtro Género: Jazz' }),
  ).toBeVisible()
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('combobox', { name: 'Género' })).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Quitar filtro Género: Jazz' }),
  )
  expect(onChange).toHaveBeenLastCalledWith({
    ...defaultLibraryFilters,
    country: 'espana',
    search: 'horizonte',
    order: 'title',
    genre: '',
  })
})

test('un filtro conserva su valor visible si una edición o retirada elimina su última coincidencia', () => {
  const props = {
    filters: { ...defaultLibraryFilters, genre: 'rock', country: 'chile' },
    onChange: vi.fn(),
    view: 'grid' as const,
    onViewChange: vi.fn(),
  }
  const { rerender } = render(<LibraryControls {...props} albums={albums} />)
  rerender(<LibraryControls {...props} albums={[]} />)
  openLibraryFilters()
  expect(screen.getByRole('combobox', { name: 'Género' })).toHaveValue('rock')
  openLibraryFilters()
  expect(screen.getByRole('combobox', { name: 'País de origen' })).toHaveValue(
    'chile',
  )
  expect(
    screen.getByRole('option', { name: 'rock (sin coincidencias)' }),
  ).toBeVisible()
  expect(
    screen.getByRole('option', { name: 'chile (sin coincidencias)' }),
  ).toBeVisible()
})
