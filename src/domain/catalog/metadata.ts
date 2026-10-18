import { z } from 'zod'

export const MAX_COVER_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_COVER_IMAGE_CHARACTERS = Math.ceil(MAX_COVER_IMAGE_BYTES / 3) * 4 + 23

export function metadataKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLocaleLowerCase('es')
}

export const genresSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(20)
  .refine(
    (genres) => new Set(genres.map(metadataKey)).size === genres.length,
    'Cada género debe aparecer una sola vez.',
  )
export const countrySchema = z.string().trim().min(1).max(100)

export const coverImageSchema = z
  .string()
  .max(MAX_COVER_IMAGE_CHARACTERS)
  .superRefine((value, context) => {
    const reject = () =>
      context.addIssue({
        code: 'custom',
        message: 'La portada debe ser una imagen JPEG o PNG de hasta 2 MiB.',
      })
    if (value.length > MAX_COVER_IMAGE_CHARACTERS) {
      reject()
      return
    }
    const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      value,
    )
    if (!match || !match[2] || match[2].length % 4 !== 0) {
      reject()
      return
    }
    try {
      const bytes = atob(match[2])
      if (bytes.length > MAX_COVER_IMAGE_BYTES || btoa(bytes) !== match[2]) {
        reject()
        return
      }
      const signature =
        match[1] === 'png' ? [137, 80, 78, 71, 13, 10, 26, 10] : [255, 216, 255]
      if (!signature.every((byte, index) => bytes.charCodeAt(index) === byte))
        reject()
    } catch {
      reject()
    }
  })

export function checkCoverFields(
  value: { coverUrl?: string | undefined; coverImage?: string | undefined },
  context: z.RefinementCtx,
) {
  if (value.coverUrl !== undefined && value.coverImage !== undefined)
    context.addIssue({
      code: 'custom',
      path: ['coverImage'],
      message: 'Elige un enlace o un archivo de portada.',
    })
}
