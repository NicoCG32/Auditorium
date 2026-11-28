import {
  MAX_WALLPAPER_DATA_LENGTH,
  paletteFromPixels,
  wallpaperSchema,
  type Wallpaper,
} from '../../domain/personal-design'

export const MAX_WALLPAPER_BYTES = 15 * 1024 * 1024
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export class WallpaperError extends Error {}
const invalid = () =>
  new WallpaperError(
    'No pudimos abrir esta imagen. Elige un archivo PNG, JPEG o WebP válido.',
  )

function loadImage(
  url: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const image = new Image()
    function finish(error?: Error) {
      image.onload = null
      image.onerror = null
      signal?.removeEventListener('abort', abort)
      if (error) {
        image.src = ''
        reject(error)
      } else resolve(image)
    }
    function abort() {
      finish(new DOMException('Cancelado', 'AbortError'))
    }
    image.onload = () => finish()
    image.onerror = () => finish(invalid())
    signal?.addEventListener('abort', abort, { once: true })
    image.src = url
  })
}
export async function prepareWallpaper(
  file: File,
  signal?: AbortSignal,
): Promise<Wallpaper> {
  if (!TYPES.has(file.type))
    throw new WallpaperError('Elige una imagen PNG, JPEG o WebP.')
  if (!file.size || file.size > MAX_WALLPAPER_BYTES)
    throw new WallpaperError('La imagen debe ocupar hasta 15 MB.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  signal?.throwIfAborted()
  const valid =
    file.type === 'image/jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : file.type === 'image/png'
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
        : bytes[0] === 82 &&
          bytes[1] === 73 &&
          bytes[2] === 70 &&
          bytes[3] === 70 &&
          bytes[8] === 87 &&
          bytes[9] === 69 &&
          bytes[10] === 66 &&
          bytes[11] === 80
  if (!valid) throw invalid()
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url, signal)
    const width = image.naturalWidth,
      height = image.naturalHeight
    if (!width || !height || width * height > 40_000_000)
      throw new WallpaperError(
        'La imagen es demasiado grande. Elige una de hasta 40 megapíxeles.',
      )
    signal?.throwIfAborted()
    const sample = document.createElement('canvas')
    sample.width = sample.height = 40
    const sampling = sample.getContext('2d', { willReadFrequently: true })
    if (!sampling) throw invalid()
    sampling.drawImage(image, 0, 0, 40, 40)
    const palette = paletteFromPixels(sampling.getImageData(0, 0, 40, 40).data)
    const canvas = document.createElement('canvas')
    let scale = Math.min(1, 1920 / Math.max(width, height))
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw invalid()
      context.fillStyle = '#191c20'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.84, 0.7, 0.55]) {
        signal?.throwIfAborted()
        const data = canvas.toDataURL('image/jpeg', quality)
        if (data.length <= MAX_WALLPAPER_DATA_LENGTH)
          return wallpaperSchema.parse({
            url: data,
            width: canvas.width,
            height: canvas.height,
            palette,
            opacity: 0.35,
            position: 'center',
          })
      }
      scale *= 0.7
    }
    throw new WallpaperError(
      'No pudimos reducir esta imagen. Prueba con otra más pequeña.',
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
export async function verifyWallpaper(
  wallpaper: Wallpaper,
  signal?: AbortSignal,
) {
  wallpaperSchema.parse(wallpaper)
  const image = await loadImage(wallpaper.url, signal)
  if (
    image.naturalWidth !== wallpaper.width ||
    image.naturalHeight !== wallpaper.height
  )
    throw invalid()
}
