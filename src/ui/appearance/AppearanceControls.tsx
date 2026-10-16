import { useId } from 'react'
import type { Appearance } from './use-appearance'
import type { PosterPreview, PosterPosition } from './use-poster-preview'

export function AppearanceControls({
  appearance,
  preview,
}: {
  appearance: Appearance
  preview: PosterPreview
}) {
  const id = useId()
  const fileId = `${id}-poster`
  const noteId = `${id}-note`
  const errorId = `${id}-error`

  return (
    <details className="appearance-panel">
      <summary>Apariencia</summary>
      <div className="appearance-content">
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
          Ambientación decorativa
        </label>
        <div className="appearance-group">
          <label className="appearance-label" htmlFor={fileId}>
            Foto de fondo opcional
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
            PNG, JPEG o WebP; máximo 5 MiB. Vista previa temporal; al recargar
            se descarta. La foto permanece en esta apertura y no se incluye en
            los respaldos.
          </p>
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
