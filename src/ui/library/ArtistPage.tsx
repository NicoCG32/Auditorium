import { useEffect, useRef, useState } from 'react'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../../domain/repositories/local-repository'
import { projectLibrary } from '../../application/library-query'
import { musicBrainzCatalog } from '../../infrastructure/catalog/musicbrainz-client'
import type {
  DiscographyArtist,
  DiscographyPage,
} from '../../application/discography-catalog'
import { DiscographyImportPanel } from '../catalog/DiscographyImportPanel'
import { useCatalogReview } from '../catalog/use-catalog-review'

export function ArtistPage({
  artistId,
  snapshot,
  repository,
  onBack,
  backLabel = 'Volver a biblioteca',
  onOpenAlbum,
  onBusyChange,
  onCommitted,
  onLinked,
  onImported,
}: {
  artistId: string
  snapshot: LocalSnapshot
  repository: TransactionalLocalRepository
  onBack: () => void
  backLabel?: string
  onOpenAlbum: (id: string) => void
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
  onLinked: () => void
  onImported: () => void
}) {
  const artist = snapshot.catalog.artists.find((row) => row.id === artistId)
  const albumIds = new Set(
    snapshot.catalog.albumArtists
      .filter((row) => row.artistId === artistId)
      .map((row) => row.albumId),
  )
  const albums = projectLibrary(snapshot)
    .filter((row) => albumIds.has(row.albumId))
    .toSorted(
      (a, b) =>
        (a.originalYear ?? 9999) - (b.originalYear ?? 9999) ||
        a.title.localeCompare(b.title),
    )
  const entryIds = new Set(albums.map((row) => row.id))
  const copies = snapshot.library.ownedItems.filter((row) =>
    entryIds.has(row.userAlbumId),
  )
  const wishes = snapshot.library.purchaseWishes.filter(
    (row) => entryIds.has(row.userAlbumId) && row.status === 'active',
  )
  const [query, setQuery] = useState(artist?.name ?? ''),
    [results, setResults] = useState<DiscographyArtist[]>([]),
    [chosen, setChosen] = useState<DiscographyArtist>()
  const [catalog, setCatalog] = useState<{
    artist: DiscographyArtist
    page: DiscographyPage
  }>()
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('')
  const controller = useRef<AbortController | null>(null)
  const {
    form: reviewFormRef,
    heading: reviewHeadingRef,
    retry: reviewRetryRef,
    ...review
  } = useCatalogReview({
    id: 'artist-link',
    repository,
    dirty: false,
    onBusyChange,
    onCommitted,
    onComplete: () => {
      setResults([])
      setChosen(undefined)
      setNotice('Artista vinculado. Ya puedes consultar su discografía.')
      onLinked()
    },
  })
  useEffect(() => () => controller.current?.abort(), [])
  async function request(action: (signal: AbortSignal) => Promise<void>) {
    if (controller.current || review.busy || review.pending) return
    const active = new AbortController()
    controller.current = active
    setBusy(true)
    review.setFailure('')
    try {
      await action(active.signal)
    } catch {
      if (!active.signal.aborted)
        review.setFailure(
          'No pudimos consultar el catálogo. Tu biblioteca sigue disponible; vuelve a intentar en unos momentos.',
        )
    } finally {
      if (controller.current === active) {
        controller.current = null
        setBusy(false)
      }
    }
  }
  function search() {
    void request(async (signal) => {
      const found = await musicBrainzCatalog.searchArtists(query, signal)
      if (!signal.aborted) {
        setResults(found)
        setNotice(
          found.length
            ? 'Revisa cuál corresponde al artista de tu biblioteca.'
            : 'No encontramos artistas con ese nombre.',
        )
      }
    })
  }
  function browse() {
    if (!artist?.musicBrainz) return
    const source = {
      id: artist.musicBrainz.id,
      name: artist.name,
      ...(artist.country ? { country: artist.country } : {}),
    }
    void request(async (signal) => {
      const page = await musicBrainzCatalog.browseAlbums(source.id, 0, signal)
      if (!signal.aborted) setCatalog({ artist: source, page })
    })
  }
  if (!artist)
    return (
      <section className="library-empty">
        <h2>Este artista no está en tu biblioteca</h2>
        <button type="button" className="action-button mt-4" onClick={onBack}>
          {backLabel}
        </button>
      </section>
    )
  return (
    <section
      className="artist-page"
      aria-label={`Biblioteca de ${artist.name}`}
    >
      <button
        type="button"
        className="text-button"
        disabled={review.busy || review.pending}
        onClick={onBack}
      >
        {backLabel}
      </button>
      <p className="mt-4 text-muted">
        {artist.country || 'Artista de tu biblioteca'}
      </p>
      <dl className="collection-counts">
        <div>
          <dt>Álbumes en biblioteca</dt>
          <dd>{albums.length}</dd>
        </div>
        <div>
          <dt>Copias registradas</dt>
          <dd>{copies.length}</dd>
        </div>
        <div>
          <dt>Deseos activos</dt>
          <dd>{wishes.length}</dd>
        </div>
      </dl>
      <h2 className="text-xl font-semibold">En tu biblioteca</h2>
      {albums.length ? (
        <ul className="artist-albums">
          {albums.map((row) => {
            const count = copies.filter(
              (item) => item.userAlbumId === row.id,
            ).length
            const desired = wishes.some((wish) => wish.userAlbumId === row.id)
            return (
              <li key={row.id}>
                <div>
                  <strong>{row.title}</strong>
                  <p className="text-sm text-muted">
                    {[
                      row.originalYear,
                      count
                        ? `${count} ${count === 1 ? 'ejemplar' : 'ejemplares'}`
                        : '',
                      desired ? 'En deseos' : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  className="action-button"
                  data-focus-key={`artist-album-${row.id}`}
                  onClick={(event) => {
                    event.currentTarget.focus()
                    onOpenAlbum(row.id)
                  }}
                >
                  Abrir {row.title}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 text-muted">
          Todavía no hay álbumes activos de este artista. Los retirados se
          conservan en su apartado.
        </p>
      )}
      <div className="artist-catalog-section">
        {!catalog ? (
          <>
            <h2 className="text-xl font-semibold">Discografía del catálogo</h2>
            <p className="mt-2 text-sm text-muted">
              Consulta MusicBrainz cuando quieras comparar o incorporar más
              discos. La biblioteca local se puede consultar sin conexión.
            </p>
          </>
        ) : null}
        {!musicBrainzCatalog.available ? (
          <p className="mt-4 text-muted">
            La búsqueda no está disponible en esta instalación.
          </p>
        ) : artist.musicBrainz ? (
          catalog ? (
            <DiscographyImportPanel
              key={artist.musicBrainz.id}
              initial={catalog}
              snapshot={snapshot}
              repository={repository}
              stayOpen
              onOpenAlbum={onOpenAlbum}
              onBusyChange={onBusyChange}
              onCommitted={onCommitted}
              onImported={onImported}
            />
          ) : (
            <button
              type="button"
              className="primary-button mt-4"
              disabled={busy || review.busy || review.pending}
              onClick={browse}
            >
              Consultar discografía
            </button>
          )
        ) : (
          <>
            <form
              className="artist-search-form mt-4"
              onSubmit={(event) => {
                event.preventDefault()
                search()
              }}
            >
              <label>
                <span className="field-label">
                  Buscar este artista en MusicBrainz
                </span>
                <input
                  type="search"
                  value={query}
                  maxLength={120}
                  onChange={(event) => setQuery(event.target.value)}
                  disabled={
                    review.busy || review.pending || Boolean(review.prepared)
                  }
                />
              </label>
              <button
                className="action-button"
                type="submit"
                disabled={
                  busy ||
                  review.busy ||
                  review.pending ||
                  !query.trim() ||
                  Boolean(review.prepared)
                }
              >
                Buscar artista del catálogo
              </button>
            </form>
            {results.length && !review.prepared ? (
              <ul className="artist-candidates">
                {results.map((row) => (
                  <li key={row.id}>
                    <div>
                      <strong>{row.name}</strong>
                      <p className="text-sm text-muted">
                        {[row.country, row.description]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="action-button"
                      disabled={busy || review.busy || review.pending}
                      onClick={() => {
                        setChosen(row)
                        void review.preview(() =>
                          review.service.prepareArtist(artist.id, row),
                        )
                      }}
                    >
                      Revisar vínculo con {row.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
        {review.prepared && !review.pending ? (
          <form
            ref={reviewFormRef}
            className="catalog-selection"
            onSubmit={(event) => void review.confirm(event)}
          >
            <h3
              ref={reviewHeadingRef}
              tabIndex={-1}
              className="text-lg font-semibold"
            >
              Vincular {artist.name} con {chosen?.name}
            </h3>
            <p className="mt-3">
              Comprueba que se trata de la misma banda o persona. Se conservarán
              el nombre local, los álbumes y sus datos.
            </p>
            <div className="form-actions mt-4">
              <button
                type="submit"
                className="primary-button"
                disabled={review.busy}
              >
                Confirmar vínculo de artista
              </button>
              <button
                type="button"
                className="action-button"
                disabled={review.busy}
                onClick={review.clear}
              >
                Cancelar vínculo
              </button>
            </div>
          </form>
        ) : null}
        {busy ? (
          <p className="mt-3" role="status">
            Consultando catálogo…{' '}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                controller.current?.abort()
                controller.current = null
                setBusy(false)
              }}
            >
              Cancelar consulta
            </button>
          </p>
        ) : null}
        {review.failure ? (
          <p role="alert" className="field-error">
            {review.failure}
          </p>
        ) : null}
        {review.pending ? (
          <button
            type="button"
            ref={reviewRetryRef}
            className="action-button mt-3"
            disabled={review.busy}
            onClick={() => void review.retryRead()}
          >
            Reintentar lectura del artista guardado
          </button>
        ) : null}
        {notice ? (
          <p role="status" className="mt-3">
            {notice}
          </p>
        ) : null}
      </div>
    </section>
  )
}
