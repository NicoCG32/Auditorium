import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { CatalogNameInput } from './CatalogNameInput'

const options = [
  { id: 'death', label: 'Death Metal', search: 'death metal' },
  { id: 'doom', label: 'Doom Metal', search: 'doom metal' },
]
function Harness({ initial = '', chosen = vi.fn(), submitted = vi.fn() } = {}) {
  const [value, setValue] = useState(initial)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submitted()
      }}
    >
      <label>
        Géneros
        <CatalogNameInput
          value={value}
          aria-label="Géneros"
          onChange={setValue}
          options={options}
          genres
          suggestionsLabel="Géneros locales"
          onChoose={chosen}
        />
      </label>
      <input aria-label="Siguiente campo" />
      <button>Guardar</button>
    </form>
  )
}

test('flechas y Enter seleccionan sin enviar; foco y valor quedan en el campo', async () => {
  const chosen = vi.fn(),
    submitted = vi.fn()
  render(<Harness chosen={chosen} submitted={submitted} />)
  const field = screen.getByRole('combobox', { name: 'Géneros' })
  field.focus()
  fireEvent.change(field, { target: { value: 'De' } })
  expect(field).toHaveAttribute('aria-expanded', 'true')
  expect(field).not.toHaveAttribute('aria-activedescendant')
  fireEvent.keyDown(field, { key: 'ArrowDown' })
  expect(field).toHaveAttribute(
    'aria-activedescendant',
    screen.getByRole('option').id,
  )
  fireEvent.keyDown(field, { key: 'Enter' })
  expect(field).toHaveValue('Death Metal')
  expect(chosen).toHaveBeenCalledTimes(1)
  expect(submitted).not.toHaveBeenCalled()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  await waitFor(() => expect(field).toHaveFocus())
})

test('Escape y Tab conservan lo escrito y no eligen por defecto', () => {
  const chosen = vi.fn()
  render(<Harness chosen={chosen} />)
  const field = screen.getByRole('combobox')
  fireEvent.change(field, { target: { value: 'D' } })
  fireEvent.keyDown(field, { key: 'ArrowUp' })
  expect(screen.getByRole('option', { selected: true })).toHaveTextContent(
    'Doom Metal',
  )
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(field).toHaveValue('D')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  fireEvent.keyDown(field, { key: 'ArrowDown' })
  fireEvent.keyDown(field, { key: 'Tab' })
  expect(field).toHaveValue('D')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(chosen).not.toHaveBeenCalled()
})

test('texto nuevo y edición manual permanecen libres; blur no aplica una sugerencia', () => {
  const chosen = vi.fn()
  render(<Harness chosen={chosen} />)
  const field = screen.getByRole('combobox')
  fireEvent.change(field, { target: { value: 'De' } })
  fireEvent.keyDown(field, { key: 'ArrowDown' })
  fireEvent.blur(field)
  expect(field).toHaveValue('De')
  expect(chosen).not.toHaveBeenCalled()
  fireEvent.change(field, { target: { value: 'Género Nuevo' } })
  expect(field).toHaveValue('Género Nuevo')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

test('composición IME no confirma y el clic explícito elige una sola opción', () => {
  const chosen = vi.fn()
  render(<Harness chosen={chosen} />)
  const field = screen.getByRole('combobox')
  fireEvent.change(field, { target: { value: 'De' } })
  fireEvent.keyDown(field, { key: 'ArrowDown' })
  fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
  expect(chosen).not.toHaveBeenCalled()
  fireEvent.pointerDown(screen.getByRole('option'))
  expect(chosen).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('option'))
  expect(field).toHaveValue('Death Metal')
  expect(chosen).toHaveBeenCalledTimes(1)
})

test('una etiqueta ya presente se excluye de las sugerencias de otro fragmento', () => {
  render(<Harness />)
  const field = screen.getByRole('combobox')
  fireEvent.change(field, { target: { value: 'Death Metal, De' } })
  expect(screen.queryByRole('option')).not.toBeInTheDocument()
  fireEvent.change(field, { target: { value: 'Death Metal, Do' } })
  fireEvent.click(screen.getByRole('option'))
  expect(field).toHaveValue('Death Metal, Doom Metal')
})

test('Enter sin opción activa conserva el texto sin elegir ni enviar el formulario', () => {
  const chosen = vi.fn(),
    submitted = vi.fn()
  render(<Harness chosen={chosen} submitted={submitted} />)
  const field = screen.getByRole('combobox')
  fireEvent.change(field, { target: { value: 'De' } })
  fireEvent.keyDown(field, { key: 'Enter' })
  expect(field).toHaveValue('De')
  expect(chosen).not.toHaveBeenCalled()
  expect(submitted).not.toHaveBeenCalled()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

test('elegir no recupera el foco después de avanzar rápidamente al siguiente campo', async () => {
  render(<Harness />)
  const field = screen.getByRole('combobox')
  fireEvent.change(field, { target: { value: 'De' } })
  fireEvent.click(screen.getByRole('option'))
  const next = screen.getByRole('textbox', { name: 'Siguiente campo' })
  await act(async () => {
    next.focus()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  expect(next).toHaveFocus()
})
