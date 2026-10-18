import { createContext, useContext } from 'react'
import type { NavigationController } from './navigation'

export const NavigationContext = createContext<
  NavigationController | undefined
>(undefined)
export function useNavigation() {
  return useContext(NavigationContext)
}
