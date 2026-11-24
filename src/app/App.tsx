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
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousColor = meta?.getAttribute('content')
    html.setAttribute('data-aud-theme', appearance.theme)
    meta?.setAttribute(
      'content',
      appearance.theme === 'light' ? '#f1f2f4' : '#111315',
    )
    return () => {
      if (previous === null) html.removeAttribute('data-aud-theme')
      else html.setAttribute('data-aud-theme', previous)
      if (previousColor) meta?.setAttribute('content', previousColor)
    }
  }, [appearance.theme])
  return (
    <CollectionPreferences>
      <div
        className="aud-app flex min-h-svh flex-col text-foreground"
        data-aud-theme={appearance.theme}
        data-aud-ambient={appearance.ambient ? 'on' : 'off'}
      >
        <PosterBackdrop poster={preview.poster} visible={appearance.ambient} />
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
