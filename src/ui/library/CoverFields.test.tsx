import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  CoverImageError,
  readCoverImage,
} from '../../infrastructure/browser/cover-image'
import { CoverFields } from './CoverFields'

vi.mock('../../infrastructure/browser/cover-image', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../infrastructure/browser/cover-image')
    >()
  return { ...original, readCoverImage: vi.fn() }
})

const localImage = 'data:image/png;base64,iVBORw0KGgoAAAAA'
const pngFile = () =>
  new File(['imagen simulada'], 'portada.png', { type: 'image/png' })
const read = vi.mocked(readCoverImage)

function Harness({
  initialUrl = '',
  initialImage,
  onChange = vi.fn(),
  onBusyChange = vi.fn(),
}: {
  initialUrl?: string
  initialImage?: string
  onChange?: (value: {
    coverUrl: string
    coverImage: string | undefined
  }) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const [value, setValue] = useState({
    coverUrl: initialUrl,
    coverImage: initialImage,
  })
  return (
    <CoverFields
      url={value.coverUrl}
      image={value.coverImage}
      onBusyChange={onBusyChange}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

beforeEach(() => {
  read.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

test('previsualiza una portada HTTPS automáticamente al completar el enlace y espera para no cargar cada pulsación', async () => {
  vi.useFakeTimers()
  render(<Harness />)
  fireEvent.change(screen.getByLabelText('Enlace a portada (HTTPS)'), {
    target: { value: 'https://example.invalid/primer.png' },
  })
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  await act(() => vi.advanceTimersByTime(300))
  fireEvent.change(screen.getByLabelText('Enlace a portada (HTTPS)'), {
    target: { value: 'https://example.invalid/final.png' },
  })
  await act(() => vi.advanceTimersByTime(499))
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  await act(() => vi.advanceTimersByTime(1))
  expect(screen.getByRole('img')).toHaveAttribute(
    'src',
    'https://example.invalid/final.png',
  )
  fireEvent.change(screen.getByLabelText('Enlace a portada (HTTPS)'), {
    target: { value: 'http://example.invalid/inseguro.png' },
  })
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('una portada inicial se presenta al abrir el formulario y permite quitarla', () => {
  const changed = vi.fn()
  render(<Harness initialImage={localImage} onChange={changed} />)
  expect(screen.getByRole('img')).toHaveAttribute('src', localImage)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar portada' }))
  expect(changed).toHaveBeenCalledWith({ coverUrl: '', coverImage: undefined })
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('prepara el archivo, notifica bloqueo de guardado y sustituye el enlace sólo al completar la lectura', async () => {
  const busy = vi.fn()
  const changed = vi.fn()
  let resolve: (image: string) => void = () => undefined
  read.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  render(
    <Harness
      initialUrl="https://example.invalid/previa.png"
      onBusyChange={busy}
      onChange={changed}
    />,
  )
  fireEvent.change(screen.getByLabelText('Archivo de portada (JPG o PNG)'), {
    target: { files: [pngFile()] },
  })
  expect(screen.getByRole('status')).toHaveTextContent('Preparando portada')
  expect(busy).toHaveBeenLastCalledWith(true)
  expect(changed).not.toHaveBeenCalled()
  await act(() => {
    resolve(localImage)
    return Promise.resolve()
  })
  expect(changed).toHaveBeenCalledWith({ coverUrl: '', coverImage: localImage })
  expect(screen.getByLabelText('Enlace a portada (HTTPS)')).toHaveValue('')
  expect(screen.getByRole('img')).toHaveAttribute('src', localImage)
  expect(busy).toHaveBeenLastCalledWith(false)
})

test('un archivo no válido conserva la portada anterior y permite elegir el mismo archivo otra vez', async () => {
  read.mockRejectedValue(new CoverImageError('invalid'))
  const changed = vi.fn()
  render(<Harness initialImage={localImage} onChange={changed} />)
  const input = screen.getByLabelText('Archivo de portada (JPG o PNG)')
  const file = pngFile()
  fireEvent.change(input, { target: { files: [file] } })
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'no contiene una imagen JPG o PNG válida',
  )
  expect(changed).not.toHaveBeenCalled()
  expect(screen.getByRole('img')).toHaveAttribute('src', localImage)
  expect(input).toHaveValue('')
  fireEvent.change(input, { target: { files: [file] } })
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
})

test('un enlace nuevo cancela un archivo pendiente y descarta su resultado tardío', async () => {
  let resolve: (image: string) => void = () => undefined
  read.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const changed = vi.fn()
  render(<Harness onChange={changed} />)
  fireEvent.change(screen.getByLabelText('Archivo de portada (JPG o PNG)'), {
    target: { files: [pngFile()] },
  })
  const signal = read.mock.calls[0]?.[1]?.signal
  fireEvent.change(screen.getByLabelText('Enlace a portada (HTTPS)'), {
    target: { value: 'https://example.invalid/nueva.png' },
  })
  expect(signal?.aborted).toBe(true)
  await act(() => {
    resolve(localImage)
    return Promise.resolve()
  })
  expect(changed).toHaveBeenCalledExactlyOnceWith({
    coverUrl: 'https://example.invalid/nueva.png',
    coverImage: undefined,
  })
  expect(screen.getByLabelText('Enlace a portada (HTTPS)')).toHaveValue(
    'https://example.invalid/nueva.png',
  )
})

test('una segunda selección descarta el primer archivo aunque termine después', async () => {
  const resolves: ((image: string) => void)[] = []
  read.mockImplementation(
    () =>
      new Promise((done) => {
        resolves.push(done)
      }),
  )
  const changed = vi.fn()
  render(<Harness onChange={changed} />)
  const input = screen.getByLabelText('Archivo de portada (JPG o PNG)')
  fireEvent.change(input, { target: { files: [pngFile()] } })
  fireEvent.change(input, { target: { files: [pngFile()] } })
  await act(() => {
    resolves[1]?.(localImage)
    return Promise.resolve()
  })
  await act(() => {
    resolves[0]?.('data:image/png;base64,descartar')
    return Promise.resolve()
  })
  expect(changed).toHaveBeenCalledExactlyOnceWith({
    coverUrl: '',
    coverImage: localImage,
  })
})

test('al salir cancela la lectura, libera el bloqueo y no entrega resultados tardíos', async () => {
  let resolve: (image: string) => void = () => undefined
  read.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const busy = vi.fn()
  const changed = vi.fn()
  const { unmount } = render(<Harness onBusyChange={busy} onChange={changed} />)
  fireEvent.change(screen.getByLabelText('Archivo de portada (JPG o PNG)'), {
    target: { files: [pngFile()] },
  })
  const signal = read.mock.calls[0]?.[1]?.signal
  unmount()
  expect(signal?.aborted).toBe(true)
  expect(busy).toHaveBeenLastCalledWith(false)
  await act(() => {
    resolve(localImage)
    return Promise.resolve()
  })
  expect(changed).not.toHaveBeenCalled()
})

test('expone errores de validación y respeta el bloqueo del formulario', () => {
  render(
    <CoverFields
      url=""
      onChange={vi.fn()}
      disabled
      error="El enlace debe usar HTTPS."
    />,
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'El enlace debe usar HTTPS',
  )
  expect(screen.getByLabelText('Enlace a portada (HTTPS)')).toBeDisabled()
  expect(screen.getByLabelText('Archivo de portada (JPG o PNG)')).toBeDisabled()
})
