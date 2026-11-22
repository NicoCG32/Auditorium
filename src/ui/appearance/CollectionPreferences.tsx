import { useContext, type ReactNode } from 'react'
import {
  CollectionViewContext,
  useCollectionViewState,
} from './use-collection-preferences'

function PreferencesProvider({ children }: { children: ReactNode }) {
  const preferences = useCollectionViewState()
  return (
    <CollectionViewContext value={preferences}>
      {children}
    </CollectionViewContext>
  )
}
export function CollectionPreferences({ children }: { children: ReactNode }) {
  const inherited = useContext(CollectionViewContext)
  return inherited ? (
    children
  ) : (
    <PreferencesProvider>{children}</PreferencesProvider>
  )
}
