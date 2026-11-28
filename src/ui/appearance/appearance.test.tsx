import { StrictMode, type ReactNode } from 'react'
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { AppearanceControls } from './AppearanceControls'
import { PosterBackdrop } from './PosterBackdrop'
import { APPEARANCE_STORAGE_KEY, useAppearance } from './use-appearance'
import { usePosterPreview } from './use-poster-preview'
import { PersonalDesignProvider } from './PersonalDesignProvider'
import { PERSONAL_DESIGN_STORAGE_KEY } from '../../infrastructure/browser/personal-design-storage'
import {
  prepareWallpaper,
  WallpaperError,
} from '../../infrastructure/browser/wallpaper'
import { syntheticWallpaper } from '../../test/personal-design.fixture'
import { usePersonalDesign } from './personal-design-context'

vi.mock('../../infrastructure/browser/wallpaper', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../infrastructure/browser/wallpaper')
  >()),
  prepareWallpaper: vi.fn(),
  verifyWallpaper: vi.fn(),
}))
const prepare = vi.mocked(prepareWallpaper)
const file = () => new File(['ficticio'], 'fondo.png', { type: 'image/png' })
const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <PersonalDesignProvider>{children}</PersonalDesignProvider>
  </StrictMode>
)
beforeEach(() => {
  localStorage.clear()
  prepare.mockReset()
  prepare.mockResolvedValue(syntheticWallpaper())
})

function useControls() {
  return {
    appearance: useAppearance(),
    preview: usePosterPreview(),
    personal: usePersonalDesign(),
  }
}

test('tema, paleta y wallpaper persisten juntos al reabrir y el modo automático combina con la imagen', async () => {
  const first = renderHook(useControls, { wrapper })
  expect(first.result.current.appearance).toMatchObject({
    theme: 'dark',
    ambient: false,
    resolvedPalette: 'garnet',
  })
  expect(prepare).not.toHaveBeenCalled()
  await act(() => first.result.current.preview.chooseFile(file()))
  act(() => first.result.current.appearance.setTheme('light'))
  act(() => first.result.current.preview.setPosition('right'))
  act(() => first.result.current.preview.setOpacity(0.5))
  const saved = first.result.current.personal.design
  expect(first.result.current.appearance.resolvedPalette).toBe('forest')
  expect(localStorage.length).toBe(1)
  first.unmount()
  const restored = renderHook(useControls, { wrapper })
  expect(restored.result.current.personal.design).toEqual(saved)
  expect(restored.result.current.preview.poster).toMatchObject({
    opacity: 0.5,
    position: 'right',
  })
  expect(prepare).toHaveBeenCalledTimes(1)
})

test('migra preferencias anteriores sin escribir ni borrar claves hasta que se cambia el diseño', () => {
  localStorage.setItem(
    APPEARANCE_STORAGE_KEY,
    JSON.stringify({ theme: 'light', ambient: true }),
  )
  const { result } = renderHook(useControls, { wrapper })
  expect(result.current.appearance.theme).toBe('light')
  expect(localStorage.getItem(PERSONAL_DESIGN_STORAGE_KEY)).toBeNull()
  act(() => result.current.appearance.setPalette('ocean'))
  expect(
    JSON.parse(localStorage.getItem(PERSONAL_DESIGN_STORAGE_KEY)!),
  ).toMatchObject({ theme: 'light' })
  expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!)).toEqual({
    theme: 'light',
    ambient: true,
  })
})

test.each(['{', 'null', '[]', '{"version":99}', '{"theme":"otro"}'])(
  'almacenamiento dañado no impide abrir: %s',
  (value) => {
    localStorage.setItem(PERSONAL_DESIGN_STORAGE_KEY, value)
    const { result } = renderHook(useControls, { wrapper })
    expect(result.current.appearance.theme).toBe('dark')
    expect(localStorage.getItem(PERSONAL_DESIGN_STORAGE_KEY)).toBe(value)
  },
)

test('una paleta manual se conserva al sustituir o quitar la imagen', async () => {
  const { result } = renderHook(useControls, { wrapper })
  act(() => result.current.appearance.setPalette('violet'))
  await act(() => result.current.preview.chooseFile(file()))
  expect(result.current.appearance.resolvedPalette).toBe('violet')
  act(() => result.current.preview.removePoster())
  expect(result.current.preview.poster).toBeNull()
  expect(result.current.appearance.resolvedPalette).toBe('violet')
})

test('cuota insuficiente conserva imagen y diseño anteriores; los cambios pequeños pueden usarse en sesión', async () => {
  const { result } = renderHook(useControls, { wrapper })
  await act(() => result.current.preview.chooseFile(file()))
  const before = result.current.personal.design
  const saved = localStorage.getItem(PERSONAL_DESIGN_STORAGE_KEY)
  const write = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new DOMException('Cuota', 'QuotaExceededError')
    })
  try {
    prepare.mockResolvedValue({ ...syntheticWallpaper(), palette: 'amber' })
    await act(() => result.current.preview.chooseFile(file()))
    expect(result.current.personal.design).toBe(before)
    expect(localStorage.getItem(PERSONAL_DESIGN_STORAGE_KEY)).toBe(saved)
    expect(result.current.appearance.storageError).toContain(
      'anterior se conserva',
    )
    act(() => result.current.appearance.setTheme('light'))
    expect(result.current.appearance.theme).toBe('light')
    expect(result.current.appearance.storageError).toContain(
      'durante esta apertura',
    )
  } finally {
    write.mockRestore()
  }
})

test('rechazo de imagen conserva la anterior y no escribe preferencias', async () => {
  const { result } = renderHook(useControls, { wrapper })
  await act(() => result.current.preview.chooseFile(file()))
  const before = result.current.personal.design
  prepare.mockRejectedValue(new WallpaperError('Imagen inválida'))
  await act(() => result.current.preview.chooseFile(file()))
  expect(result.current.personal.design).toBe(before)
  expect(result.current.preview.error).toBe('Imagen inválida')
})

test('sustitución, cancelación, retirada y desmontaje descartan cargas tardías', async () => {
  let resolve!: (value: ReturnType<typeof syntheticWallpaper>) => void
  prepare.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const { result, unmount } = renderHook(useControls, { wrapper })
  let pending!: Promise<void>
  act(() => {
    pending = result.current.preview.chooseFile(file())
  })
  const signal = prepare.mock.calls[0]![1]!
  await act(() => result.current.preview.chooseFile(file()))
  expect(signal.aborted).toBe(true)
  await act(async () => {
    resolve({ ...syntheticWallpaper(), palette: 'amber' })
    await pending
  })
  expect(result.current.preview.poster?.palette).toBe('forest')
  prepare.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  act(() => {
    pending = result.current.preview.chooseFile(file())
  })
  act(() => result.current.preview.removePoster())
  await act(async () => {
    resolve(syntheticWallpaper())
    await pending
  })
  expect(result.current.preview.poster).toBeNull()
  prepare.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  act(() => {
    pending = result.current.preview.chooseFile(file())
  })
  const lastSignal = prepare.mock.calls.at(-1)![1]!
  unmount()
  expect(lastSignal.aborted).toBe(true)
  await act(async () => {
    resolve(syntheticWallpaper())
    await pending
  })
})

test('controles accesibles muestran el fondo al elegirlo y dejan ajustes secundarios plegados', async () => {
  function Controls() {
    const { appearance, preview } = useControls()
    return (
      <>
        <AppearanceControls appearance={appearance} preview={preview} />
        <PosterBackdrop poster={preview.poster} />
      </>
    )
  }
  const { container } = render(<Controls />, { wrapper })
  fireEvent.change(screen.getByLabelText('Imagen de fondo'), {
    target: { files: [file()] },
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Quitar imagen' })).toBeVisible(),
  )
  expect(
    screen.getByText('Ajustar imagen').closest('details'),
  ).not.toHaveAttribute('open')
  fireEvent.click(screen.getByText('Ajustar imagen'))
  fireEvent.change(screen.getByRole('slider', { name: /Intensidad/ }), {
    target: { value: '50' },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'Encuadre' }), {
    target: { value: 'right' },
  })
  expect(container.querySelector('.appearance-poster')).toHaveStyle({
    opacity: '0.5',
    backgroundPosition: 'right center',
  })
  fireEvent.click(screen.getByRole('radio', { name: 'Océano' }))
  expect(screen.getByRole('radio', { name: 'Océano' })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Quitar imagen' }))
  expect(container.querySelector('.appearance-poster')).toBeNull()
})

test('fallos internos no exponen mensajes técnicos al elegir una imagen', async () => {
  const { result } = renderHook(useControls, { wrapper })
  prepare.mockRejectedValue(
    new Error('SecurityError: canvas context internal details'),
  )
  await act(() => result.current.preview.chooseFile(file()))
  expect(result.current.preview.error).toBe('No pudimos abrir esta imagen.')
})

test('otra ventana puede actualizar el diseño y sus datos dañados no sustituyen el visible', () => {
  const { result } = renderHook(useControls, { wrapper })
  act(() => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: PERSONAL_DESIGN_STORAGE_KEY,
        newValue: JSON.stringify({
          ...result.current.personal.design,
          palette: 'ocean',
        }),
      }),
    )
  })
  expect(result.current.appearance.resolvedPalette).toBe('ocean')
  act(() => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: PERSONAL_DESIGN_STORAGE_KEY,
        newValue: '{"version":99}',
      }),
    )
  })
  expect(result.current.appearance.resolvedPalette).toBe('ocean')
})
