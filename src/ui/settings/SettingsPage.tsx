import { AppearanceControls } from '../appearance/AppearanceControls'
import { OfflinePanel } from '../offline/OfflinePanel'
import { useApplicationSettings } from './application-settings-context'

export function SettingsPage({
  section,
  onRefresh,
  disabled,
}: {
  section: 'appearance' | 'application'
  onRefresh: () => void
  disabled: boolean
}) {
  const { appearance, preview, offline } = useApplicationSettings()
  if (section === 'appearance')
    return <AppearanceControls appearance={appearance} preview={preview} />
  return (
    <div className="application-settings">
      {offline ? <OfflinePanel controller={offline} /> : null}
      <section className="settings-section">
        <h2>Actualizar la colección</h2>
        <p className="text-muted">
          Vuelve a leer los álbumes guardados en este navegador.
        </p>
        <button
          type="button"
          className="action-button"
          disabled={disabled}
          onClick={onRefresh}
        >
          Actualizar biblioteca
        </button>
      </section>
    </div>
  )
}
