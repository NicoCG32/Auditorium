import { useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { routeHash, routeTitle, type Route } from './routes'
import { useApplicationSettings } from '../settings/application-settings-context'
import { OfflineNotice } from '../offline/OfflinePanel'
import { SettingsDialog } from '../settings/SettingsDialog'

function isSettingsRoute(route: Route) {
  return (
    route.kind === 'settings' ||
    (route.kind === 'options' &&
      ['account', 'backups', 'removed'].includes(route.section))
  )
}
const collectionRoutes: { label: string; route: Route }[] = [
  { label: 'Álbumes', route: { kind: 'library' } },
  { label: 'Artistas', route: { kind: 'artists' } },
  { label: 'Ejemplares', route: { kind: 'collection' } },
  { label: 'Calificaciones', route: { kind: 'ratings' } },
]
const settingsRoutes: Route[] = [
  { kind: 'settings', section: 'appearance' },
  { kind: 'options', section: 'account' },
  { kind: 'options', section: 'backups' },
  { kind: 'options', section: 'removed' },
  { kind: 'settings', section: 'application' },
]
const destinations: { label: string; icon: IconName; route: Route }[] = [
  { label: 'Buscar', icon: 'search', route: { kind: 'catalog' } },
  { label: 'Mi colección', icon: 'library', route: { kind: 'library' } },
  {
    label: 'Deseos',
    icon: 'heart',
    route: { kind: 'options', section: 'wishes' },
  },
  {
    label: 'Sugerencias',
    icon: 'listen',
    route: { kind: 'options', section: 'recommendations' },
  },
  {
    label: 'Ajustes',
    icon: 'settings',
    route: { kind: 'settings', section: 'appearance' },
  },
]
type IconName = 'search' | 'library' | 'heart' | 'listen' | 'settings' | 'add'
const iconPaths: Record<IconName, string> = {
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  library: 'M4 3v18M9 3v18M14 3v18M18 4l4 16',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  listen: 'M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3zm14 0h4v8h-4z',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  add: 'M12 5v14M5 12h14',
}
function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  )
}

export function AppShell({
  route,
  title,
  disabled,
  onNavigate,
  accountLabel,
  onRefresh,
  children,
}: {
  route: Route
  title: string
  disabled: boolean
  onNavigate: (route: Route) => void
  accountLabel: string
  onRefresh: () => void
  children: ReactNode
}) {
  const { appearance, offline } = useApplicationSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const settings = isSettingsRoute(route)
  const collection = ['library', 'artists', 'collection', 'ratings'].includes(
    route.kind,
  )
  const collectionActive =
    collection || route.kind === 'album' || route.kind === 'artist'
  function active(next: Route) {
    if (next.kind === 'library') return collectionActive
    if (next.kind === 'settings') return settings
    return routeHash(next) === routeHash(route)
  }
  function navigate(event: MouseEvent<HTMLButtonElement>, next: Route) {
    event.currentTarget.focus()
    if (next.kind === 'settings' && !settings) {
      setSettingsOpen(true)
      return
    }
    onNavigate(next)
  }
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <button
          type="button"
          className="sidebar-brand"
          aria-label="Ir a mi colección"
          disabled={disabled}
          onClick={(event) => navigate(event, { kind: 'library' })}
        >
          <img
            src={`${import.meta.env.BASE_URL}auditorium/brand/wordmark-${appearance.theme}.svg`}
            alt="Auditórium"
            width={2400}
            height={720}
          />
        </button>
        <nav className="app-navigation" aria-label="Navegación principal">
          {destinations.map((item) => (
            <button
              key={item.icon}
              type="button"
              id={`nav-${item.route.kind === 'options' ? item.route.section : item.route.kind}`}
              ref={item.icon === 'settings' ? settingsButton : undefined}
              aria-haspopup={
                item.icon === 'settings' && !settings ? 'dialog' : undefined
              }
              aria-expanded={
                item.icon === 'settings' && !settings ? settingsOpen : undefined
              }
              className={`app-nav-item${item.icon === 'settings' ? ' app-nav-settings' : ''}`}
              aria-current={active(item.route) ? 'page' : undefined}
              disabled={disabled}
              onClick={(event) => navigate(event, item.route)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <p className="sidebar-account">{accountLabel}</p>
      </aside>
      <div className="app-workspace">
        {offline && !settingsOpen ? (
          <OfflineNotice controller={offline} />
        ) : null}
        <div className="workspace-mobile-brand" aria-hidden="true">
          Auditórium
        </div>
        <header className="workspace-heading">
          <h1 tabIndex={-1} data-route-heading className="library-title">
            {settings ? 'Ajustes' : title}
          </h1>
          <button
            type="button"
            id="nav-add"
            aria-label="Añadir álbum"
            title="Añadir álbum"
            className="primary-button workspace-add"
            disabled={disabled}
            onClick={(event) => navigate(event, { kind: 'add' })}
          >
            <Icon name="add" />
            <span>Añadir álbum</span>
          </button>
        </header>
        {collectionActive && (
          <nav className="workspace-tabs" aria-label="Vistas de mi colección">
            {collectionRoutes.map((item) => (
              <button
                type="button"
                key={item.route.kind}
                id={`view-${item.route.kind}`}
                aria-current={
                  route.kind === item.route.kind ? 'page' : undefined
                }
                disabled={disabled}
                onClick={(event) => navigate(event, item.route)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
        {settings && (
          <nav className="workspace-tabs settings-tabs" aria-label="Ajustes">
            {settingsRoutes.map((item) => (
              <button
                type="button"
                key={routeHash(item)}
                aria-current={
                  routeHash(route) === routeHash(item) ? 'page' : undefined
                }
                disabled={disabled}
                onClick={(event) => navigate(event, item)}
              >
                {item.kind === 'options' && item.section === 'account'
                  ? 'Cuenta'
                  : item.kind === 'options' && item.section === 'removed'
                    ? 'Retirados'
                    : routeTitle(item)}
              </button>
            ))}
          </nav>
        )}
        <div className="workspace-content">{children}</div>
      </div>
      {settingsOpen ? (
        <SettingsDialog
          disabled={disabled}
          onRefresh={onRefresh}
          onNavigate={onNavigate}
          onClose={() => {
            setSettingsOpen(false)
            settingsButton.current?.focus({ preventScroll: true })
          }}
        />
      ) : null}
    </div>
  )
}
