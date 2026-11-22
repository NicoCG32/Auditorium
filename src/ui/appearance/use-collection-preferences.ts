import { createContext, useContext, useEffect, useState } from 'react'
import type { LibraryOrder } from '../../application/library-query'

export type CollectionPreferences = {
  name: string
  view: 'grid' | 'list'
  covers: 'small' | 'medium' | 'large'
  details: boolean
  order: LibraryOrder
}
export const COLLECTION_VIEW_STORAGE_KEY = 'auditorium.collection-view.v1'
export const defaultCollectionPreferences: CollectionPreferences = {
  name: 'Mi colección',
  view: 'grid',
  covers: 'medium',
  details: false,
  order: 'artist',
}
function readPreferences(): CollectionPreferences {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(COLLECTION_VIEW_STORAGE_KEY) ?? 'null',
    )
    if (typeof saved === 'object' && saved !== null && !Array.isArray(saved)) {
      const value = saved as Record<string, unknown>
      return {
        name:
          typeof value.name === 'string' &&
          value.name.trim() &&
          value.name.length <= 60
            ? value.name
            : defaultCollectionPreferences.name,
        view: value.view === 'list' ? 'list' : 'grid',
        covers:
          value.covers === 'small' || value.covers === 'large'
            ? value.covers
            : 'medium',
        details: value.details === true,
        order: [
          'added',
          'title',
          'artist',
          'rating',
          'genre',
          'country',
        ].includes(String(value.order))
          ? (value.order as LibraryOrder)
          : 'artist',
      }
    }
  } catch {
    // Display preferences are optional when storage is blocked or invalid.
  }
  return { ...defaultCollectionPreferences }
}
export function useCollectionViewState() {
  const [preferences, setPreferences] = useState(readPreferences)
  useEffect(() => {
    try {
      localStorage.setItem(
        COLLECTION_VIEW_STORAGE_KEY,
        JSON.stringify(preferences),
      )
    } catch {
      // Changes still apply for this opening.
    }
  }, [preferences])
  return {
    ...preferences,
    update(value: Partial<CollectionPreferences>) {
      setPreferences((current) => ({ ...current, ...value }))
    },
  }
}
export const CollectionViewContext = createContext<ReturnType<
  typeof useCollectionViewState
> | null>(null)
export function useCollectionPreferences() {
  const preferences = useContext(CollectionViewContext)
  if (!preferences) throw new Error('Falta la personalización de la colección.')
  return preferences
}
