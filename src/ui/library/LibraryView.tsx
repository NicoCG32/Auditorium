import {
  defaultLibraryFilters,
  queryLibrary,
  ratingGenre,
  type LibraryAlbum,
  type LibraryFilters,
} from '../../application/library-query'
import { AlbumCard } from './AlbumCard'
import { useLocalCovers } from './cover-context'
import { LibraryControls } from './LibraryControls'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../../domain/repositories/local-repository'
import type { SavedCollectionViewsState } from '../appearance/use-saved-collection-views'
import type { CollectionViewSettings } from '../../application/collection-views'
import type { CollectionBatchAction } from '../../application/collection-batches'
import { CollectionBatchDialog } from './CollectionBatchDialog'
import { CollectionViewsDialog } from './CollectionViewsDialog'
import { albumArtistIndex } from '../../application/catalog-artists'
import {
  indexLibraryHoldings,
  inCollectionMedium,
  type CollectionMedium,
  type PhysicalFormat,
} from '../../application/library-holdings'

export function LibraryView({
  albums,
  snapshot,
  filters,
  onFiltersChange,
  view,
  onViewChange,
  onOpen,
  onAdd,
  onArtist,
  medium,
  onMediumChange,
  covers,
  details,
  controlsOpen,
  onControlsOpen,
  repository,
  onCommitted,
  onBusyChange,
  savedViews,
  format,
  onFormatChange,
}: {
  albums: LibraryAlbum[]
  snapshot: LocalSnapshot
  filters: LibraryFilters
  onFiltersChange: (filters: LibraryFilters) => void
  view: 'grid' | 'list'
  onViewChange: (view: 'grid' | 'list') => void
  onOpen: (id: string) => void
  onAdd: () => void
  onArtist: (id: string) => void
  medium: CollectionMedium
  onMediumChange: (medium: CollectionMedium) => void
  covers: 'small' | 'medium' | 'large'
  details: boolean
  controlsOpen: boolean
  onControlsOpen: (open: boolean) => void
  repository: TransactionalLocalRepository
  onCommitted: () => Promise<LocalSnapshot>
  onBusyChange: (busy: boolean) => void
  savedViews: SavedCollectionViewsState
  format: PhysicalFormat
  onFormatChange: (format: PhysicalFormat) => void
}) {
  const localCovers = useLocalCovers()
  const artists = useMemo(
    () => albumArtistIndex(snapshot.catalog),
    [snapshot.catalog],
  )
  const collection = useMemo(
    () => indexLibraryHoldings(snapshot, albums),
    [snapshot, albums],
  )
  const visible = queryLibrary(albums, filters).filter((album) =>
    inCollectionMedium(collection.holdings.get(album.id), medium, format),
  )
  const scope = `${snapshot.identity.userId}:${snapshot.identity.createdAt}`
  const criteria = JSON.stringify([
    filters.search,
    filters.genre ?? '',
    filters.country ?? '',
    filters.listening,
    filters.rating,
    filters.ratingBasis ?? 'auto',
    medium,
    format,
  ])
  const [selection, setSelection] = useState({
    scope,
    criteria,
    active: false,
    ids: [] as string[],
  })
  const [batch, setBatch] = useState<{
    ids: string[]
    action: CollectionBatchAction
  }>()
  const [viewsOpen, setViewsOpen] = useState(false),
    [notice, setNotice] = useState('')
  const selectionButton = useRef<HTMLButtonElement>(null),
    selectionEndButton = useRef<HTMLButtonElement>(null),
    viewsButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const [focusRequest, setFocusRequest] = useState<{
    target: HTMLElement | null
  }>()
  const visibleIds = new Set(visible.map((album) => album.id))
  const selectedIds =
    selection.scope === scope && selection.criteria === criteria
      ? selection.ids.filter((id) => visibleIds.has(id))
      : []
  if (
    selection.scope !== scope ||
    selection.criteria !== criteria ||
    selectedIds.length !== selection.ids.length
  ) {
    setSelection({
      scope,
      criteria,
      active: selection.scope === scope && selection.active,
      ids: selectedIds,
    })
    if (selection.scope !== scope) {
      setBatch(undefined)
      setViewsOpen(false)
      setNotice('')
    }
  }
  useEffect(() => {
    if (!focusRequest) return
    // Wait until the modal and any completed-selection controls have unmounted.
    const frame = requestAnimationFrame(() => {
      const target = focusRequest.target
      ;(target?.isConnected
        ? target
        : (selectionButton.current ?? selectionEndButton.current)
      )?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusRequest])
  function restoreFocus(target: HTMLElement | null) {
    setFocusRequest({ target })
  }
  function closeBatch() {
    setBatch(undefined)
    restoreFocus(returnFocus.current)
  }
  function openBatch(
    ids: string[],
    action: CollectionBatchAction,
    source: HTMLElement,
  ) {
    returnFocus.current = source
    setNotice('')
    setBatch({ ids: [...ids], action })
  }
  function toggle(id: string) {
    setSelection({
      scope,
      criteria,
      active: true,
      ids: selectedIds.includes(id)
        ? selectedIds.filter((value) => value !== id)
        : [...selectedIds, id],
    })
  }
  const selected = new Set(selectedIds)
  const currentView: CollectionViewSettings = {
    filters: {
      ...filters,
      genre: filters.genre ?? '',
      country: filters.country ?? '',
      ratingBasis: filters.ratingBasis ?? 'auto',
    },
    medium,
    format: medium === 'physical' ? format : 'all',
    view,
  }
  function applyView(settings: CollectionViewSettings) {
    onFiltersChange(settings.filters)
    onMediumChange(settings.medium)
    onFormatChange(settings.format)
    onViewChange(settings.view)
  }
  const context = ratingGenre(filters)
  const narrowed = Boolean(
    medium !== 'all' ||
    filters.search ||
    filters.genre ||
    filters.country ||
    filters.listening !== 'all' ||
    filters.rating !== 'all',
  )
  if (!albums.length)
    return (
      <section
        className="library-empty library-welcome"
        aria-labelledby="empty-title"
      >
        <div className="welcome-copy">
          <h2 id="empty-title" className="text-3xl font-semibold">
            Aún no hay álbumes
          </h2>
          <p className="mt-4 max-w-md text-muted">
            Empieza con un artista y un título. Después podrás completar el
            resto.
          </p>
          <button type="button" className="primary-button mt-6" onClick={onAdd}>
            Añadir tu primer álbum
          </button>
        </div>
      </section>
    )
  return (
    <section
      className="collection-gallery"
      data-covers={covers}
      aria-label="Tu colección"
    >
      <div className="collection-browse-bar">
        <div
          className="collection-medium"
          role="group"
          aria-label="Mostrar en mi colección"
        >
          {(
            [
              ['all', 'Todos'],
              ['physical', 'Físico'],
              ['digital', 'Digital'],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={medium === value}
              onClick={() => onMediumChange(value)}
            >
              {label} <span>{collection.counts[value]}</span>
            </button>
          ))}
        </div>
        <button
          ref={viewsButton}
          type="button"
          className="collection-views-trigger action-button"
          aria-label="Vistas guardadas"
          onClick={() => {
            setNotice('')
            setViewsOpen(true)
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="M6 3h12v18l-6-4-6 4z" />
          </svg>
          Vistas
        </button>
      </div>
      {medium === 'physical' ? (
        <label className="collection-format-filter">
          <span>Formato físico</span>
          <select
            value={format}
            onChange={(event) => {
              setNotice('')
              onFormatChange(event.currentTarget.value as PhysicalFormat)
            }}
          >
            <option value="all">Todos los formatos</option>
            <option value="cd">CD</option>
            <option value="vinyl">Vinilo</option>
            <option value="cassette">Casete</option>
            <option value="other">Otro</option>
          </select>
        </label>
      ) : null}
      <LibraryControls
        expanded={controlsOpen}
        onExpandedChange={onControlsOpen}
        albums={albums}
        filters={filters}
        onChange={onFiltersChange}
        view={view}
        onViewChange={onViewChange}
      />
      <div className="library-results">
        <p role="status" className="text-sm text-muted">
          {visible.length} de {albums.length}{' '}
          {albums.length === 1 ? 'álbum' : 'álbumes'}
        </p>
        {!selection.active ? (
          <button
            ref={selectionButton}
            type="button"
            className="text-button collection-select-toggle"
            onClick={() => {
              setNotice('')
              setSelection({ scope, criteria, active: true, ids: [] })
            }}
          >
            Seleccionar
          </button>
        ) : null}
        {localCovers ? (
          <button
            type="button"
            className="text-button"
            disabled={localCovers.busy}
            onClick={localCovers.complete}
          >
            Completar portadas
          </button>
        ) : null}
        {narrowed ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onFiltersChange({
                ...defaultLibraryFilters,
                order: filters.order,
              })
              onMediumChange('all')
            }}
          >
            Limpiar búsqueda y filtros
          </button>
        ) : null}
      </div>
      {notice ? (
        <p role="status" className="collection-action-notice">
          {notice}
        </p>
      ) : null}
      {selection.active ? (
        <section
          className="collection-selection"
          aria-label="Seleccionar álbumes"
        >
          <div className="collection-selection-top">
            <p role="status">
              {selectedIds.length}{' '}
              {selectedIds.length === 1
                ? 'álbum seleccionado'
                : 'álbumes seleccionados'}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="text-button"
                disabled={
                  visible.length === 0 || selectedIds.length === visible.length
                }
                onClick={() =>
                  setSelection({
                    scope,
                    criteria,
                    active: true,
                    ids: visible.map((album) => album.id),
                  })
                }
              >
                Seleccionar visibles
              </button>
              <button
                type="button"
                className="text-button"
                disabled={!selectedIds.length}
                onClick={() =>
                  setSelection({ scope, criteria, active: true, ids: [] })
                }
              >
                Limpiar
              </button>
              <button
                ref={selectionEndButton}
                type="button"
                className="collection-icon-button"
                aria-label="Terminar selección"
                title="Terminar selección"
                onClick={() =>
                  setSelection({ scope, criteria, active: false, ids: [] })
                }
              >
                ×
              </button>
            </div>
          </div>
          <div className="collection-selection-actions">
            <button
              type="button"
              className="action-button"
              disabled={!selectedIds.length}
              onClick={(event) =>
                openBatch(
                  selectedIds,
                  { kind: 'own', format: 'cd' },
                  event.currentTarget,
                )
              }
            >
              Lo tengo
            </button>
            <button
              type="button"
              className="action-button"
              disabled={!selectedIds.length}
              onClick={(event) =>
                openBatch(
                  selectedIds,
                  { kind: 'wish', format: 'cd' },
                  event.currentTarget,
                )
              }
            >
              Lo quiero
            </button>
            <button
              type="button"
              className="action-button"
              disabled={!selectedIds.length}
              onClick={(event) =>
                openBatch(
                  selectedIds,
                  {
                    kind: 'listening',
                    status: 'completed',
                  },
                  event.currentTarget,
                )
              }
            >
              Escucha
            </button>
          </div>
          <p className="text-xs text-muted">
            La selección se reinicia al cambiar los filtros.
          </p>
        </section>
      ) : null}
      {!visible.length ? (
        <section className="library-empty" aria-labelledby="no-results-title">
          <h2 id="no-results-title" className="text-2xl font-semibold">
            No encontramos coincidencias
          </h2>
          <p className="mt-3 text-muted">
            {medium === 'all'
              ? 'Prueba otro título o artista, o limpia los filtros.'
              : `Aquí aparecen los álbumes con ${medium === 'physical' ? 'ejemplares físicos' : 'ejemplares digitales'} registrados en su ficha.`}
          </p>
          <button
            type="button"
            className="action-button mt-6"
            onClick={() => {
              onFiltersChange({
                ...defaultLibraryFilters,
                order: filters.order,
              })
              onMediumChange('all')
            }}
          >
            Mostrar todos los álbumes
          </button>
        </section>
      ) : (
        <ul
          aria-label="Álbumes de tu biblioteca"
          className={view === 'grid' ? 'album-grid' : 'album-list'}
        >
          {visible.map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              view={view}
              artists={artists.get(album.albumId) ?? []}
              onArtist={onArtist}
              {...(selection.active
                ? {
                    selection: {
                      checked: selected.has(album.id),
                      onToggle: () => toggle(album.id),
                    },
                  }
                : {
                    onActions: (source) =>
                      openBatch(
                        [album.id],
                        { kind: 'own', format: 'cd' },
                        source,
                      ),
                  })}
              {...(collection.holdings.has(album.id)
                ? { collection: collection.holdings.get(album.id)! }
                : {})}
              details={
                details ||
                Boolean(
                  filters.genre ||
                  filters.country ||
                  filters.listening !== 'all' ||
                  filters.rating !== 'all' ||
                  ['rating', 'genre', 'country'].includes(filters.order),
                )
              }
              {...(context ? { ratingGenre: context } : {})}
              onOpen={() => onOpen(album.id)}
            />
          ))}
        </ul>
      )}
      {viewsOpen ? (
        <CollectionViewsDialog
          saved={savedViews}
          current={currentView}
          onApply={applyView}
          onNotice={setNotice}
          onClose={() => {
            setViewsOpen(false)
            restoreFocus(viewsButton.current)
          }}
        />
      ) : null}
      {batch ? (
        <CollectionBatchDialog
          repository={repository}
          ids={batch.ids}
          initialAction={batch.action}
          onBusyChange={onBusyChange}
          onCommitted={onCommitted}
          onClose={closeBatch}
          onDone={(receipt) => {
            setNotice(
              `Cambios guardados en ${receipt.changed} ${receipt.changed === 1 ? 'álbum' : 'álbumes'}.${receipt.unchanged ? ` ${receipt.unchanged} ya ${receipt.unchanged === 1 ? 'estaba actualizado' : 'estaban actualizados'}.` : ''}`,
            )
            setSelection({ scope, criteria, active: false, ids: [] })
            closeBatch()
          }}
        />
      ) : null}
    </section>
  )
}
