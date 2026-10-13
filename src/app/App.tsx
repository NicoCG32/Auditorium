import type { BackupLocalRepository } from '../domain/repositories/local-repository'
import { LibraryPage } from '../ui/library/LibraryPage'
import { OfflinePanel } from '../ui/offline/OfflinePanel'
import type { OfflineController } from '../infrastructure/browser/offline-controller'

export function App({
  repository,
  offline,
}: {
  repository: BackupLocalRepository
  offline?: OfflineController
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <a className="skip-link" href="#contenido">
        Ir al contenido
      </a>
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6 sm:px-10 lg:px-16">
          <span className="flex items-center gap-3 font-display text-sm font-black tracking-[0.16em]">
            <span className="brand-mark" aria-hidden="true" />
            AUDITÓRIUM
          </span>
          <span className="text-xs tracking-[0.08em] text-muted">
            Archivo musical personal
          </span>
        </div>
      </header>
      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-6 py-10 sm:px-10 lg:px-16 lg:py-14"
      >
        <LibraryPage repository={repository} />
      </main>
      <footer className="mx-auto w-full max-w-7xl px-6 pb-7 sm:px-10 lg:px-16">
        {offline && <OfflinePanel controller={offline} />}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted">
          <p>Tu música. Tu criterio. Tu colección.</p>
          <p>Guardada en este navegador.</p>
        </div>
      </footer>
    </div>
  )
}
