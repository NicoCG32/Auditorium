// @vitest-environment node
import { expect, test, vi } from 'vitest'
import { CoverDownload } from './cover-download'
import { fixtureId } from '../../domain/catalog/catalog.fixture'
import { MAX_COVER_IMAGE_BYTES } from '../../domain/catalog/metadata'
const url = `https://coverartarchive.org/release-group/${fixtureId(9000)}/front-500`
test('404 indica ausencia sin intentar decodificar y los fallos transitorios quedan como fallos', async () => {
  expect(
    await new CoverDownload(
      vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
    ).download(url, new AbortController().signal),
  ).toBeUndefined()
  await expect(
    new CoverDownload(
      vi.fn(() => Promise.resolve(new Response('', { status: 503 }))),
    ).download(url, new AbortController().signal),
  ).rejects.toThrow('descargar')
})
test('no admite destinos arbitrarios, HTML ni imágenes demasiado grandes aunque no anuncien tamaño', async () => {
  const fetcher = vi.fn(() =>
    Promise.resolve(
      new Response('html', { headers: { 'content-type': 'text/html' } }),
    ),
  )
  await expect(
    new CoverDownload(fetcher).download(
      'https://example.com/cover.jpg',
      new AbortController().signal,
    ),
  ).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
  await expect(
    new CoverDownload(fetcher).download(url, new AbortController().signal),
  ).rejects.toThrow('compatible')
  await expect(
    new CoverDownload(
      vi.fn(() =>
        Promise.resolve(
          new Response(new Uint8Array(MAX_COVER_IMAGE_BYTES + 1), {
            headers: { 'content-type': 'image/jpeg' },
          }),
        ),
      ),
    ).download(url, new AbortController().signal),
  ).rejects.toThrow('tamaño')
})
test('una cancelación previa no empieza una descarga ni envía credenciales', async () => {
  const fetcher = vi.fn(() =>
    Promise.resolve(new Response('', { status: 404 })),
  )
  const controller = new AbortController()
  controller.abort()
  await expect(
    new CoverDownload(fetcher).download(url, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetcher).not.toHaveBeenCalled()
  await new CoverDownload(fetcher).download(url, new AbortController().signal)
  expect(fetcher).toHaveBeenCalledWith(
    url,
    expect.objectContaining({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    }),
  )
})
