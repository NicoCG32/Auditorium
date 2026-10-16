import { useEffect } from 'react'
import type { BackupLocalRepository } from '../domain/repositories/local-repository'
import { LibraryPage } from '../ui/library/LibraryPage'
import { OfflinePanel } from '../ui/offline/OfflinePanel'
import type { OfflineController } from '../infrastructure/browser/offline-controller'
import { AppearanceControls } from '../ui/appearance/AppearanceControls'
import { PosterBackdrop } from '../ui/appearance/PosterBackdrop'
import { useAppearance } from '../ui/appearance/use-appearance'
import { usePosterPreview } from '../ui/appearance/use-poster-preview'

export function App({
  repository,
  offline,
}: {
  repository: BackupLocalRepository
  offline?: OfflineController
}) {
  const appearance = useAppearance()
  const preview = usePosterPreview()
  useEffect(() => {
    const html = document.documentElement
    const previous = html.getAttribute('data-aud-theme')
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousColor = meta?.getAttribute('content')
    html.setAttribute('data-aud-theme', appearance.theme)
    meta?.setAttribute(
      'content',
      appearance.theme === 'light' ? '#ebe2d6' : '#0a0a0d',
    )
    return () => {
      if (previous === null) html.removeAttribute('data-aud-theme')
      else html.setAttribute('data-aud-theme', previous)
      if (previousColor) meta?.setAttribute('content', previousColor)
    }
  }, [appearance.theme])
  return (
    <div
      className="aud-app flex min-h-svh flex-col text-foreground"
      data-aud-theme={appearance.theme}
      data-aud-ambient={appearance.ambient ? 'on' : 'off'}
    >
      <PosterBackdrop poster={preview.poster} visible={appearance.ambient} />
      <a className="skip-link" href="#contenido">
        Ir al contenido
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <img
              src={`${import.meta.env.BASE_URL}auditorium/brand/wordmark-${appearance.theme}.svg`}
              alt="Auditórium · Tu fonoteca digital"
              width={980}
              height={198}
              className="brand-wordmark"
            />
          </div>
          <AppearanceControls appearance={appearance} preview={preview} />
        </div>
      </header>
      <main id="contenido" tabIndex={-1} className="app-main flex-1">
        <LibraryPage repository={repository} />
      </main>
      <footer className="app-footer">
        {offline && <OfflinePanel controller={offline} />}
        <img
          src={`${import.meta.env.BASE_URL}auditorium/decor/divider-simple.svg`}
          alt=""
          aria-hidden="true"
          width={800}
          height={80}
          className="brand-divider"
          loading="lazy"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p>Tu música. Tu criterio. Tu colección.</p>
          <p>Guardada en este navegador.</p>
        </div>
      </footer>
    </div>
  )
}
