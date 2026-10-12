import type { Catalog } from '../../domain/catalog/schemas'
import {
  emptyTrackDraft,
  contentLabels,
  type TrackDraft,
} from './track-list-drafts'
export function TrackListEditor({
  rows,
  tracks,
  edition,
  onChange,
}: {
  rows: TrackDraft[]
  tracks: Catalog['tracks']
  edition: boolean
  onChange: (rows: TrackDraft[]) => void
}) {
  function change(key: string, patch: Partial<TrackDraft>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }
  return (
    <>
      <p className="mt-3 text-sm text-muted">
        Las posiciones deben ser positivas y únicas por disco. Quitar una
        aparición de esta lista conserva la pista y sus valoraciones.
      </p>
      <div className="mt-5 grid gap-4">
        {rows.map((row, index) => {
          const label = index + 1
          return (
            <fieldset key={row.key} className="track-draft">
              <legend className="px-2 font-semibold">Pista {label}</legend>
              <div className="track-fields">
                <label className="field-label">
                  Pista a utilizar {label}
                  <select
                    value={row.source}
                    onChange={(event) =>
                      change(row.key, { source: event.target.value })
                    }
                  >
                    <option value="new">Crear una pista nueva</option>
                    {tracks.map((track) => (
                      <option key={track.id} value={track.id}>
                        {track.title}
                        {track.versionLabel ? ` (${track.versionLabel})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {row.source === 'new' ? (
                  <>
                    <label className="field-label">
                      Título nuevo {label}
                      <input
                        value={row.title}
                        onChange={(event) =>
                          change(row.key, { title: event.target.value })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Variante de {label}
                      <select
                        value={row.variant}
                        onChange={(event) =>
                          change(row.key, { variant: event.target.value })
                        }
                      >
                        <option value="">Sin relación de variante</option>
                        {tracks.map((track) => (
                          <option key={track.id} value={track.id}>
                            {track.title}
                            {track.versionLabel
                              ? ` (${track.versionLabel})`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Versión {label}
                      <input
                        placeholder="Demo, directo, remix…"
                        value={row.version}
                        onChange={(event) =>
                          change(row.key, { version: event.target.value })
                        }
                      />
                    </label>
                  </>
                ) : null}
                <label className="field-label">
                  Disco {label}
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={row.disc}
                    onChange={(event) =>
                      change(row.key, { disc: event.target.value })
                    }
                  />
                </label>
                <label className="field-label">
                  Posición {label}
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={row.number}
                    onChange={(event) =>
                      change(row.key, { number: event.target.value })
                    }
                  />
                </label>
                {edition ? (
                  <>
                    <label className="field-label">
                      Contenido {label}
                      <select
                        value={row.role}
                        onChange={(event) =>
                          change(row.key, { role: event.target.value })
                        }
                      >
                        {Object.entries(contentLabels).map(([value, title]) => (
                          <option key={value} value={value}>
                            {title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-label">
                      Título en esta edición {label}
                      <input
                        value={row.displayTitle}
                        onChange={(event) =>
                          change(row.key, { displayTitle: event.target.value })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Duración (m:ss) {label}
                      <input
                        type="text"
                        placeholder="3:45"
                        value={row.duration}
                        onChange={(event) =>
                          change(row.key, { duration: event.target.value })
                        }
                      />
                    </label>
                  </>
                ) : null}
              </div>
              <button
                type="button"
                className="text-button mt-3"
                onClick={() =>
                  onChange(
                    rows.filter((candidate) => candidate.key !== row.key),
                  )
                }
              >
                Quitar aparición {label}
              </button>
            </fieldset>
          )
        })}
      </div>
      <button
        type="button"
        className="action-button mt-4"
        onClick={() => onChange([...rows, emptyTrackDraft(rows.length + 1)])}
      >
        Añadir aparición
      </button>
    </>
  )
}
