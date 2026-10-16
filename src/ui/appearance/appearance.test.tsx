import { StrictMode } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppearanceControls } from './AppearanceControls'
import { PosterBackdrop } from './PosterBackdrop'
import { APPEARANCE_STORAGE_KEY, useAppearance } from './use-appearance'
import { MAX_POSTER_BYTES, usePosterPreview } from './use-poster-preview'

class PreviewImage {
  static instances: PreviewImage[] = []
  naturalWidth = 640
  naturalHeight = 480
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ''

  constructor() {
    PreviewImage.instances.push(this)
  }
}

class PreviewURL extends URL {
  static createObjectURL = vi.fn(() => `blob:preview-${crypto.randomUUID()}`)
  static revokeObjectURL = vi.fn()
}

beforeEach(() => {
  localStorage.clear()
  PreviewImage.instances = []
  PreviewURL.createObjectURL.mockClear()
  PreviewURL.revokeObjectURL.mockClear()
  vi.stubGlobal('Image', PreviewImage)
  vi.stubGlobal('URL', PreviewURL)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function rasterFile(type = 'image/png') {
  const signature = {
    'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'image/jpeg': [0xff, 0xd8, 0xff],
    'image/webp': [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  }[type]
  const bytes = new Uint8Array(signature ?? [1, 2, 3])
  const file = new File([bytes], 'imagen-ficticia', { type })
  // jsdom aún no implementa Blob.arrayBuffer; mantenemos los bytes reales del caso.
  vi.spyOn(file, 'slice').mockImplementation(() => {
    const slice = new Blob([bytes])
    Object.defineProperty(slice, 'arrayBuffer', {
      value: () => Promise.resolve(bytes.buffer),
    })
    return slice
  })
  return file
}

function lastImage() {
  const image = PreviewImage.instances.at(-1)
  if (!image) throw new Error('La imagen de prueba no se creó.')
  return image
}

async function selectAndLoad(
  chooseFile: (file: File | undefined) => Promise<void>,
  file = rasterFile(),
) {
  let selection!: Promise<void>
  act(() => {
    selection = chooseFile(file)
  })
  await waitFor(() => expect(lastImage().onload).not.toBeNull())
  await act(async () => {
    lastImage().onload?.()
    await selection
  })
}

test('tema oscuro y ambiente iniciales; preferencias mínimas persisten y se recuperan', () => {
  const first = renderHook(useAppearance)
  expect(first.result.current.theme).toBe('dark')
  expect(first.result.current.ambient).toBe(true)
  act(() => {
    first.result.current.setTheme('light')
    first.result.current.setAmbient(false)
  })
  expect(
    JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? ''),
  ).toEqual({
    theme: 'light',
    ambient: false,
  })
  expect(localStorage.length).toBe(1)
  first.unmount()
  const restored = renderHook(useAppearance)
  expect(restored.result.current.theme).toBe('light')
  expect(restored.result.current.ambient).toBe(false)
})

test.each(['{', 'null', '[]', '{"theme":"otro","ambient":"off"}'])(
  'preferencias dañadas o fuera del contrato recuperan valores seguros: %s',
  (saved) => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, saved)
    const { result } = renderHook(useAppearance)
    expect(result.current.theme).toBe('dark')
    expect(result.current.ambient).toBe(true)
  },
)

test('bloqueos de lectura y escritura no impiden usar los controles', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Almacenamiento bloqueado', 'SecurityError')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Cuota no disponible', 'QuotaExceededError')
  })
  const { result } = renderHook(useAppearance)
  act(() => {
    result.current.setTheme('light')
    result.current.setAmbient(false)
  })
  expect(result.current.theme).toBe('light')
  expect(result.current.ambient).toBe(false)
})

test('no crea imágenes hasta elegir archivo y descarta la vista previa al volver a montar', async () => {
  const first = renderHook(usePosterPreview, { wrapper: StrictMode })
  expect(PreviewURL.createObjectURL).not.toHaveBeenCalled()
  expect(PreviewImage.instances).toHaveLength(0)
  await selectAndLoad(first.result.current.chooseFile)
  const url = first.result.current.poster?.url
  expect(first.result.current.poster).toEqual({
    url,
    opacity: 0.12,
    position: 'center',
  })
  expect(localStorage.length).toBe(0)
  first.unmount()
  expect(PreviewURL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(url)
  expect(renderHook(usePosterPreview).result.current.poster).toBeNull()
})

test('reemplazar, quitar y desmontar liberan las referencias de las fotos', async () => {
  const { result, unmount } = renderHook(usePosterPreview)
  await selectAndLoad(result.current.chooseFile)
  const firstUrl = result.current.poster?.url
  await selectAndLoad(result.current.chooseFile, rasterFile('image/jpeg'))
  const secondUrl = result.current.poster?.url
  expect(secondUrl).not.toBe(firstUrl)
  expect(PreviewURL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(firstUrl)
  act(() => result.current.removePoster())
  expect(result.current.poster).toBeNull()
  expect(PreviewURL.revokeObjectURL).toHaveBeenCalledWith(secondUrl)
  await selectAndLoad(result.current.chooseFile, rasterFile('image/webp'))
  const thirdUrl = result.current.poster?.url
  unmount()
  expect(PreviewURL.revokeObjectURL).toHaveBeenCalledWith(thirdUrl)
  expect(PreviewURL.revokeObjectURL).toHaveBeenCalledTimes(3)
})

test('rechaza SVG, exceso de tamaño, firmas falsas y fallo de decodificación conservando la foto anterior', async () => {
  const { result } = renderHook(usePosterPreview)
  await selectAndLoad(result.current.chooseFile)
  const original = result.current.poster
  const oversize = rasterFile()
  Object.defineProperty(oversize, 'size', { value: MAX_POSTER_BYTES + 1 })
  for (const file of [
    new File(['<svg/>'], 'imagen.svg', { type: 'image/svg+xml' }),
    oversize,
    rasterFile('image/bmp'),
  ]) {
    await act(() => result.current.chooseFile(file))
    expect(result.current.error).not.toBeNull()
    expect(result.current.poster).toBe(original)
  }
  const disguised = rasterFile()
  vi.spyOn(disguised, 'slice').mockReturnValue(
    Object.assign(new Blob(), {
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
    }),
  )
  await act(() => result.current.chooseFile(disguised))
  expect(result.current.error).toContain('no contiene una imagen')
  expect(PreviewURL.createObjectURL).toHaveBeenCalledTimes(1)

  let selection!: Promise<void>
  act(() => {
    selection = result.current.chooseFile(rasterFile())
  })
  await waitFor(() => expect(PreviewImage.instances).toHaveLength(2))
  const failedUrl = lastImage().src
  await act(async () => {
    lastImage().onerror?.()
    await selection
  })
  expect(result.current.error).toContain('No pudimos abrir')
  expect(result.current.poster).toBe(original)
  expect(PreviewURL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(failedUrl)
})

test('quitar o desmontar durante la carga cancela la selección sin revivir la foto', async () => {
  const { result, unmount } = renderHook(usePosterPreview)
  let selection!: Promise<void>
  act(() => {
    selection = result.current.chooseFile(rasterFile())
  })
  await waitFor(() => expect(PreviewImage.instances).toHaveLength(1))
  const image = lastImage()
  const lateLoad = image.onload
  await act(async () => {
    result.current.removePoster()
    lateLoad?.()
    await selection
  })
  expect(result.current.poster).toBeNull()
  expect(result.current.preparing).toBe(false)
  expect(image.onload).toBeNull()
  expect(PreviewURL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(image.src)

  act(() => {
    selection = result.current.chooseFile(rasterFile())
  })
  await waitFor(() => expect(PreviewImage.instances).toHaveLength(2))
  const pendingUrl = lastImage().src
  unmount()
  await selection
  expect(PreviewURL.revokeObjectURL).toHaveBeenCalledWith(pendingUrl)
  expect(PreviewURL.revokeObjectURL).toHaveBeenCalledTimes(2)
})

test('una nueva elección cancela la imagen pendiente y sólo muestra la última selección', async () => {
  const { result } = renderHook(usePosterPreview)
  let firstSelection!: Promise<void>
  act(() => {
    firstSelection = result.current.chooseFile(rasterFile())
  })
  await waitFor(() => expect(PreviewImage.instances).toHaveLength(1))
  const firstImage = lastImage()
  const lateLoad = firstImage.onload
  await selectAndLoad(result.current.chooseFile, rasterFile('image/jpeg'))
  await act(async () => {
    lateLoad?.()
    await firstSelection
  })
  expect(result.current.poster?.url).toBe(lastImage().src)
  expect(result.current.poster?.url).not.toBe(firstImage.src)
  expect(PreviewURL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
    firstImage.src,
  )
  expect(result.current.error).toBeNull()
})

test('controles etiquetados permiten ajustar foto, ocultarla con el ambiente y quitarla', async () => {
  function Controls() {
    const appearance = useAppearance()
    const preview = usePosterPreview()
    return (
      <>
        <AppearanceControls appearance={appearance} preview={preview} />
        <PosterBackdrop poster={preview.poster} visible={appearance.ambient} />
      </>
    )
  }
  const { container } = render(<Controls />)
  fireEvent.click(screen.getByText('Apariencia'))
  const fileInput = screen.getByLabelText('Foto de fondo opcional')
  fireEvent.change(fileInput, { target: { files: [rasterFile()] } })
  await waitFor(() => expect(PreviewImage.instances).toHaveLength(1))
  await act(async () => {
    lastImage().onload?.()
    await Promise.resolve()
  })
  expect(screen.getByText(/Vista previa temporal/)).toBeVisible()
  fireEvent.change(
    screen.getByRole('slider', { name: /Opacidad de la foto/ }),
    {
      target: { value: '25' },
    },
  )
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Posición de la foto' }),
    {
      target: { value: 'right' },
    },
  )
  expect(container.querySelector('.appearance-poster')).toHaveStyle({
    opacity: '0.25',
    backgroundPosition: 'right center',
  })
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Ambientación decorativa' }),
  )
  expect(container.querySelector('.appearance-poster')).toBeNull()
  expect(screen.getByText(/La foto está oculta/)).toBeVisible()
  expect(PreviewURL.revokeObjectURL).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Ambientación decorativa' }),
  )
  expect(container.querySelector('.appearance-poster')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Quitar foto' }))
  expect(container.querySelector('.appearance-poster')).toBeNull()
  expect(PreviewURL.revokeObjectURL).toHaveBeenCalledTimes(1)
})
