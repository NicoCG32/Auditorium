import { useContext, type ReactNode } from 'react'
import { useAppearance } from '../appearance/use-appearance'
import { usePosterPreview } from '../appearance/use-poster-preview'
import type { OfflineController } from '../../infrastructure/browser/offline-controller'
import { ApplicationSettingsContext } from './application-settings-context'
import { PersonalDesignProvider } from '../appearance/PersonalDesignProvider'

function SettingsProvider({
  children,
  offline,
}: {
  children: ReactNode
  offline?: OfflineController
}) {
  const appearance = useAppearance()
  const preview = usePosterPreview()
  return (
    <ApplicationSettingsContext
      value={{ appearance, preview, ...(offline ? { offline } : {}) }}
    >
      {children}
    </ApplicationSettingsContext>
  )
}

export function ApplicationSettings(props: {
  children: ReactNode
  offline?: OfflineController
}) {
  const inherited = useContext(ApplicationSettingsContext)
  return inherited ? (
    props.children
  ) : (
    <PersonalDesignProvider>
      <SettingsProvider {...props} />
    </PersonalDesignProvider>
  )
}
