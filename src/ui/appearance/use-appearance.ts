import { useEffect, useState } from 'react'

export type AppearanceTheme = 'dark' | 'light'

type Preferences = {
  theme: AppearanceTheme
  ambient: boolean
}

export const APPEARANCE_STORAGE_KEY = 'auditorium.appearance.v1'

function readPreferences(): Preferences {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? 'null',
    )
    if (typeof saved === 'object' && saved !== null) {
      const value = saved as Record<string, unknown>
      return {
        theme: value.theme === 'light' ? 'light' : 'dark',
        ambient: value.ambient !== false,
      }
    }
  } catch {
    // Las preferencias son opcionales cuando el navegador bloquea su almacenamiento.
  }
  return { theme: 'dark', ambient: true }
}

export function useAppearance() {
  const [preferences, setPreferences] = useState(readPreferences)

  useEffect(() => {
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // La apariencia de esta apertura sigue disponible sin persistencia.
    }
  }, [preferences])

  return {
    ...preferences,
    setTheme(theme: AppearanceTheme) {
      setPreferences((current) => ({ ...current, theme }))
    },
    setAmbient(ambient: boolean) {
      setPreferences((current) => ({ ...current, ambient }))
    },
  }
}

export type Appearance = ReturnType<typeof useAppearance>
