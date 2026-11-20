import { useEffect, useId, useRef } from 'react'
import type { Appearance } from './use-appearance'
import type { PosterPreview, PosterPosition } from './use-poster-preview'
import { CollectionPreferences } from './CollectionPreferences'
import {
  useCollectionPreferences,
  type CollectionPreferences as Preferences,
} from './use-collection-preferences'

export function AppearanceControls({
  appearance,
  preview,
}: {
  appearance: Appearance
  preview: PosterPreview
}) {
  return (
    <CollectionPreferences>
      <Personalization appearance={appearance} preview={preview} />
    </CollectionPreferences>
  )
}
function Personalization({
  appearance,
  preview,
}: {
  appearance: Appearance
  preview: PosterPreview
}) {
  const preferences = useCollectionPreferences()
  const panel = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (
        panel.current?.open &&
        event.target instanceof Node &&
        !panel.current.contains(event.target)
      )
        panel.current.open = false
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])
  const id = useId()
  const fileId = `${id}-poster`
  const noteId = `${id}-note`
  const errorId = `${id}-error`

  return (
    <details
      ref={panel}
      className="appearance-panel"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && panel.current?.open) {
          event.preventDefault()
          panel.current.open = false
          panel.current.querySelector('summary')?.focus()
        }
      }}
    >
      <summary>Personalizar</summary>
      <div className="appearance-content">
        <label className="appearance-label">
          Nombre de tu colección
          <input
            type="text"
            maxLength={60}
            value={preferences.name}
            onChange={(event) =>
              preferences.update({ name: event.currentTarget.value })
            }
          />
        </label>
        <fieldset className="appearance-group">
          <legend>Tus portadas</legend>
          <label className="appearance-label">
            Vista
            <select
              value={preferences.view}
              onChange={(event) =>
                preferences.update({
                  view: event.currentTarget.value as Preferences['view'],
                })
              }
            >
              <option value="grid">Portadas</option>
              <option value="list">Lista</option>
            </select>
          </label>
          <label className="appearance-label">
            Tamaño de las portadas
            <select
              value={preferences.covers}
              onChange={(event) =>
                preferences.update({
                  covers: event.currentTarget.value as Preferences['covers'],
                })
              }
            >
              <option value="small">Pequeñas</option>
              <option value="medium">Medianas</option>
              <option value="large">Grandes</option>
            </select>
          </label>
          <label className="appearance-choice">
            <input
              type="checkbox"
              checked={preferences.details}
              onChange={(event) =>
                preferences.update({ details: event.currentTarget.checked })
              }
            />
            Mostrar géneros, país y valoraciones
          </label>
        </fieldset>
        <fieldset className="appearance-group">
          <legend>Tema</legend>
          <div className="appearance-choices">
            {(['dark', 'light'] as const).map((theme) => (
              <label className="appearance-choice" key={theme}>
                <input
                  type="radio"
                  name={`${id}-theme`}
                  value={theme}
                  checked={appearance.theme === theme}
                  onChange={() => appearance.setTheme(theme)}
                />
                {theme === 'dark' ? 'Oscuro' : 'Claro'}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="appearance-choice">
          <input
            type="checkbox"
            checked={appearance.ambient}
            onChange={(event) =>
              appearance.setAmbient(event.currentTarget.checked)
            }
          />
          Fondo decorativo
        </label>
        <div className="appearance-group">
          <label className="appearance-label" htmlFor={fileId}>
            Foto de fondo (opcional)
          </label>
          <input
            id={fileId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-describedby={`${noteId}${preview.error ? ` ${errorId}` : ''}`}
            aria-invalid={preview.error ? true : undefined}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              void preview.chooseFile(file)
            }}
          />
          <p className="appearance-note" id={noteId}>
            La foto se usa durante esta apertura. Puedes elegir otra cuando
            quieras.
          </p>
          <details className="appearance-file-help">
            <summary>Formatos y privacidad</summary>
            <p className="appearance-note">
              PNG, JPEG o WebP, hasta 5 MB. La foto no se sube y se descarta al
              recargar; no forma parte de tus respaldos.
            </p>
          </details>
          {preview.preparing && <p role="status">Preparando vista previa…</p>}
          {preview.error && (
            <p className="field-error" role="alert" id={errorId}>
              {preview.error}
            </p>
          )}
          {preview.poster && (
            <div className="appearance-poster-controls">
              <label className="appearance-label">
                Opacidad de la foto ({Math.round(preview.poster.opacity * 100)}{' '}
                %)
                <input
                  type="range"
                  min="5"
                  max="25"
                  step="1"
                  value={Math.round(preview.poster.opacity * 100)}
                  onChange={(event) =>
                    preview.setOpacity(Number(event.currentTarget.value) / 100)
                  }
                />
              </label>
              <label className="appearance-label">
                Posición de la foto
                <select
                  value={preview.poster.position}
                  onChange={(event) =>
                    preview.setPosition(
                      event.currentTarget.value as PosterPosition,
                    )
                  }
                >
                  <option value="left">Izquierda</option>
                  <option value="center">Centro</option>
                  <option value="right">Derecha</option>
                </select>
              </label>
              <button
                type="button"
                className="action-button"
                onClick={preview.removePoster}
              >
                Quitar foto
              </button>
              {!appearance.ambient && (
                <p className="appearance-note">
                  La foto está oculta mientras la ambientación está desactivada.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </details>
  )
}
