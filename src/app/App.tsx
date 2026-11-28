import { useEffect } from 'react'
import type { BackupLocalRepository } from '../domain/repositories/local-repository'
import { LibraryPage } from '../ui/library/LibraryPage'
import type { OfflineController } from '../infrastructure/browser/offline-controller'
import { PosterBackdrop } from '../ui/appearance/PosterBackdrop'
import { ApplicationSettings } from '../ui/settings/ApplicationSettings'
import { useApplicationSettings } from '../ui/settings/application-settings-context'
import { NavigationProvider } from '../ui/navigation/NavigationProvider'
import type { CloudAccount } from '../application/cloud-account'
import { AccountLibrary } from '../ui/account/AccountLibrary'
import { CollectionPreferences } from '../ui/appearance/CollectionPreferences'

interface AppProps {
  repository: BackupLocalRepository
  offline?: OfflineController
  account?: CloudAccount
}
export function App(props: AppProps) {
  return (
    <ApplicationSettings {...(props.offline ? { offline: props.offline } : {})}>
      <AppContent {...props} />
    </ApplicationSettings>
  )
}
function AppContent({ repository, account }: AppProps) {
  const { appearance, preview } = useApplicationSettings()
  useEffect(() => {
    const html = document.documentElement
    const previous = html.getAttribute('data-aud-theme')
    const previousPalette = html.getAttribute('data-aud-palette')
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousColor = meta?.getAttribute('content')
    html.setAttribute('data-aud-theme', appearance.theme)
    html.setAttribute('data-aud-palette', appearance.resolvedPalette)
    meta?.setAttribute(
      'content',
      getComputedStyle(html).getPropertyValue('--background').trim() ||
        (appearance.theme === 'light' ? '#f1f2f4' : '#111315'),
    )
    return () => {
      if (previous === null) html.removeAttribute('data-aud-theme')
      else html.setAttribute('data-aud-theme', previous)
      if (previousPalette === null) html.removeAttribute('data-aud-palette')
      else html.setAttribute('data-aud-palette', previousPalette)
      if (previousColor) meta?.setAttribute('content', previousColor)
    }
  }, [appearance.theme, appearance.resolvedPalette])
  return (
    <CollectionPreferences>
      <div
        className="aud-app flex min-h-svh flex-col text-foreground"
        data-aud-theme={appearance.theme}
        data-aud-palette={appearance.resolvedPalette}
        data-aud-ambient={appearance.ambient ? 'on' : 'off'}
        data-aud-wallpaper={preview.poster ? 'on' : 'off'}
      >
        <PosterBackdrop poster={preview.poster} />
        <a
          className="skip-link"
          href="#contenido"
          onClick={(event) => {
            event.preventDefault()
            document.getElementById('contenido')?.focus()
          }}
        >
          Ir al contenido
        </a>
        <main id="contenido" tabIndex={-1} className="app-main flex-1">
          {account ? (
            <AccountLibrary account={account} />
          ) : (
            <NavigationProvider>
              <LibraryPage repository={repository} />
            </NavigationProvider>
          )}
        </main>
      </div>
    </CollectionPreferences>
  )
}
