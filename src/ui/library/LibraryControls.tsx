import { useId, useMemo, useState } from 'react'
import {
  libraryFilterOptions,
  type LibraryAlbum,
  type LibraryFilters,
  type LibraryOrder,
  type RatingFilter,
} from '../../application/library-query'
import { listeningStatusSchema } from '../../domain/library/schemas'
import { listeningLabels } from './labels'

interface Props {
  filters: LibraryFilters
  onChange: (filters: LibraryFilters) => void
  view: 'grid' | 'list'
  onViewChange: (view: 'grid' | 'list') => void
  albums?: LibraryAlbum[]
}

export function LibraryControls({
  filters,
  onChange,
  view,
  onViewChange,
  albums,
}: Props) {
  const options = useMemo(() => libraryFilterOptions(albums ?? []), [albums])
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const selected = [
    ...(filters.genre
      ? [
          {
            key: 'genre' as const,
            label: `Género: ${options.genres.find((item) => item.value === filters.genre)?.label ?? filters.genre}`,
          },
        ]
      : []),
    ...(filters.country
      ? [
          {
            key: 'country' as const,
            label: `País: ${options.countries.find((item) => item.value === filters.country)?.label ?? filters.country}`,
          },
        ]
      : []),
    ...(filters.listening !== 'all'
      ? [
          {
            key: 'listening' as const,
            label: `Escucha: ${listeningLabels[filters.listening]}`,
          },
        ]
      : []),
    ...(filters.rating !== 'all'
      ? [
          {
            key: 'rating' as const,
            label: `Nota: ${{ unrated: 'Sin nota', rated: 'Con nota', high: '8 o más' }[filters.rating]}`,
          },
        ]
      : []),
  ]
  return (
    <section
      aria-label="Buscar y filtrar biblioteca"
      className="library-controls"
    >
      <label className="search-field">
        <span className="field-label">Buscar en tu biblioteca</span>
        <input
          type="search"
          value={filters.search}
          placeholder="Título, artista, género o país…"
          onChange={(event) =>
            onChange({ ...filters, search: event.target.value })
          }
        />
      </label>
      <div className="library-toolbar">
        <button
          type="button"
          className="filter-toggle action-button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((value) => !value)}
        >
          Filtros{selected.length > 0 ? ` (${selected.length})` : ''}
        </button>
        <label className="library-sort">
          <span className="sr-only">Ordenar por</span>
          <select
            value={filters.order}
            onChange={(event) =>
              onChange({
                ...filters,
                order: event.target.value as LibraryOrder,
              })
            }
          >
            <option value="added">Añadidos recientemente</option>
            <option value="title">Título A–Z</option>
            <option value="artist">Artista A–Z</option>
            <option value="rating">Mayor nota</option>
            <option value="genre">Género A–Z</option>
            <option value="country">País de origen A–Z</option>
          </select>
        </label>
        <div
          className="library-view-toggle"
          role="group"
          aria-label="Vista de biblioteca"
        >
          {(['grid', 'list'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="view-button"
              aria-label={mode === 'grid' ? 'Cuadrícula' : 'Lista'}
              aria-pressed={view === mode}
              onClick={() => onViewChange(mode)}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                {mode === 'grid' ? (
                  <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
                ) : (
                  <path d="M3 5h3v3H3zM10 6.5h11M3 16h3v3H3zM10 17.5h11" />
                )}
              </svg>
              <span>{mode === 'grid' ? 'Cuadrícula' : 'Lista'}</span>
            </button>
          ))}
        </div>
      </div>
      {selected.length > 0 ? (
        <ul className="active-filters" aria-label="Filtros activos">
          {selected.map(({ key, label }) => (
            <li key={key}>
              <button
                type="button"
                className="filter-chip"
                aria-label={`Quitar filtro ${label}`}
                onClick={() =>
                  onChange({
                    ...filters,
                    [key]: key === 'genre' || key === 'country' ? '' : 'all',
                  })
                }
              >
                {label} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div id={panelId} className="library-filter-fields" hidden={!expanded}>
        <label>
          <span className="field-label">Género</span>
          <select
            value={filters.genre ?? ''}
            onChange={(event) =>
              onChange({ ...filters, genre: event.target.value })
            }
          >
            <option value="">Todos los géneros</option>
            {filters.genre &&
            !options.genres.some((option) => option.value === filters.genre) ? (
              <option value={filters.genre}>
                {filters.genre} (sin coincidencias)
              </option>
            ) : null}
            {options.genres.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">País de origen</span>
          <select
            value={filters.country ?? ''}
            onChange={(event) =>
              onChange({ ...filters, country: event.target.value })
            }
          >
            <option value="">Todos los países</option>
            {filters.country &&
            !options.countries.some(
              (option) => option.value === filters.country,
            ) ? (
              <option value={filters.country}>
                {filters.country} (sin coincidencias)
              </option>
            ) : null}
            {options.countries.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Escucha</span>
          <select
            value={filters.listening}
            onChange={(event) =>
              onChange({
                ...filters,
                listening:
                  event.target.value === 'all'
                    ? 'all'
                    : listeningStatusSchema.parse(event.target.value),
              })
            }
          >
            <option value="all">Todos los estados</option>
            {listeningStatusSchema.options.map((status) => (
              <option key={status} value={status}>
                {listeningLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Nota</span>
          <select
            value={filters.rating}
            onChange={(event) =>
              onChange({
                ...filters,
                rating: event.target.value as RatingFilter,
              })
            }
          >
            <option value="all">Todas las notas</option>
            <option value="unrated">Sin nota</option>
            <option value="rated">Con nota</option>
            <option value="high">8 o más</option>
          </select>
        </label>
      </div>
    </section>
  )
}
