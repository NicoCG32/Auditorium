import { useEffect, useRef, useState } from 'react'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../../domain/repositories/local-repository'
import {
  albumGroupId,
  possibleEditions,
} from '../../application/edition-imports'
import {
  catalogCoverUrl,
  editionFormat,
  editionPosition,
  type EditionCatalog,
  type EditionDetails,
  type EditionSummary,
} from '../../application/edition-catalog'
import { musicBrainzCatalog } from '../../infrastructure/catalog/musicbrainz-client'
import { catalogNameKey } from '../../application/catalog-names'
import { useCatalogReview } from './use-catalog-review'

const formatNames = {
  cd: 'CD',
  vinyl: 'Vinilo',
  cassette: 'Casete',
  digital: 'Digital',
  other: 'Otro',
} as const
export function AlbumCatalogDetailsPanel({
  albumId,
  snapshot,
  repository,
  onBusyChange,
  onCommitted,
  onArtist,
  client = musicBrainzCatalog,
}: {
  albumId: string
  snapshot: LocalSnapshot
  repository: TransactionalLocalRepository
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
  onArtist: (id: string) => void
  client?: EditionCatalog
}) {
  const album = snapshot.catalog.albums.find((row) => row.id === albumId)!
  const group = albumGroupId(album)
  const [editions, setEditions] = useState<EditionSummary[]>([]),
    [nextOffset, setNextOffset] = useState<number>(),
    [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<EditionDetails>(),
    [editionChoice, setEditionChoice] = useState('new')
  const [format, setFormat] = useState<keyof typeof formatNames>('cd'),
    [includeTracks, setIncludeTracks] = useState(true),
    [tracks, setTracks] = useState<Record<string, string>>({})
  const [cover, setCover] = useState<'album' | 'edition'>(),
    [coverReady, setCoverReady] = useState(false),
    [useCover, setUseCover] = useState(false),
    [coverFailed, setCoverFailed] = useState(false)
  const [coverAttempt, setCoverAttempt] = useState(0)
  const expectedCover = useRef<string | undefined>(undefined)
  const [networkBusy, setNetworkBusy] = useState(false),
    [notice, setNotice] = useState('')
  const controller = useRef<AbortController | null>(null)
  const selectedHeadingRef = useRef<HTMLHeadingElement>(null)
  const {
    form: reviewFormRef,
    heading: reviewHeadingRef,
    retry: reviewRetryRef,
    ...operation
  } = useCatalogReview({
    id: `catalog-details:${albumId}`,
    repository,
    dirty: Boolean(selected || useCover),
    onBusyChange,
    onCommitted,
    onComplete: () => {
      setSelected(undefined)
      setUseCover(false)
      setTracks({})
      setCover(undefined)
      setCoverReady(false)
      expectedCover.current = undefined
      setNotice(
        'Datos del catálogo guardados. Tus copias y notas se conservan.',
      )
    },
  })
  const local = snapshot.catalog.releases.filter(
    (row) => row.albumId === albumId,
  )
  const target = local.find((row) => row.id === editionChoice)
  const hasList = Boolean(
    target &&
    snapshot.catalog.releaseTracks.some((row) => row.releaseId === target.id),
  )
  const coverUrl =
    cover && group
      ? catalogCoverUrl(
          cover === 'album' ? 'release-group' : 'release',
          cover === 'album' ? group : selected!.id,
        )
      : undefined
  const blocked = operation.busy || operation.pending
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (selected && !operation.prepared && !operation.pending)
      selectedHeadingRef.current?.focus()
  }, [selected, operation.prepared, operation.pending])
  async function request(action: (signal: AbortSignal) => Promise<void>) {
    if (controller.current || blocked) return
    const active = new AbortController()
    controller.current = active
    setNetworkBusy(true)
    operation.setFailure('')
    try {
      await action(active.signal)
    } catch {
      if (!active.signal.aborted)
        operation.setFailure(
          'No pudimos consultar las ediciones. Vuelve a intentar; tu biblioteca se conserva.',
        )
    } finally {
      if (controller.current === active) {
        controller.current = null
        setNetworkBusy(false)
      }
    }
  }
  function browse(offset = 0) {
    if (!group) return
    void request(async (signal) => {
      const page = await client.browseEditions(group, offset, signal)
      if (signal.aborted) return
      setEditions((rows) => [
        ...new Map(
          [...(offset ? rows : []), ...page.editions].map((row) => [
            row.id,
            row,
          ]),
        ).values(),
      ])
      setTotal(page.total)
      setNextOffset(page.nextOffset)
      setNotice(
        page.total
          ? ''
          : 'No encontramos ediciones de esta obra en el catálogo.',
      )
    })
  }
  function choose(id: string) {
    void request(async (signal) => {
      const result = await client.edition(id, signal)
      if (signal.aborted) return
      if (result.groupId !== group) throw new Error('wrong_group')
      setSelected(result)
      setFormat(editionFormat(result.formats))
      setIncludeTracks(result.completeTracks)
      setTracks({})
      setEditionChoice(possibleEditions(local, result).length ? '' : 'new')
      setCover(undefined)
      setUseCover(false)
      setCoverReady(false)
      setCoverFailed(false)
      operation.clear()
    })
  }
  function previewCover(kind: 'album' | 'edition') {
    if (!group || (kind === 'edition' && !selected)) return
    expectedCover.current = catalogCoverUrl(
      kind === 'album' ? 'release-group' : 'release',
      kind === 'album' ? group : selected!.id,
    )
    operation.clear()
    setCover(kind)
    setCoverReady(false)
    setUseCover(false)
    setCoverFailed(false)
    setCoverAttempt((value) => value + 1)
  }
  return (
    <section
      className="catalog-details-panel"
      aria-label="Completar desde el catálogo"
    >
      <h3
        ref={operation.prepared ? undefined : reviewHeadingRef}
        tabIndex={-1}
        className="text-xl font-semibold"
      >
        Completar desde el catálogo
      </h3>
      <p className="mt-2 text-sm text-muted">
        Puedes añadir una edición con sus pistas o elegir una portada. Guardar
        estos datos no registra una compra.
      </p>
      {!group ? (
        <p className="mt-4 text-sm text-muted">
          Este álbum todavía no tiene una referencia MusicBrainz. Puedes buscar
          su discografía desde el artista o seguir con el registro manual.
        </p>
      ) : !client.available ? (
        <p className="mt-4 text-sm text-muted">
          La consulta de catálogo no está disponible en esta instalación. Puedes
          completar los datos manualmente.
        </p>
      ) : (
        <>
          <div className="form-actions mt-4">
            <button
              type="button"
              className="action-button"
              disabled={blocked || networkBusy || Boolean(selected)}
              onClick={() => browse()}
            >
              Buscar ediciones y pistas
            </button>
            <button
              type="button"
              className="text-button"
              disabled={blocked || networkBusy || Boolean(selected)}
              onClick={() => previewCover('album')}
            >
              Ver portada del álbum
            </button>
          </div>
          {editions.length && !selected ? (
            <>
              <p className="mt-4 text-sm" role="status">
                {editions.length} de {total} ediciones cargadas.
              </p>
              <ul className="catalog-editions">
                {editions.map((row) => {
                  const linked = local.some(
                    (release) => release.musicBrainz?.id === row.id,
                  )
                  return (
                    <li key={row.id}>
                      <div>
                        <strong>{row.description || row.title}</strong>
                        <p className="text-sm text-muted">
                          {[
                            row.date,
                            row.country,
                            row.formats.join(' + '),
                            row.label,
                            row.catalogNumber,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        <p className="text-sm text-muted">
                          {row.trackCount} pistas
                          {linked ? ' · Edición ya guardada' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="action-button"
                        disabled={
                          blocked || networkBusy || linked || Boolean(selected)
                        }
                        onClick={() => choose(row.id)}
                      >
                        Revisar edición
                      </button>
                    </li>
                  )
                })}
              </ul>
              {nextOffset !== undefined ? (
                <button
                  type="button"
                  className="action-button"
                  disabled={blocked || networkBusy || Boolean(selected)}
                  onClick={() => browse(nextOffset)}
                >
                  Cargar más ediciones
                </button>
              ) : null}
            </>
          ) : null}
          {selected && !operation.prepared && !operation.pending ? (
            <div className="catalog-selection">
              <h4
                ref={selectedHeadingRef}
                tabIndex={-1}
                className="text-lg font-semibold"
              >
                Revisar {selected.description || selected.title}
              </h4>
              <p className="mt-2 text-sm text-muted">
                {[
                  selected.date,
                  selected.country,
                  selected.label,
                  selected.catalogNumber,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <div className="form-grid mt-4">
                <label>
                  <span className="field-label">Guardar edición</span>
                  <select
                    value={editionChoice}
                    disabled={blocked}
                    onChange={(event) => setEditionChoice(event.target.value)}
                  >
                    <option value="" disabled>
                      Revisa la posible coincidencia
                    </option>
                    <option value="new">Crear una edición nueva</option>
                    {local
                      .filter(
                        (row) =>
                          !row.musicBrainz ||
                          row.musicBrainz.id === selected.id,
                      )
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          Vincular{' '}
                          {row.editionLabel ||
                            row.releaseTitleOverride ||
                            'edición'}{' '}
                          · {formatNames[row.format]}
                          {row.releaseYear ? ` · ${row.releaseYear}` : ''}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Formato de la edición</span>
                  <select
                    value={format}
                    disabled={blocked}
                    onChange={(event) =>
                      setFormat(event.target.value as typeof format)
                    }
                  >
                    {Object.entries(formatNames).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={includeTracks && !hasList}
                  disabled={blocked || !selected.completeTracks || hasList}
                  onChange={(event) => setIncludeTracks(event.target.checked)}
                />
                <span>Incluir la lista de pistas</span>
              </label>
              {hasList ? (
                <p className="text-sm text-muted">
                  La edición local ya tiene una lista. Se conservará junto con
                  sus datos y notas.
                </p>
              ) : !selected.completeTracks ? (
                <p className="text-sm text-muted">
                  La fuente incluye pistas incompletas o posiciones que
                  requieren revisión manual. Puedes guardar la edición sin
                  importar la lista.
                </p>
              ) : null}
              {includeTracks && !hasList ? (
                <ol className="catalog-track-preview">
                  {selected.tracks.map((track) => (
                    <li key={editionPosition(track)}>
                      {track.discNumber}.{track.trackNumber} · {track.title}
                    </li>
                  ))}
                </ol>
              ) : null}
              {includeTracks &&
              !hasList &&
              selected.tracks.some((row) =>
                snapshot.catalog.tracks.some(
                  (track) =>
                    track.albumId === albumId &&
                    !track.musicBrainz &&
                    catalogNameKey(track.title) === catalogNameKey(row.title),
                ),
              ) ? (
                <details className="optional-fields">
                  <summary>Reutilizar pistas que ya tienes (opcional)</summary>
                  <p className="optional-help">
                    El mismo título puede corresponder a otra grabación. Elige
                    sólo las pistas que reconozcas.
                  </p>
                  {selected.tracks.map((row) => {
                    const candidates = snapshot.catalog.tracks.filter(
                      (track) =>
                        track.albumId === albumId &&
                        !track.musicBrainz &&
                        catalogNameKey(track.title) ===
                          catalogNameKey(row.title),
                    )
                    return candidates.length ? (
                      <label key={editionPosition(row)} className="mt-3 block">
                        <span className="field-label">
                          Pista {row.discNumber}.{row.trackNumber}: {row.title}
                        </span>
                        <select
                          value={tracks[editionPosition(row)] ?? ''}
                          onChange={(event) =>
                            setTracks((previous) => {
                              const next = { ...previous }
                              if (event.target.value)
                                next[editionPosition(row)] = event.target.value
                              else delete next[editionPosition(row)]
                              return next
                            })
                          }
                        >
                          <option value="">Guardar una pista distinta</option>
                          {candidates.map((track) => (
                            <option key={track.id} value={track.id}>
                              {track.title}
                              {track.versionLabel
                                ? ` · ${track.versionLabel}`
                                : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null
                  })}
                </details>
              ) : null}
              <button
                type="button"
                className="text-button mt-4"
                disabled={blocked}
                onClick={() => previewCover('edition')}
              >
                Ver portada de esta edición
              </button>
              <div className="form-actions mt-4">
                <button
                  type="button"
                  className="primary-button"
                  disabled={blocked || !editionChoice || networkBusy}
                  onClick={() =>
                    void operation.preview(() =>
                      operation.service.prepare(albumId, selected, {
                        edition: editionChoice,
                        format,
                        includeTracks: includeTracks && !hasList,
                        cover: useCover && coverReady && cover === 'edition',
                        tracks,
                      }),
                    )
                  }
                >
                  Revisar datos para guardar
                </button>
                <button
                  type="button"
                  className="action-button"
                  disabled={blocked}
                  onClick={() => {
                    setSelected(undefined)
                    setCover(undefined)
                    setUseCover(false)
                  }}
                >
                  Cancelar selección
                </button>
              </div>
            </div>
          ) : null}
          {coverUrl && !operation.prepared && !operation.pending ? (
            <div className="catalog-cover-preview">
              <p className="text-sm text-muted">
                La vista previa consulta Cover Art Archive e Internet Archive.
                La portada actual se conserva hasta que confirmes una
                sustitución.
              </p>
              <img
                key={`${coverUrl}:${coverAttempt}`}
                src={coverUrl}
                alt="Portada propuesta por el catálogo"
                referrerPolicy="no-referrer"
                onLoad={(event) => {
                  if (
                    event.currentTarget.getAttribute('src') ===
                    expectedCover.current
                  )
                    setCoverReady(true)
                }}
                onError={(event) => {
                  if (
                    event.currentTarget.getAttribute('src') !==
                    expectedCover.current
                  )
                    return
                  setCoverReady(false)
                  setCoverFailed(true)
                  setUseCover(false)
                }}
              />
              {coverFailed ? (
                <p role="status">
                  No hay una portada disponible. Puedes continuar con los demás
                  datos.
                </p>
              ) : coverReady ? (
                cover === 'edition' && selected ? (
                  <label className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={useCover}
                      onChange={(event) => setUseCover(event.target.checked)}
                    />
                    <span>
                      {album.coverUrl || album.coverImage
                        ? 'Sustituir la portada actual por esta'
                        : 'Usar esta portada al guardar la edición'}
                    </span>
                  </label>
                ) : (
                  <button
                    type="button"
                    className="action-button"
                    disabled={blocked}
                    onClick={() =>
                      void operation.preview(() =>
                        operation.service.prepareCover(albumId),
                      )
                    }
                  >
                    {album.coverUrl || album.coverImage
                      ? 'Revisar sustitución de portada'
                      : 'Revisar esta portada'}
                  </button>
                )
              ) : (
                <p role="status">Cargando portada…</p>
              )}
            </div>
          ) : null}
          {operation.prepared && !operation.pending ? (
            <form
              ref={reviewFormRef}
              className="catalog-selection"
              onSubmit={(event) => void operation.confirm(event)}
            >
              <h4
                ref={reviewHeadingRef}
                tabIndex={-1}
                className="text-lg font-semibold"
              >
                Confirma los datos del catálogo
              </h4>
              <p className="mt-3">
                {operation.prepared.releaseId
                  ? `${operation.prepared.added ? 'Se añadirá' : 'Se vinculará'} una edición. ${operation.prepared.tracksAdded} ${operation.prepared.tracksAdded === 1 ? 'pista nueva' : 'pistas nuevas'}.`
                  : 'Se guardará la portada elegida.'}
              </p>
              <p className="mt-2 text-sm text-muted">
                {operation.prepared.coverChanged
                  ? 'La portada actual se sustituirá. '
                  : ''}
                Tus listas anteriores, notas, archivos y adquisiciones se
                conservan.
              </p>
              <div className="form-actions mt-4">
                <button
                  className="primary-button"
                  disabled={blocked}
                  type="submit"
                >
                  Confirmar datos del catálogo
                </button>
                <button
                  className="action-button"
                  type="button"
                  disabled={blocked}
                  onClick={operation.clear}
                >
                  Volver a revisar
                </button>
              </div>
            </form>
          ) : null}
        </>
      )}
      {!group
        ? snapshot.catalog.albumArtists
            .filter((row) => row.albumId === albumId && row.role === 'primary')
            .map((row) => (
              <button
                key={row.artistId}
                type="button"
                className="text-button mt-3 mr-4"
                onClick={() => onArtist(row.artistId)}
              >
                Ver artista{' '}
                {
                  snapshot.catalog.artists.find(
                    (artist) => artist.id === row.artistId,
                  )?.name
                }
              </button>
            ))
        : null}
      {networkBusy ? (
        <p role="status" className="mt-3">
          Consultando ediciones…{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              controller.current?.abort()
              controller.current = null
              setNetworkBusy(false)
            }}
          >
            Cancelar consulta
          </button>
        </p>
      ) : null}
      {operation.failure ? (
        <p role="alert" className="field-error">
          {operation.failure}
        </p>
      ) : null}
      {operation.pending ? (
        <button
          ref={reviewRetryRef}
          type="button"
          className="action-button mt-3"
          disabled={operation.busy}
          onClick={() => void operation.retryRead()}
        >
          Reintentar lectura del catálogo guardado
        </button>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3">
          {notice}
        </p>
      ) : null}
    </section>
  )
}
