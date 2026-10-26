import { z } from 'zod'

/** Stable identity for an assigned genre; the album retains its display label. */
export function genreKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/gu, ' ')
}

export const genreKeySchema = z
  .string()
  .min(1)
  .max(80)
  .refine(
    (value) => genreKey(value) === value,
    'La clave de género debe estar normalizada.',
  )
