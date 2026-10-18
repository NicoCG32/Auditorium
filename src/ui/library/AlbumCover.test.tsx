import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AlbumCover } from './AlbumCover'

test('sin portada muestra representación local sin solicitar una imagen', () => {
  render(<AlbumCover title="Eclipse ficticio" />)
  expect(screen.getByText('Sin portada registrada')).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('URL guardada se carga automáticamente y tiene alternativa textual', () => {
  render(
    <AlbumCover
      title="Eclipse ficticio"
      url="https://example.invalid/portada.png"
    />,
  )
  expect(
    screen.getByRole('img', { name: 'Portada de Eclipse ficticio' }),
  ).toHaveAttribute('src', 'https://example.invalid/portada.png')
  expect(screen.getByRole('img')).toHaveAttribute(
    'referrerpolicy',
    'no-referrer',
  )
  expect(
    screen.queryByRole('button', { name: 'Mostrar portada' }),
  ).not.toBeInTheDocument()
})

test('imagen local se presenta automáticamente sin recurrir al enlace remoto', () => {
  const image = 'data:image/png;base64,iVBORw0KGgoAAAAA'
  render(
    <AlbumCover
      title="Eclipse ficticio"
      image={image}
      url="https://example.invalid/no-usar.png"
    />,
  )
  expect(screen.getByRole('img')).toHaveAttribute('src', image)
})

test('fallo de portada vuelve a placeholder y permite reintentar sin cambiar datos', () => {
  render(
    <AlbumCover
      title="Eclipse ficticio"
      url="https://example.invalid/portada.png"
    />,
  )
  const firstImage = screen.getByRole('img')
  fireEvent.error(firstImage)
  expect(screen.getByRole('status')).toHaveTextContent(
    'No pudimos cargar la portada',
  )
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar portada' }))
  expect(
    screen.getByRole('img', { name: 'Portada de Eclipse ficticio' }),
  ).toBeVisible()
  expect(screen.getByRole('img')).not.toBe(firstImage)
})

test('un cambio de fuente se muestra automáticamente aunque haya fallado la portada anterior', () => {
  const { rerender } = render(
    <AlbumCover
      title="Eclipse ficticio"
      url="https://example.invalid/primera.png"
    />,
  )
  const previous = screen.getByRole('img')
  fireEvent.error(previous)
  rerender(
    <AlbumCover
      title="Eclipse corregido"
      url="https://example.invalid/segunda.jpg"
    />,
  )
  expect(screen.getByRole('img')).toHaveAttribute(
    'src',
    'https://example.invalid/segunda.jpg',
  )
  expect(screen.getByRole('img')).toHaveAccessibleName(
    'Portada de Eclipse corregido',
  )
  fireEvent.error(previous)
  expect(screen.getByRole('img')).toBeVisible()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('modo compacto conserva la imagen o el arte local sin añadir controles a las tarjetas', () => {
  const { rerender } = render(<AlbumCover title="Eclipse ficticio" compact />)
  expect(screen.queryByText('Sin portada registrada')).not.toBeInTheDocument()
  rerender(
    <AlbumCover
      title="Eclipse ficticio"
      url="https://example.invalid/portada.png"
      compact
    />,
  )
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
