import { z } from 'zod'
import { genresSchema } from '../domain/catalog/metadata'

// Explicit exceptions avoid interpreting every uppercase word as an acronym.
const initialisms = new Set([
  'ABBA',
  'AOR',
  'BPM',
  'DJ',
  'EBM',
  'EDM',
  'EP',
  'IDM',
  'LP',
  'MC',
  'NIN',
  'NWOBHM',
  'NWOTHM',
  'OST',
  'UFO',
])

/** Display convention for new catalog names, never for persisted-data readers. */
export function capitalizeCatalogName(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(
      /(?:\p{L}\.){2,}(?:\p{L}\.?)?|ac\/dc(?![\p{L}\p{M}\p{N}])|[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{M}\p{N}]+)*/giu,
      (word) => {
        const upper = word.toLocaleUpperCase('es')
        if (
          initialisms.has(upper) ||
          /^(?:\p{L}\.){2,}(?:\p{L}\.?)?$/u.test(word) ||
          upper === 'AC/DC' ||
          /^\p{L}{1,3}\d+$/u.test(word) ||
          /^(?:I{1,3}|IV|VI{0,3}|IX|X{1,3}|XI{1,3}|XIV|XVI{0,3}|XIX|XXI{1,3}|XXIV|XXVI{0,3}|XXIX)$/iu.test(
            word,
          )
        )
          return upper
        return word.toLocaleLowerCase('es').replace(/\p{L}/u, (first) => {
          if (first === 'ß') return 'ẞ'
          const [capital = '', ...rest] = [...first.toLocaleUpperCase('es')]
          return capital + rest.join('').toLocaleLowerCase('es')
        })
      },
    )
    .normalize('NFC')
}

/** Case and spacing changes do not change musical identity. Accents still do. */
export function catalogNameKey(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es')
}

export const catalogNameInputSchema = z
  .string()
  .transform(capitalizeCatalogName)
  .pipe(z.string().min(1, 'El texto no puede estar vacío.'))

export const catalogGenresInputSchema = z
  .array(catalogNameInputSchema)
  .pipe(genresSchema)
