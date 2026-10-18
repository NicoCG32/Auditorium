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
  const options = libraryFilterOptions(albums ?? [])
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
            onChange({ ...filters, rating: event.target.value as RatingFilter })
          }
        >
          <option value="all">Todas las notas</option>
          <option value="unrated">Sin nota</option>
          <option value="rated">Con nota</option>
          <option value="high">8 o más</option>
        </select>
      </label>
      <label>
        <span className="field-label">Ordenar por</span>
        <select
          value={filters.order}
          onChange={(event) =>
            onChange({ ...filters, order: event.target.value as LibraryOrder })
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
        className="flex flex-wrap items-end gap-1"
        role="group"
        aria-label="Vista de biblioteca"
      >
        <button
          type="button"
          className="view-button"
          aria-pressed={view === 'grid'}
          onClick={() => onViewChange('grid')}
        >
          Cuadrícula
        </button>
        <button
          type="button"
          className="view-button"
          aria-pressed={view === 'list'}
          onClick={() => onViewChange('list')}
        >
          Lista
        </button>
      </div>
    </section>
  )
}
