import { createContext, useContext } from 'react'
import type { Appearance } from '../appearance/use-appearance'
import type { PosterPreview } from '../appearance/use-poster-preview'
import type { OfflineController } from '../../infrastructure/browser/offline-controller'

export const ApplicationSettingsContext = createContext<{
  appearance: Appearance
  preview: PosterPreview
  offline?: OfflineController
} | null>(null)

export function useApplicationSettings() {
  const settings = useContext(ApplicationSettingsContext)
  if (!settings)
    throw new Error('Falta el contexto de ajustes de la aplicación.')
  return settings
}
