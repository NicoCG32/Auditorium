export function RatingBasisControl({
  genre,
  label,
  basis,
  onChange,
}: {
  genre?: string
  label?: string
  basis?: 'auto' | 'general'
  onChange: (basis: 'auto' | 'general') => void
}) {
  return (
    <div className="rating-basis-control">
      {genre ? (
        <label>
          <span className="field-label">Valoración usada</span>
          <select
            value={basis === 'general' ? 'general' : 'auto'}
            onChange={(event) =>
              onChange(event.target.value === 'general' ? 'general' : 'auto')
            }
          >
            <option value="auto">En {label ?? genre}</option>
            <option value="general">General</option>
          </select>
        </label>
      ) : (
        <p className="text-sm text-muted">Valoración usada: General</p>
      )}
      <p className="mt-2 text-xs text-muted">
        El orden y los filtros de nota usan esta misma valoración. Sin
        valoración en un género no se sustituye por la general.
      </p>
    </div>
  )
}
