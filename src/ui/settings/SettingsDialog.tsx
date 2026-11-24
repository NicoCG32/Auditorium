import { useEffect, useRef, useState } from 'react'
import type { Route } from '../navigation/routes'
import { SettingsPage } from './SettingsPage'
import { OfflineNotice } from '../offline/OfflinePanel'
import { useApplicationSettings } from './application-settings-context'

export function SettingsDialog({
  disabled,
  onClose,
  onNavigate,
  onRefresh,
}: {
  disabled: boolean
  onClose: () => void
  onNavigate: (route: Route) => void
  onRefresh: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { offline } = useApplicationSettings()
  const [section, setSection] = useState<'appearance' | 'application'>(
    'appearance',
  )
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => {
      if (element?.open) element.close()
    }
  }, [])
  function close() {
    dialog.current?.close()
    onClose()
  }
  function navigate(route: Route) {
    close()
    onNavigate(route)
  }
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-labelledby="settings-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <header className="settings-dialog-heading">
        <h2 id="settings-dialog-title">Ajustes</h2>
        <button
          type="button"
          className="settings-close"
          aria-label="Cerrar ajustes"
          onClick={close}
        >
          ×
        </button>
      </header>
      {offline ? <OfflineNotice controller={offline} /> : null}
      <nav className="workspace-tabs" aria-label="Ajustes">
        <button
          type="button"
          aria-current={section === 'appearance' ? 'page' : undefined}
          onClick={() => setSection('appearance')}
        >
          Personalización
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => navigate({ kind: 'options', section: 'account' })}
        >
          Cuenta
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => navigate({ kind: 'options', section: 'backups' })}
        >
          Respaldos
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => navigate({ kind: 'options', section: 'removed' })}
        >
          Retirados
        </button>
        <button
          type="button"
          aria-current={section === 'application' ? 'page' : undefined}
          onClick={() => setSection('application')}
        >
          Aplicación
        </button>
      </nav>
      <SettingsPage
        section={section}
        onRefresh={onRefresh}
        disabled={disabled}
      />
    </dialog>
  )
}
