import { useEffect, useRef } from 'react'

export interface GenreRatingDraft {
  genreKey: string
  label: string
  score: string
  reference: string
}

export function GenreRatingsFields({
  rows,
  releases,
  invalidKey,
  focusGenre,
  onChange,
}: {
  rows: GenreRatingDraft[]
  releases: Map<string, string>
  invalidKey: string
  focusGenre?: string
  onChange: (
    key: string,
    change: Partial<Pick<GenreRatingDraft, 'score' | 'reference'>>,
  ) => void
}) {
  const details = useRef<HTMLDetailsElement>(null)
  const inputs = useRef(new Map<string, HTMLInputElement>())
  useEffect(() => {
    if (!focusGenre) return
    if (details.current) details.current.open = true
    inputs.current.get(focusGenre)?.focus()
  }, [focusGenre])
  useEffect(() => {
    if (!invalidKey) return
    if (details.current) details.current.open = true
    inputs.current.get(invalidKey)?.focus()
  }, [invalidKey])
  return (
    <details ref={details} className="genre-ratings-fields">
      <summary className="font-semibold">
        Valorar por género{' '}
        <span className="text-sm text-muted">(opcional)</span>
      </summary>
      <p className="mt-3 text-sm text-muted">
        Cada nota compara tu experiencia en ese género. Es independiente de la
        general y puede quedar pendiente. Añadir el álbum ya expresa que tiene
        valor para ti; una nota baja no significa rechazo.
      </p>
      {!rows.length ? (
        <p className="mt-3 text-sm text-muted">
          Añade géneros en Editar álbum para valorarlos aquí.
        </p>
      ) : (
        <div className="mt-4 grid gap-5">
          {rows.map((row, index) => (
            <fieldset key={row.genreKey} className="genre-rating-row min-w-0">
              <legend className="font-semibold wrap-anywhere">
                {row.label}
              </legend>
              <label className="mt-3 block" htmlFor={`genre-score-${index}`}>
                <span className="field-label">Nota en {row.label}</span>
              </label>
              <input
                id={`genre-score-${index}`}
                inputMode="decimal"
                value={row.score}
                ref={(element) => {
                  if (element) inputs.current.set(row.genreKey, element)
                  else inputs.current.delete(row.genreKey)
                }}
                placeholder="Sin valoración en este género"
                aria-invalid={row.genreKey === invalidKey}
                aria-describedby={
                  row.genreKey === invalidKey
                    ? `genre-error-${index}`
                    : `genre-help-${index}`
                }
                onChange={(event) =>
                  onChange(row.genreKey, {
                    score: event.target.value,
                    ...(!event.target.value.trim() ? { reference: '' } : {}),
                  })
                }
              />
              <p id={`genre-help-${index}`} className="mt-2 text-xs text-muted">
                De 1 a 10, en pasos de 0,5. Vacía: sin valoración en este
                género.
              </p>
              {row.genreKey === invalidKey ? (
                <p
                  id={`genre-error-${index}`}
                  role="alert"
                  className="field-error"
                >
                  Escribe una nota de 1 a 10 en pasos de 0,5 para {row.label}.
                </p>
              ) : null}
              <label className="mt-3 block">
                <span className="field-label">
                  Edición de referencia en {row.label}
                </span>
                <select
                  value={row.reference}
                  disabled={!row.score.trim()}
                  onChange={(event) =>
                    onChange(row.genreKey, { reference: event.target.value })
                  }
                >
                  <option value="">Sin edición de referencia</option>
                  {row.reference && !releases.has(row.reference) ? (
                    <option value={row.reference}>
                      Edición no disponible: revisa la selección
                    </option>
                  ) : null}
                  {[...releases].map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="text-button mt-3"
                disabled={!row.score && !row.reference}
                onClick={() =>
                  onChange(row.genreKey, { score: '', reference: '' })
                }
              >
                Quitar nota de {row.label} del borrador
              </button>
            </fieldset>
          ))}
        </div>
      )}
    </details>
  )
}
