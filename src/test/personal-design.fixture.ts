import {
  defaultPersonalDesign,
  type Wallpaper,
} from '../domain/personal-design'

// Structural JPEG only; browser tests create fully decodable canvas images.
export function syntheticWallpaper(width = 640, height = 480): Wallpaper {
  const bytes = new Uint8Array([
    255,
    216,
    255,
    192,
    0,
    11,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    1,
    1,
    17,
    0,
    255,
    217,
  ])
  return {
    url: `data:image/jpeg;base64,${btoa(String.fromCharCode(...bytes))}`,
    width,
    height,
    palette: 'forest',
    opacity: 0.35,
    position: 'center',
  }
}
export function personalDesignFixture() {
  const design = defaultPersonalDesign()
  design.wallpaper = syntheticWallpaper()
  design.collection.name = 'Discos de casa'
  design.collection.covers = 'large'
  design.theme = 'light'
  return design
}
