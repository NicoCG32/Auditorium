import {
  designPalette,
  type PersonalDesign,
} from '../../domain/personal-design'
import { LEGACY_APPEARANCE_KEY } from '../../infrastructure/browser/personal-design-storage'
import { usePersonalDesign } from './personal-design-context'

export const APPEARANCE_STORAGE_KEY = LEGACY_APPEARANCE_KEY
export function useAppearance() {
  const { design, update, storageError } = usePersonalDesign()
  return {
    theme: design.theme,
    ambient: design.ambient,
    palette: design.palette,
    resolvedPalette: designPalette(design),
    storageError,
    setTheme(theme: PersonalDesign['theme']) {
      update((value) => ({ ...value, theme }))
    },
    setAmbient(ambient: boolean) {
      update((value) => ({ ...value, ambient }))
    },
    setPalette(palette: PersonalDesign['palette']) {
      update((value) => ({ ...value, palette }))
    },
  }
}
export type Appearance = ReturnType<typeof useAppearance>
