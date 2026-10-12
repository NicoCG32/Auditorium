import { expect, test } from 'vitest'
import { formatDuration, parseDuration } from './track-list-drafts'

test.each([1, 1000, 60000, 123456, 3599999])(
  'duración %i conserva milisegundos en ida y vuelta',
  (value) => {
    expect(parseDuration(formatDuration(value))).toBe(value)
  },
)
test.each(['3:60', '-1:20', '3.45', '3:45.1234'])(
  'duración inválida %s no se convierte silenciosamente',
  (value) => {
    expect(parseDuration(value)).toBeNaN()
  },
)
test('ausencia queda vacía; segundos con fracción usan precisión hasta milisegundos', () => {
  expect(formatDuration(undefined)).toBe('')
  expect(parseDuration(' 3:45.5 ')).toBe(225500)
})
