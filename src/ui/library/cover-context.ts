import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
export interface CoversContextValue {
  load: (url: string) => Promise<string | undefined>
  revision: number
  complete: () => void
  busy: boolean
  activity: ReactNode
}
export const CoversContext = createContext<CoversContextValue | undefined>(
  undefined,
)
export function useLocalCovers() {
  return useContext(CoversContext)
}
export function CoverActivity() {
  return useLocalCovers()?.activity ?? null
}
