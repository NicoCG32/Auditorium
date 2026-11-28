import { z } from 'zod'
import { jpegDimensions } from './covers'

export const PALETTES = [
  { id: 'garnet', name: 'Granate', swatch: '#a52c40' },
  { id: 'amber', name: 'Ámbar', swatch: '#a65e17' },
  { id: 'forest', name: 'Bosque', swatch: '#35785b' },
  { id: 'ocean', name: 'Océano', swatch: '#316fa3' },
  { id: 'violet', name: 'Violeta', swatch: '#8755b7' },
  { id: 'graphite', name: 'Grafito', swatch: '#637080' },
] as const
export const paletteSchema = z.enum([
  'garnet',
  'amber',
  'forest',
  'ocean',
  'violet',
  'graphite',
])
export type Palette = z.infer<typeof paletteSchema>
export const MAX_DESIGN_BYTES = 768 * 1024
export const MAX_WALLPAPER_DATA_LENGTH = 600_000
export const wallpaperSchema = z
  .strictObject({
    url: z
      .string()
      .max(MAX_WALLPAPER_DATA_LENGTH)
      .regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/u),
    width: z.number().int().min(1).max(1920),
    height: z.number().int().min(1).max(1920),
    palette: paletteSchema,
    opacity: z.number().min(0.1).max(0.6),
    position: z.enum(['left', 'center', 'right']),
  })
  .superRefine((wallpaper, context) => {
    try {
      const base64 = wallpaper.url.slice('data:image/jpeg;base64,'.length)
      const binary = atob(base64)
      if (btoa(binary) !== base64) throw new Error()
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      )
      const dimensions = jpegDimensions(bytes)
      if (
        dimensions.width !== wallpaper.width ||
        dimensions.height !== wallpaper.height ||
        bytes.at(-2) !== 255 ||
        bytes.at(-1) !== 217
      )
        throw new Error()
    } catch {
      context.addIssue({
        code: 'custom',
        message:
          'La imagen de fondo no es un JPEG válido con las dimensiones indicadas.',
      })
    }
  })
export type Wallpaper = z.infer<typeof wallpaperSchema>
export const collectionDesignSchema = z.strictObject({
  name: z.string().max(60),
  view: z.enum(['grid', 'list']),
  covers: z.enum(['small', 'medium', 'large']),
  details: z.boolean(),
  order: z.enum(['added', 'title', 'artist', 'rating', 'genre', 'country']),
})
export const defaultCollectionDesign: z.infer<typeof collectionDesignSchema> = {
  name: 'Mi colección',
  view: 'grid',
  covers: 'medium',
  details: false,
  order: 'artist',
}
export const personalDesignSchema = z.strictObject({
  format: z.literal('auditorium-design'),
  version: z.literal(1),
  theme: z.enum(['dark', 'light']),
  ambient: z.boolean(),
  palette: z.union([z.literal('auto'), paletteSchema]),
  wallpaper: wallpaperSchema.nullable(),
  collection: collectionDesignSchema,
})
export type PersonalDesign = z.infer<typeof personalDesignSchema>
export function defaultPersonalDesign(): PersonalDesign {
  return {
    format: 'auditorium-design',
    version: 1,
    theme: 'dark',
    ambient: false,
    palette: 'auto',
    wallpaper: null,
    collection: { ...defaultCollectionDesign },
  }
}
export function designPalette(design: PersonalDesign): Palette {
  return design.palette === 'auto'
    ? (design.wallpaper?.palette ?? 'garnet')
    : design.palette
}
export function parsePersonalDesign(text: string): PersonalDesign {
  if (new TextEncoder().encode(text).length > MAX_DESIGN_BYTES)
    throw new Error('El archivo de diseño es demasiado grande.')
  return personalDesignSchema.parse(JSON.parse(text))
}
export function serializePersonalDesign(design: PersonalDesign): string {
  return JSON.stringify(personalDesignSchema.parse(design))
}

// Map sampled image colors to curated CSS palettes, never to arbitrary CSS.
export function paletteFromPixels(pixels: ArrayLike<number>): Palette {
  const scores: Record<Palette, number> = {
    garnet: 0,
    amber: 0,
    forest: 0,
    ocean: 0,
    violet: 0,
    graphite: 0,
  }
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3]! < 128) continue
    const r = pixels[i]! / 255,
      g = pixels[i + 1]! / 255,
      b = pixels[i + 2]! / 255
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      delta = max - min
    if (max < 0.12 || min > 0.92) continue
    const saturation = max === 0 ? 0 : delta / max
    if (saturation < 0.18) {
      scores.graphite += 0.2
      continue
    }
    let hue =
      max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4
    hue = (hue * 60 + 360) % 360
    const palette: Palette =
      hue < 20 || hue >= 325
        ? 'garnet'
        : hue < 80
          ? 'amber'
          : hue < 165
            ? 'forest'
            : hue < 260
              ? 'ocean'
              : 'violet'
    scores[palette] += saturation * Math.sqrt(max)
  }
  return PALETTES.reduce<Palette>(
    (best, { id }) => (scores[id] > scores[best] ? id : best),
    'graphite',
  )
}
