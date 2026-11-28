import { createContext, useContext } from 'react'
import type { PersonalDesign } from '../../domain/personal-design'

export type PersonalDesignState = {
  design: PersonalDesign
  storageError: string | null
  update: (
    change: (current: PersonalDesign) => PersonalDesign,
    sessionFallback?: boolean,
  ) => boolean
}
export const PersonalDesignContext = createContext<PersonalDesignState | null>(
  null,
)
export function usePersonalDesign() {
  const context = useContext(PersonalDesignContext)
  if (!context) throw new Error('Falta el diseño personal.')
  return context
}
