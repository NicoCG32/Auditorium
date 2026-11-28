import { expect, test } from 'vitest'
import {
  designPalette,
  MAX_DESIGN_BYTES,
  paletteFromPixels,
  parsePersonalDesign,
  serializePersonalDesign,
} from './personal-design'
import { personalDesignFixture } from '../test/personal-design.fixture'

test('el diseño portable valida versión, preferencias e imagen sin permitir CSS ni URL remota', () => {
  const design = personalDesignFixture()
  expect(parsePersonalDesign(serializePersonalDesign(design))).toEqual(design)
  for (const candidate of [
    { ...design, version: 99 },
    { ...design, css: 'body{display:none}' },
    { ...design, palette: 'red; background: url(https://example.com)' },
    {
      ...design,
      wallpaper: { ...design.wallpaper, url: 'https://example.com/foto.jpg' },
    },
    { ...design, wallpaper: { ...design.wallpaper, width: 100 } },
    {
      ...design,
      wallpaper: {
        ...design.wallpaper,
        url: 'data:image/jpeg;base64,/9j/AAAA',
      },
    },
  ])
    expect(() => parsePersonalDesign(JSON.stringify(candidate))).toThrow()
  expect(() => parsePersonalDesign(' '.repeat(MAX_DESIGN_BYTES + 1))).toThrow()
})
test.each([
  [[190, 30, 50, 255], 'garnet'],
  [[205, 155, 35, 255], 'amber'],
  [[30, 140, 70, 255], 'forest'],
  [[35, 100, 190, 255], 'ocean'],
  [[160, 70, 210, 255], 'violet'],
  [[140, 140, 140, 255], 'graphite'],
  [[0, 0, 0, 255, 255, 255, 255, 255, 0, 255, 0, 0], 'graphite'],
])('el muestreo %j elige %s', (pixels, expected) => {
  expect(paletteFromPixels(pixels)).toBe(expected)
})
test('la selección manual tiene prioridad y el modo automático tiene alternativa sin foto', () => {
  const design = personalDesignFixture()
  expect(designPalette(design)).toBe('forest')
  design.palette = 'amber'
  expect(designPalette(design)).toBe('amber')
  design.palette = 'auto'
  design.wallpaper = null
  expect(designPalette(design)).toBe('garnet')
})
