import { afterEach, expect, test, vi } from 'vitest'
import { MAX_COVER_IMAGE_BYTES } from '../../domain/catalog/metadata'
import { readCoverImage } from './cover-image'

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 0])
const file = (bytes: Uint8Array = png, type = 'image/png') =>
  new File([new Uint8Array(bytes).buffer], 'portada.png', { type })

function installImage({
  width = 1,
  height = 1,
  fails = false,
  pending = false,
} = {}) {
  const started = vi.fn()
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width
      naturalHeight = height
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(value: string) {
        if (!value) return
        started(value)
        if (!pending)
          queueMicrotask(() => (fails ? this.onerror?.() : this.onload?.()))
      }
    },
  )
  return started
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('prepara una imagen PNG o JPEG local y comprueba que el navegador la decodifique', async () => {
  const started = installImage()
  const pngData = await readCoverImage(file())
  const jpegData = await readCoverImage(file(jpeg, 'image/jpeg'))
  expect(pngData).toBe('data:image/png;base64,iVBORw0KGgoAAAAA')
  expect(jpegData).toBe('data:image/jpeg;base64,/9j/4AAA')
  expect(started).toHaveBeenCalledTimes(2)
  expect(started).toHaveBeenNthCalledWith(1, pngData)
  expect(started).toHaveBeenNthCalledWith(2, jpegData)
})

test('rechaza SVG, tipos desconocidos, archivos vacíos y archivos mayores a 2 MiB antes de decodificar', async () => {
  const started = installImage()
  await expect(
    readCoverImage(file(png, 'image/svg+xml')),
  ).rejects.toMatchObject({ code: 'type' })
  await expect(readCoverImage(file(png, ''))).rejects.toMatchObject({
    code: 'type',
  })
  await expect(readCoverImage(file(new Uint8Array()))).rejects.toMatchObject({
    code: 'invalid',
  })
  await expect(
    readCoverImage(file(new Uint8Array(MAX_COVER_IMAGE_BYTES + 1))),
  ).rejects.toMatchObject({ code: 'size' })
  expect(started).not.toHaveBeenCalled()
})

test('no acepta un MIME declarado sin la firma binaria correspondiente', async () => {
  const started = installImage()
  await expect(readCoverImage(file(jpeg, 'image/png'))).rejects.toMatchObject({
    code: 'invalid',
  })
  await expect(readCoverImage(file(png, 'image/jpeg'))).rejects.toMatchObject({
    code: 'invalid',
  })
  await expect(
    readCoverImage(
      new File(['<script>contenido</script>'], 'falsa.png', {
        type: 'image/png',
      }),
    ),
  ).rejects.toMatchObject({ code: 'invalid' })
  expect(started).not.toHaveBeenCalled()
})

test('rechaza una cabecera válida si el navegador no puede decodificar el resto de la imagen', async () => {
  installImage({ fails: true })
  await expect(readCoverImage(file())).rejects.toMatchObject({
    code: 'invalid',
  })
})

test('limita las dimensiones y el número de píxeles de la portada', async () => {
  installImage({ width: 9000 })
  await expect(readCoverImage(file())).rejects.toMatchObject({
    code: 'dimensions',
  })
  installImage({ width: 8192, height: 8192 })
  await expect(readCoverImage(file())).rejects.toMatchObject({
    code: 'dimensions',
  })
  installImage({ width: 0 })
  await expect(readCoverImage(file())).rejects.toMatchObject({
    code: 'invalid',
  })
})

test('permite cancelar antes de leer y durante la lectura', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    readCoverImage(file(), { signal: controller.signal }),
  ).rejects.toMatchObject({ code: 'aborted' })
  const reading = new AbortController()
  const result = readCoverImage(file(), { signal: reading.signal })
  reading.abort()
  await expect(result).rejects.toMatchObject({ code: 'aborted' })
})

test('cancela la decodificación pendiente sin publicar una portada parcial', async () => {
  const started = installImage({ pending: true })
  const controller = new AbortController()
  const result = readCoverImage(file(), { signal: controller.signal })
  await vi.waitFor(() => expect(started).toHaveBeenCalledOnce())
  controller.abort()
  await expect(result).rejects.toMatchObject({ code: 'aborted' })
})
