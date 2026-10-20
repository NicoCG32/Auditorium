import {
  linkProvider,
  MAX_PERSONAL_LINKS,
} from '../../domain/library/personal-links'
import type { LinksDraft } from './personal-links-values'
function draftLabel(link: LinksDraft['links'][number], index: number) {
  if (link.label.trim()) return link.label.trim()
  try {
    return `${linkProvider(link.url)} · enlace ${index + 1}`
  } catch {
    return `Enlace ${index + 1}`
  }
}
export function PersonalLinksEditor({
  value,
  onChange,
  error,
}: {
  value: LinksDraft
  onChange: (value: LinksDraft) => void
  error?: string
}) {
  return (
    <fieldset className="personal-links-editor">
      <legend className="text-lg font-semibold">
        Enlaces personales (opcionales)
      </legend>
      <p className="text-sm text-muted">
        Guarda dónde escuchar o comprar este álbum. El proveedor se reconoce por
        la dirección; una etiqueta te ayuda a distinguir versiones. Hasta{' '}
        {MAX_PERSONAL_LINKS} enlaces HTTPS.
      </p>
      <div className="mt-4 grid gap-4">
        {value.links.map((link, index) => (
          <fieldset className="personal-link-draft" key={link.id}>
            <legend className="text-sm font-semibold">
              Enlace {index + 1}
            </legend>
            <div className="form-grid">
              <label>
                <span className="field-label">
                  Propósito del enlace {index + 1}
                </span>
                <select
                  value={link.purpose}
                  onChange={(event) => {
                    const purpose =
                      event.target.value === 'purchase'
                        ? 'purchase'
                        : 'playback'
                    onChange({
                      links: value.links.map((row) =>
                        row.id === link.id ? { ...row, purpose } : row,
                      ),
                      preferredPlaybackLinkId:
                        purpose === 'purchase' &&
                        value.preferredPlaybackLinkId === link.id
                          ? ''
                          : value.preferredPlaybackLinkId,
                    })
                  }}
                >
                  <option value="playback">Escuchar</option>
                  <option value="purchase">Comprar</option>
                </select>
              </label>
              <label>
                <span className="field-label">
                  Etiqueta del enlace {index + 1}
                </span>
                <input
                  name={`link-label-${index}`}
                  maxLength={80}
                  placeholder="Mi versión favorita (opcional)"
                  value={link.label}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      links: value.links.map((row) =>
                        row.id === link.id
                          ? { ...row, label: event.target.value }
                          : row,
                      ),
                    })
                  }
                />
              </label>
            </div>
            <label>
              <span className="field-label">URL del enlace {index + 1}</span>
              <input
                name={`link-url-${index}`}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={2048}
                placeholder="https://…"
                value={link.url}
                onChange={(event) =>
                  onChange({
                    ...value,
                    links: value.links.map((row) =>
                      row.id === link.id
                        ? { ...row, url: event.target.value }
                        : row,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                onChange({
                  links: value.links.filter((row) => row.id !== link.id),
                  preferredPlaybackLinkId:
                    value.preferredPlaybackLinkId === link.id
                      ? ''
                      : value.preferredPlaybackLinkId,
                })
              }
            >
              Quitar enlace {index + 1}
            </button>
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        className="action-button mt-4"
        disabled={value.links.length >= MAX_PERSONAL_LINKS}
        onClick={() =>
          onChange({
            ...value,
            links: [
              ...value.links,
              {
                id: crypto.randomUUID(),
                purpose: 'playback',
                url: '',
                label: '',
              },
            ],
          })
        }
      >
        Añadir enlace
      </button>
      {value.links.length ? (
        <label className="mt-4 block">
          <span className="field-label">Enlace favorito de reproducción</span>
          <select
            name="preferredPlaybackLinkId"
            value={value.preferredPlaybackLinkId}
            onChange={(event) =>
              onChange({
                ...value,
                preferredPlaybackLinkId: event.target.value,
              })
            }
          >
            <option value="">Sin favorito</option>
            {value.links.map((link, index) =>
              link.purpose === 'playback' ? (
                <option value={link.id} key={link.id}>
                  {draftLabel(link, index)}
                </option>
              ) : null,
            )}
          </select>
          <span className="mt-2 block text-xs text-muted">
            El favorito es opcional. Los demás enlaces de escucha se conservan.
          </span>
        </label>
      ) : null}
      {error ? <p className="field-error">{error}</p> : null}
    </fieldset>
  )
}
