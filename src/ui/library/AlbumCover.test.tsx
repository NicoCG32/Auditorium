import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AlbumCover } from './AlbumCover'

test('sin portada muestra representación local sin solicitar una imagen', () => {
  render(<AlbumCover title="Eclipse ficticio" />)
  expect(screen.getByText('Sin portada registrada')).toBeVisible()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
test('URL guardada se carga solo al elegir mostrarla y tiene alternativa textual', () => {
  render(
    <AlbumCover
      title="Eclipse ficticio"
      url="https://example.invalid/portada.svg"
    />,
  )
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar portada' }))
  expect(
    screen.getByRole('img', { name: 'Portada de Eclipse ficticio' }),
  ).toHaveAttribute('src', 'https://example.invalid/portada.svg')
  expect(screen.getByRole('img')).toHaveAttribute(
    'referrerpolicy',
    'no-referrer',
  )
})
test('fallo de portada vuelve a placeholder y permite reintentar sin cambiar datos', () => {
  render(
    <AlbumCover
      title="Eclipse ficticio"
      url="https://example.invalid/portada.svg"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar portada' }))
  fireEvent.error(screen.getByRole('img'))
  expect(screen.getByRole('status')).toHaveTextContent(
    'No pudimos cargar la portada',
  )
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar portada' }))
  expect(
    screen.getByRole('img', { name: 'Portada de Eclipse ficticio' }),
  ).toBeVisible()
})
