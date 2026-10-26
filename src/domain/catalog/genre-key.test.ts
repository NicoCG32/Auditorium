import { expect, test } from 'vitest'
import { genreKey, genreKeySchema } from './genre-key'

test.each([
  ['  MÉTAL\t Progresivo  ', 'metal progresivo'],
  ['Me\u0301tal\nProgresivo', 'metal progresivo'],
  ['ÁCIDO\u00a0  Rock', 'acido rock'],
  ['PostRock', 'postrock'],
  ['Post Rock', 'post rock'],
])('la identidad de género normaliza %j como %j', (label, key) => {
  expect(genreKey(label)).toBe(key)
  expect(genreKey(key)).toBe(key)
  expect(genreKeySchema.parse(key)).toBe(key)
})

test.each(['', ' ', 'Metal', 'métal', 'metal  progresivo', ' metal'])(
  'la clave persistida rechaza %j sin repararla silenciosamente',
  (key) => {
    expect(genreKeySchema.safeParse(key).success).toBe(false)
  },
)
