import {
  collectionDesignSchema,
  defaultPersonalDesign,
  parsePersonalDesign,
  serializePersonalDesign,
  type PersonalDesign,
} from '../../domain/personal-design'

export const PERSONAL_DESIGN_STORAGE_KEY = 'auditorium.personal-design.v1'
export const LEGACY_APPEARANCE_KEY = 'auditorium.appearance.v1'
export const LEGACY_COLLECTION_KEY = 'auditorium.collection-view.v1'

export function readPersonalDesign(): PersonalDesign {
  const fallback = defaultPersonalDesign()
  try {
    const current = localStorage.getItem(PERSONAL_DESIGN_STORAGE_KEY)
    if (current) return parsePersonalDesign(current)
    const appearance: unknown = JSON.parse(
      localStorage.getItem(LEGACY_APPEARANCE_KEY) ?? 'null',
    )
    if (appearance && typeof appearance === 'object') {
      if ('theme' in appearance && appearance.theme === 'light')
        fallback.theme = 'light'
      if ('ambient' in appearance && appearance.ambient === true)
        fallback.ambient = true
    }
  } catch {
    /* Keep unreadable storage intact until an explicit user change. */
  }
  try {
    const collection: unknown = JSON.parse(
      localStorage.getItem(LEGACY_COLLECTION_KEY) ?? 'null',
    )
    const parsed = collectionDesignSchema.safeParse(collection)
    if (parsed.success) fallback.collection = parsed.data
  } catch {
    /* Old preferences are optional. */
  }
  return fallback
}

export function writePersonalDesign(design: PersonalDesign) {
  // A single setItem keeps imported colors, background and layout together.
  localStorage.setItem(
    PERSONAL_DESIGN_STORAGE_KEY,
    serializePersonalDesign(design),
  )
}
