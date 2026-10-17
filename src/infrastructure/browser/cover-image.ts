import {
  MAX_COVER_IMAGE_BYTES,
  coverImageSchema,
} from '../../domain/catalog/metadata'

export type CoverImageErrorCode =
  'type' | 'size' | 'invalid' | 'dimensions' | 'aborted'

export class CoverImageError extends Error {
  readonly code: CoverImageErrorCode

  constructor(code: CoverImageErrorCode) {
    super(code)
    this.name = 'CoverImageError'
    this.code = code
  }
}

export async function readCoverImage(
  file: File,
  { signal }: { signal?: AbortSignal } = {},
): Promise<string> {
  if (signal?.aborted) throw new CoverImageError('aborted')
  if (file.type !== 'image/jpeg' && file.type !== 'image/png')
    throw new CoverImageError('type')
  if (file.size > MAX_COVER_IMAGE_BYTES) throw new CoverImageError('size')
  if (file.size === 0) throw new CoverImageError('invalid')

  const bytes = await readBytes(file, signal)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  const result = `data:${file.type};base64,${btoa(binary)}`
  if (!coverImageSchema.safeParse(result).success)
    throw new CoverImageError('invalid')
  await verifyImage(result, signal)
  return result
}

function readBytes(file: File, signal?: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const clean = () => {
      signal?.removeEventListener('abort', abort)
      reader.onload = null
      reader.onerror = null
      reader.onabort = null
    }
    const fail = (code: CoverImageErrorCode) => {
      clean()
      reject(new CoverImageError(code))
    }
    const abort = () => {
      if (reader.readyState === FileReader.LOADING) reader.abort()
      fail('aborted')
    }
    reader.onload = () => {
      const result = reader.result
      clean()
      if (!(result instanceof ArrayBuffer)) {
        reject(new CoverImageError('invalid'))
        return
      }
      resolve(new Uint8Array(result))
    }
    reader.onerror = () => fail('invalid')
    reader.onabort = () => fail('aborted')
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    else reader.readAsArrayBuffer(file)
  })
}

function verifyImage(source: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timer = setTimeout(() => finish('invalid'), 10_000)
    const clean = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      image.onload = null
      image.onerror = null
      image.src = ''
    }
    const finish = (code?: CoverImageErrorCode) => {
      clean()
      if (code) reject(new CoverImageError(code))
      else resolve()
    }
    const abort = () => finish('aborted')
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) finish('invalid')
      else if (
        image.naturalWidth > 8192 ||
        image.naturalHeight > 8192 ||
        image.naturalWidth * image.naturalHeight > 32_000_000
      )
        finish('dimensions')
      else finish()
    }
    image.onerror = () => finish('invalid')
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    else image.src = source
  })
}
