import type { CoverImageSource } from '../../application/album-covers'
import { audioDigest } from '../../domain/audio'
import {
  coverSourceSchema,
  MAX_OPTIMIZED_COVER_BYTES,
} from '../../domain/covers'
import { MAX_COVER_IMAGE_BYTES } from '../../domain/catalog/metadata'
import { readCoverImage } from './cover-image'

async function optimize(bytes: Uint8Array, mime: string, signal: AbortSignal) {
  const source = await readCoverImage(
    new File([new Uint8Array(bytes)], 'cover', { type: mime }),
    { signal },
  )
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        image.onload = null
        image.onerror = null
        if (error)
          reject(
            error instanceof Error
              ? error
              : new Error('No pudimos abrir la portada.'),
          )
        else resolve()
      }
      const abort = () => finish(signal.reason)
      const timer = setTimeout(
        () => finish(new Error('La portada tardó demasiado en abrirse.')),
        10000,
      )
      image.onload = () => finish()
      image.onerror = () => finish(new Error('No pudimos abrir la portada.'))
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      else image.src = source
    })
    const ratio = Math.min(
      1,
      500 / Math.max(image.naturalWidth, image.naturalHeight),
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('No pudimos preparar la portada en este navegador.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.86, 0.72, 0.55]) {
      signal.throwIfAborted()
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      )
      if (!blob || blob.type !== 'image/jpeg')
        throw new Error('No pudimos preparar la portada.')
      if (blob.size > MAX_OPTIMIZED_COVER_BYTES) continue
      const optimized = new Uint8Array(await blob.arrayBuffer())
      const sha256 = await audioDigest(optimized)
      signal.throwIfAborted()
      return {
        bytes: optimized,
        size: optimized.length,
        width: canvas.width,
        height: canvas.height,
        sha256,
      }
    }
    throw new Error('No pudimos reducir el tamaño de la portada.')
  } finally {
    image.src = ''
  }
}
export class CoverDownload implements CoverImageSource {
  private lastRequest = 0
  private readonly fetcher: typeof fetch
  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = (...args) => fetcher(...args)
  }
  async download(url: string, signal: AbortSignal) {
    coverSourceSchema.parse(url)
    const wait = Math.max(0, this.lastRequest + 1000 - Date.now())
    if (wait)
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer)
          reject(new DOMException('Búsqueda cancelada.', 'AbortError'))
        }
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort)
          resolve()
        }, wait)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
    signal.throwIfAborted()
    this.lastRequest = Date.now()
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(20000)])
    const response = await this.fetcher(url, {
      signal: timeout,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'image/jpeg,image/png' },
      redirect: 'follow',
    })
    if (response.status === 404) return
    if (!response.ok || !response.body)
      throw new Error(
        'No pudimos descargar la portada. Vuelve a intentar más tarde.',
      )
    if (response.url) {
      const final = new URL(response.url)
      if (
        final.protocol !== 'https:' ||
        !(
          final.hostname === 'coverartarchive.org' ||
          final.hostname === 'archive.org' ||
          final.hostname.endsWith('.archive.org')
        )
      )
        throw new Error('La fuente de la portada no es válida.')
    }
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim()
    if (mime !== 'image/jpeg' && mime !== 'image/png')
      throw new Error('El archivo recibido no es una portada compatible.')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        timeout.throwIfAborted()
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > MAX_COVER_IMAGE_BYTES)
          throw new Error('La portada supera el tamaño permitido.')
        chunks.push(value)
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    return optimize(bytes, mime, timeout)
  }
}
