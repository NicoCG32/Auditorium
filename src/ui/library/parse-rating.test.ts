// @vitest-environment node
import { expect, test } from 'vitest'
import { parseRating } from './parse-rating'

test.each([
  ['1', 1],
  ['10', 10],
  ['9,5', 9.5],
  [' 8.5 ', 8.5],
  ['1,0', 1],
])('nota %s admite decimales de medio punto', (text, expected) => {
  expect(parseRating(String(text))).toBe(expected)
})
test.each([
  '',
  ' ',
  '0',
  '-1',
  '10,5',
  '9,3',
  '1e1',
  'NaN',
  'Infinity',
  'nota 8',
  '9,5.0',
])('nota %s inválida no se convierte en cero', (text) => {
  expect(parseRating(text)).toBeUndefined()
})
