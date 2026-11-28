import { createContext, useContext } from 'react'
import {
  defaultCollectionDesign,
  type PersonalDesign,
} from '../../domain/personal-design'
import { LEGACY_COLLECTION_KEY } from '../../infrastructure/browser/personal-design-storage'
import { usePersonalDesign } from './personal-design-context'

export type CollectionPreferences = PersonalDesign['collection']
export const COLLECTION_VIEW_STORAGE_KEY = LEGACY_COLLECTION_KEY
export const defaultCollectionPreferences = defaultCollectionDesign
export function useCollectionViewState() {
  const { design, update } = usePersonalDesign()
  return {
    ...design.collection,
    update(value: Partial<CollectionPreferences>) {
      update((current) => ({
        ...current,
        collection: { ...current.collection, ...value },
      }))
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
