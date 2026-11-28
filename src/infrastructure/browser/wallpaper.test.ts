import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  MAX_WALLPAPER_BYTES,
  prepareWallpaper,
  verifyWallpaper,
} from './wallpaper'
import { syntheticWallpaper } from '../../test/personal-design.fixture'

class RasterImage {
  static instances: RasterImage[] = []
  naturalWidth = 2400
  naturalHeight = 1200
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ''
  constructor() {
    RasterImage.instances.push(this)
  }
}
const create = vi.fn(() => `blob:${crypto.randomUUID()}`),
  revoke = vi.fn()
const draw = vi.fn()
beforeEach(() => {
  RasterImage.instances = []
  create.mockClear()
  revoke.mockClear()
  draw.mockClear()
  vi.stubGlobal('Image', RasterImage)
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: draw,
    fillRect: vi.fn(),
    fillStyle: '',
    getImageData: () => ({ data: new Uint8ClampedArray([30, 140, 70, 255]) }),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    function (this: HTMLCanvasElement) {
      return syntheticWallpaper(this.width, this.height).url
    },
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function imageFile(
  type = 'image/png',
  bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
) {
  const file = new File([bytes], 'imagen', { type })
  vi.spyOn(file, 'slice').mockReturnValue(
    Object.assign(new Blob(), {
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    }),
  )
  return file
}
async function loading() {
  // Signature validation reads a slice before creating the image.
  await Promise.resolve()
  await Promise.resolve()
  return RasterImage.instances.at(-1)!
}
test('reduce la imagen, extrae una paleta y guarda JPEG acotado liberando el original temporal', async () => {
  const pending = prepareWallpaper(imageFile())
  const image = await loading()
  image.onload?.()
  const result = await pending
  expect(result).toMatchObject({
    width: 1920,
    height: 960,
    palette: 'forest',
    opacity: 0.35,
  })
  expect(result.url).toMatch(/^data:image\/jpeg;base64,/)
  expect(revoke).toHaveBeenCalledExactlyOnceWith(image.src)
  expect(draw).toHaveBeenCalledTimes(2)
})
test('rechaza tipos, firmas falsas, vacíos y tamaño excesivo antes de decodificar', async () => {
  const oversize = imageFile()
  Object.defineProperty(oversize, 'size', { value: MAX_WALLPAPER_BYTES + 1 })
  for (const input of [
    new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }),
    new File([], 'x.png', { type: 'image/png' }),
    oversize,
    imageFile('image/png', new Uint8Array([1, 2, 3])),
  ]) {
    await expect(prepareWallpaper(input)).rejects.toThrow()
  }
  expect(create).not.toHaveBeenCalled()
})
test('fallo de decodificación y dimensiones enormes liberan las referencias', async () => {
  const first = prepareWallpaper(imageFile())
  ;(await loading()).onerror?.()
  await expect(first).rejects.toThrow(/abrir/)
  const next = prepareWallpaper(imageFile())
  const image = await loading()
  image.naturalWidth = 10000
  image.naturalHeight = 10000
  image.onload?.()
  await expect(next).rejects.toThrow(/megapíxeles/)
  expect(revoke).toHaveBeenCalledTimes(2)
})
test('cancelar una decodificación la termina y libera el blob sin esperar onload', async () => {
  const controller = new AbortController()
  const result = prepareWallpaper(imageFile(), controller.signal)
  const image = await loading()
  controller.abort()
  await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  expect(image.onload).toBeNull()
  expect(image.onerror).toBeNull()
  expect(revoke).toHaveBeenCalledTimes(1)
})
test('una imagen que sigue excediendo el límite se reduce de nuevo y no se guarda sin acotar', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'x'.repeat(600_001),
  )
  const result = prepareWallpaper(imageFile())
  ;(await loading()).onload?.()
  await expect(result).rejects.toThrow(/reducir/)
  expect(revoke).toHaveBeenCalledTimes(1)
})
test('abrir un diseño requiere decodificación real y dimensiones coherentes', async () => {
  const wallpaper = syntheticWallpaper()
  const result = verifyWallpaper(wallpaper)
  const image = await loading()
  image.onload?.()
  await expect(result).rejects.toThrow()
  expect(create).not.toHaveBeenCalled()
})
