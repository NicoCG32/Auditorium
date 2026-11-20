import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../../domain/repositories/local-repository'
import { classificationLabel } from '../../domain/catalog/classification'
import {
  DiscographyError,
  discographyClassification,
  filterDiscography,
  unmappedDiscographyTypes,
  type DiscographyAlbum,
  type DiscographyArtist,
  type DiscographyCatalog,
  type DiscographyFilter,
  type DiscographyPage,
} from '../../application/discography-catalog'
import {
  DiscographyImports,
  emptyDiscographyChoices,
  reviewDiscography,
  type DiscographyChoices,
  type PreparedDiscography,
} from '../../application/discography-imports'
import { musicBrainzCatalog } from '../../infrastructure/catalog/musicbrainz-client'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { useDraftGuard } from '../navigation/draft-context'

export function DiscographyImportPanel({
  snapshot,
  repository,
  onBusyChange,
  onCommitted,
  onImported,
  client = musicBrainzCatalog,
  initial,
  stayOpen = false,
  onOpenAlbum,
}: {
  snapshot: LocalSnapshot
  repository: TransactionalLocalRepository
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
  onImported: (result: { added: number; linked: number }) => void
  client?: DiscographyCatalog
  initial?: { artist: DiscographyArtist; page: DiscographyPage }
  stayOpen?: boolean
  onOpenAlbum?: (entryId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [artists, setArtists] = useState<DiscographyArtist[]>([])
  const [artist, setArtist] = useState<DiscographyArtist | undefined>(
    initial?.artist,
  )
  const [albums, setAlbums] = useState<DiscographyAlbum[]>(
    initial?.page.albums ?? [],
  )
  const [total, setTotal] = useState(initial?.page.total ?? 0)
  const [nextOffset, setNextOffset] = useState<number | undefined>(
    initial?.page.nextOffset,
  )
  const [filter, setFilter] = useState<DiscographyFilter>('studio')
  const [selected, setSelected] = useState<string[]>([])
  const [choices, setChoices] = useState<DiscographyChoices>(
    emptyDiscographyChoices,
  )
  const [networkBusy, setNetworkBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const [prepared, setPrepared] = useState<PreparedDiscography>()
  const [committed, setCommitted] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const locked = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const imports = useMemo(
    () => new DiscographyImports(repository),
    [repository],
  )
  const picked = useMemo(
    () => albums.filter((album) => selected.includes(album.id)),
    [albums, selected],
  )
  const review = useMemo(
    () =>
      artist ? reviewDiscography(snapshot, artist, picked, choices) : undefined,
    [snapshot, artist, picked, choices],
  )
  const allMatches = useMemo(
    () => (artist ? reviewDiscography(snapshot, artist, albums).albums : []),
    [snapshot, artist, albums],
  )
  const linkedIds = new Set(
    allMatches.filter((row) => row.linked).map((row) => row.source.id),
  )
  const credited = artist
    ? albums.filter((album) =>
        album.artists.some((credit) => credit.id === artist.id),
      )
    : []
  const visible = filterDiscography(credited, filter)
  const blocked = busy || committed
  useDraftGuard({
    id: 'discography',
    label: 'Selección de discografía',
    dirty: selected.length > 0 && !committed,
    busy,
    pendingRead: committed,
    form,
    focus: () =>
      (prepared ? reviewHeading.current : resultHeading.current)?.focus(),
  })
  useEffect(() => {
    input.current?.focus()
    return () => {
      controller.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (prepared) reviewHeading.current?.focus()
  }, [prepared])

  function cancelRequest() {
    generation.current++
    controller.current?.abort()
    controller.current = null
    setNetworkBusy(false)
    setNotice('Consulta cancelada. Tu biblioteca se conserva.')
  }
  async function request(action: (signal: AbortSignal) => Promise<void>) {
    if (controller.current || blocked) return
    const active = new AbortController(),
      current = ++generation.current
    controller.current = active
    setNetworkBusy(true)
    setFailure('')
    setNotice('Consultando el catálogo musical…')
    try {
      await action(active.signal)
    } catch (cause) {
      if (current === generation.current && !active.signal.aborted) {
        setFailure(
          cause instanceof DiscographyError
            ? cause.message
            : 'No pudimos completar la consulta. Vuelve a intentar; tu selección y tu biblioteca se conservan.',
        )
        setNotice('')
      }
    } finally {
      if (current === generation.current) {
        controller.current = null
        setNetworkBusy(false)
      }
    }
  }
  function search(event: FormEvent) {
    event.preventDefault()
    if (selected.length || prepared) return
    void request(async (signal) => {
      const results = await client.searchArtists(query, signal)
      if (signal.aborted) return
      setArtist(undefined)
      setAlbums([])
      setArtists(results)
      setTotal(0)
      setNextOffset(undefined)
      setNotice(
        results.length
          ? `${results.length} ${results.length === 1 ? 'artista' : 'artistas'} para revisar. Confirma la banda o artista correcto.`
          : 'No encontramos artistas. Prueba otro nombre o usa el registro manual.',
      )
    })
  }
  function browse(chosen: DiscographyArtist, offset = 0) {
    void request(async (signal) => {
      const page = await client.browseAlbums(chosen.id, offset, signal)
      if (signal.aborted) return
      setArtist(chosen)
      setArtists([])
      setAlbums((previous) => [
        ...new Map(
          [...(offset ? previous : []), ...page.albums].map((album) => [
            album.id,
            album,
          ]),
        ).values(),
      ])
      setTotal(page.total)
      setNextOffset(page.nextOffset)
      setNotice(
        page.total
          ? 'Discografía disponible. Revisa los filtros y selecciona las obras que quieras incorporar.'
          : 'No encontramos obras para este artista. Puedes añadirlas manualmente.',
      )
      requestAnimationFrame(() => resultHeading.current?.focus())
    })
  }
  function toggle(id: string) {
    setPrepared(undefined)
    setSelected((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : previous.length < 500
          ? [...previous, id]
          : previous,
    )
  }
  function choose(kind: 'artists' | 'albums', id: string, value: string) {
    setPrepared(undefined)
    setChoices((previous) => ({
      ...previous,
      [kind]: { ...previous[kind], [id]: value },
    }))
  }
  async function prepare() {
    if (
      locked.current ||
      !artist ||
      !picked.length ||
      review?.unresolved ||
      networkBusy ||
      committed
    )
      return
    locked.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    try {
      setPrepared(await imports.prepare(artist, picked, choices))
    } catch (cause) {
      setFailure(
        cause instanceof Error
          ? cause.message
          : 'No pudimos preparar la importación.',
      )
    } finally {
      locked.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  async function read() {
    try {
      await onCommitted()
      onBusyChange(false)
      onImported({ added: prepared!.added, linked: prepared!.linked })
      if (stayOpen) {
        setCommitted(false)
        setPrepared(undefined)
        setSelected([])
        setChoices(emptyDiscographyChoices)
        setNotice(
          'Selección incorporada. Puedes seguir consultando la discografía.',
        )
      }
    } catch {
      setFailure(
        'La importación se guardó, pero no pudimos actualizar la biblioteca. Reintenta sólo la lectura para continuar.',
      )
    }
  }
  async function confirm() {
    if (locked.current || !prepared || committed) return
    locked.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    try {
      await imports.confirm(prepared)
    } catch (cause) {
      setFailure(
        cause instanceof LocalStorageError && cause.code === 'quota_exceeded'
          ? 'No hay espacio para importar. No se cambió ningún dato; libera espacio y vuelve a revisar.'
          : cause instanceof Error
            ? cause.message
            : 'No pudimos importar. La biblioteca se conserva.',
      )
      setPrepared(undefined)
      locked.current = false
      setBusy(false)
      onBusyChange(false)
      return
    }
    setCommitted(true)
    await read()
    locked.current = false
    setBusy(false)
  }
  async function retryRead() {
    if (locked.current || !committed) return
    locked.current = true
    setBusy(true)
    await read()
    locked.current = false
    setBusy(false)
  }
  if (!client.available)
    return (
      <section className="catalog-search-panel">
        <h2 className="text-xl font-semibold">Buscar discografía</h2>
        <p className="mt-3 text-muted">
          La búsqueda musical no está disponible en esta instalación. Puedes
          añadir álbumes manualmente o incorporar un catálogo JSON.
        </p>
      </section>
    )
  return (
    <section
      className="catalog-search-panel"
      aria-labelledby="discography-title"
    >
      <h2 id="discography-title" className="text-xl font-semibold">
        {initial
          ? 'Comparar con tu biblioteca'
          : 'Busca una banda y elige sus discos'}
      </h2>
      <details className="catalog-source-help">
        <summary>Sobre la búsqueda en MusicBrainz</summary>
        <p className="mt-2 mb-5 text-sm text-muted">
          Se consulta el nombre del artista para encontrar sus discos. Tus notas
          y valoraciones no se envían.
        </p>
      </details>
      {!initial ? (
        <form className="artist-search-form" onSubmit={search}>
          <label className="min-w-0">
            <span className="field-label">Banda o artista</span>
            <input
              ref={input}
              type="search"
              required
              maxLength={120}
              value={query}
              placeholder="Opeth, Iron Maiden, Pink Floyd…"
              disabled={
                blocked ||
                networkBusy ||
                selected.length > 0 ||
                Boolean(prepared)
              }
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={
              blocked ||
              networkBusy ||
              !query.trim() ||
              selected.length > 0 ||
              Boolean(prepared)
            }
          >
            Buscar artista
          </button>
        </form>
      ) : null}
      {networkBusy ? (
        <button
          type="button"
          className="text-button mt-3"
          onClick={cancelRequest}
        >
          Cancelar consulta
        </button>
      ) : null}
      <p role="status" className="mt-4 text-sm text-muted">
        {notice}
      </p>
      {failure ? (
        <div>
          <p role="alert" className="field-error mt-4">
            {failure}
          </p>
          {artist && !committed ? (
            <button
              type="button"
              className="text-button"
              disabled={blocked || networkBusy}
              onClick={() => {
                void onCommitted()
                  .then(() => {
                    setPrepared(undefined)
                    setFailure('')
                    setNotice(
                      'Coincidencias actualizadas. Revisa tu selección.',
                    )
                  })
                  .catch(() =>
                    setFailure(
                      'No pudimos actualizar las coincidencias. Vuelve a intentar.',
                    ),
                  )
              }}
            >
              Actualizar coincidencias
            </button>
          ) : null}
        </div>
      ) : null}
      {artists.length ? (
        <ul className="artist-candidates" aria-label="Artistas encontrados">
          {artists.map((row) => (
            <li key={row.id}>
              <div>
                <h3 className="font-semibold">{row.name}</h3>
                <p className="text-sm text-muted">
                  {[row.country, row.description].filter(Boolean).join(' · ') ||
                    'Sin descripción disponible'}
                </p>
              </div>
              <button
                type="button"
                className="action-button"
                disabled={blocked || networkBusy}
                onClick={() => browse(row)}
              >
                Ver discografía de {row.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {artist ? (
        <>
          <div className="discography-heading mt-6">
            <div>
              <h3
                ref={resultHeading}
                tabIndex={-1}
                className="text-2xl font-semibold"
              >
                Discografía de {artist.name}
              </h3>
              <p className="mt-2 text-sm text-muted">
                Se muestran obras acreditadas al artista. El catálogo puede
                estar incompleto.
              </p>
            </div>
            <a
              className="text-button"
              href={`https://musicbrainz.org/artist/${artist.id}`}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Ver fuente
            </a>
          </div>
          <form
            ref={form}
            onSubmit={(event) => {
              event.preventDefault()
              void (prepared ? confirm() : prepare())
            }}
          >
            <fieldset disabled={blocked || Boolean(prepared)}>
              <div className="discography-toolbar">
                <label>
                  <span id="discography-filter-label" className="field-label">
                    Mostrar
                  </span>
                  <select
                    aria-labelledby="discography-filter-label"
                    value={filter}
                    onChange={(event) =>
                      setFilter(event.target.value as DiscographyFilter)
                    }
                  >
                    <option value="studio">Álbumes de estudio</option>
                    <option value="all">Todas las obras</option>
                    <option value="ep">EP</option>
                    <option value="single">Singles</option>
                    <option value="live">En vivo</option>
                    <option value="compilation">Recopilaciones</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="action-button"
                  onClick={() => {
                    const ids = [
                      ...new Set([
                        ...selected,
                        ...visible
                          .filter((row) => !linkedIds.has(row.id))
                          .map((row) => row.id),
                      ]),
                    ]
                    if (ids.length > 500)
                      setFailure(
                        'Puedes seleccionar hasta 500 obras por importación.',
                      )
                    else {
                      setSelected(ids)
                      setPrepared(undefined)
                    }
                  }}
                >
                  Seleccionar visibles
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={!selected.length}
                  onClick={() => {
                    setSelected([])
                    setChoices(emptyDiscographyChoices)
                    setFailure('')
                  }}
                >
                  Limpiar selección
                </button>
              </div>
              <p className="my-4 text-sm text-muted">
                {visible.length} obras en este filtro · {albums.length} de{' '}
                {total} referencias cargadas · {selected.length} seleccionadas
                {selected.some((id) => !visible.some((row) => row.id === id))
                  ? ' (incluye otros filtros)'
                  : ''}
              </p>
              {visible.length ? (
                <ul
                  className="discography-albums"
                  aria-label="Obras disponibles"
                >
                  {visible.map((album) => {
                    const match = allMatches.find(
                      (row) => row.source.id === album.id,
                    )
                    const entries = match?.linked
                      ? snapshot.library.userAlbums.filter(
                          (entry) => entry.albumId === match.linked!.id,
                        )
                      : []
                    const active = entries.some((entry) => !entry.deletedAt)
                    const activeEntry = entries.find(
                      (entry) => !entry.deletedAt,
                    )
                    const copies = activeEntry
                      ? snapshot.library.ownedItems.filter(
                          (row) => row.userAlbumId === activeEntry.id,
                        ).length
                      : 0
                    const wished =
                      activeEntry &&
                      snapshot.library.purchaseWishes.some(
                        (row) =>
                          row.userAlbumId === activeEntry.id &&
                          row.status === 'active',
                      )
                    const retired =
                      !active && entries.some((entry) => entry.deletedAt)
                    return (
                      <li key={album.id}>
                        <label className="discography-album-choice">
                          <input
                            type="checkbox"
                            checked={selected.includes(album.id)}
                            disabled={
                              linkedIds.has(album.id) ||
                              (selected.length >= 500 &&
                                !selected.includes(album.id))
                            }
                            onChange={() => toggle(album.id)}
                          />
                          <span>
                            <strong>{album.title}</strong>
                            <span className="discography-album-meta">
                              {album.firstReleaseDate?.slice(0, 4) ||
                                'Año sin registrar'}{' '}
                              ·{' '}
                              {classificationLabel(
                                discographyClassification(album),
                              )}
                              {unmappedDiscographyTypes(album).length
                                ? ` · Fuente: ${unmappedDiscographyTypes(album).join(' · ')}`
                                : ''}
                            </span>
                            <span className="discography-album-meta">
                              {album.artists
                                .map((credit) => credit.name)
                                .join(' · ')}
                            </span>
                          </span>
                        </label>
                        <span className="discography-state">
                          {match?.linked
                            ? retired
                              ? 'Retirado · se conserva'
                              : active
                                ? 'Ya incorporado'
                                : 'En catálogo'
                            : match?.candidates.length
                              ? 'Revisar coincidencia'
                              : 'Nuevo'}
                        </span>
                        {initial && activeEntry ? (
                          <div className="discography-library-state">
                            {copies ? (
                              <span>
                                {copies}{' '}
                                {copies === 1 ? 'ejemplar' : 'ejemplares'}
                              </span>
                            ) : null}
                            {wished ? <span>En deseos</span> : null}
                            {onOpenAlbum ? (
                              <button
                                type="button"
                                className="text-button"
                                disabled={blocked}
                                onClick={() => onOpenAlbum(activeEntry.id)}
                              >
                                Abrir {album.title}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="library-empty">
                  No hay obras en este filtro. Prueba «Todas las obras».
                </p>
              )}
              {nextOffset !== undefined ? (
                <button
                  type="button"
                  className="action-button mt-4"
                  disabled={networkBusy}
                  onClick={() => browse(artist, nextOffset)}
                >
                  Cargar más obras
                </button>
              ) : null}
              {review?.artists.some(
                (row) => !row.linked && row.candidates.length,
              ) ||
              review?.albums.some(
                (row) => !row.linked && row.candidates.length,
              ) ? (
                <section
                  className="discography-matches mt-6"
                  aria-labelledby="matches-title"
                >
                  <h3 id="matches-title" className="text-lg font-semibold">
                    Revisa las coincidencias
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    Un nombre parecido no demuestra que sea el mismo artista o
                    álbum. Vincular conserva los datos y la experiencia
                    existentes.
                  </p>
                  {review.artists
                    .filter((row) => !row.linked && row.candidates.length)
                    .map((row) => (
                      <label key={row.source.id}>
                        <span className="field-label">
                          Artista: {row.source.name}
                        </span>
                        <select
                          value={choices.artists[row.source.id] ?? ''}
                          onChange={(event) =>
                            choose('artists', row.source.id, event.target.value)
                          }
                        >
                          <option value="">Elige una opción</option>
                          <option value="new">
                            Es otro artista con el mismo nombre
                          </option>
                          {row.candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              Vincular con {candidate.name}
                              {candidate.country
                                ? ` (${candidate.country})`
                                : ''}{' '}
                              · {candidate.id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  {review.albums
                    .filter((row) => !row.linked && row.candidates.length)
                    .map((row) => (
                      <label key={row.source.id}>
                        <span className="field-label">
                          Álbum: {row.source.title}
                        </span>
                        <select
                          value={choices.albums[row.source.id] ?? ''}
                          onChange={(event) =>
                            choose('albums', row.source.id, event.target.value)
                          }
                        >
                          <option value="">Elige una opción</option>
                          <option value="skip">Omitir esta obra</option>
                          <option
                            value="new"
                            disabled={row.candidates.some(
                              (candidate) =>
                                candidate.musicBrainz?.id === row.source.id ||
                                candidate.catalogReference
                                  ?.musicBrainzReleaseGroupId === row.source.id,
                            )}
                          >
                            Incorporar como obra distinta
                          </option>
                          {row.candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              Vincular con {candidate.title}
                              {candidate.originalYear
                                ? ` (${candidate.originalYear})`
                                : ''}{' '}
                              · {candidate.id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                </section>
              ) : null}
            </fieldset>
            {selected.length && !prepared ? (
              <div className="discography-selection mt-6">
                <p>
                  {selected.length} obras seleccionadas
                  {review?.unresolved
                    ? ` · ${review.unresolved} coincidencias pendientes`
                    : ''}
                </p>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={
                    blocked || networkBusy || Boolean(review?.unresolved)
                  }
                >
                  Revisar importación
                </button>
              </div>
            ) : null}
            {prepared ? (
              <section
                className="discography-confirm mt-6"
                aria-labelledby="discography-review"
              >
                <h3
                  id="discography-review"
                  ref={reviewHeading}
                  tabIndex={-1}
                  className="text-xl font-semibold"
                >
                  Confirma tu selección
                </h3>
                <p className="mt-3">
                  {prepared.added} álbumes nuevos · {prepared.linked} álbumes
                  existentes para vincular.
                </p>
                <p className="mt-2 text-sm text-muted">
                  Los nuevos álbumes quedarán sin escucha registrada. Se
                  conservan tus notas, valoraciones, ediciones, audio y
                  colección. Las obras retiradas permanecen retiradas.
                </p>
                <ul className="my-4 text-sm">
                  {picked
                    .filter(
                      (row) =>
                        choices.albums[row.id] !== 'skip' &&
                        !linkedIds.has(row.id),
                    )
                    .map((row) => (
                      <li key={row.id}>
                        {row.title}
                        {unmappedDiscographyTypes(row).length ? (
                          <span className="text-muted">
                            {' '}
                            · Categorías de la fuente sin equivalente local:{' '}
                            {unmappedDiscographyTypes(row).join(', ')}. Podrás
                            consultarlas en el enlace de origen.
                          </span>
                        ) : null}
                      </li>
                    ))}
                </ul>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={blocked || prepared.added + prepared.linked === 0}
                  >
                    Confirmar importación
                  </button>
                  <button
                    type="button"
                    className="action-button"
                    disabled={blocked}
                    onClick={() => setPrepared(undefined)}
                  >
                    Volver a la selección
                  </button>
                </div>
              </section>
            ) : null}
            {committed ? (
              <button
                type="button"
                className="primary-button mt-4"
                disabled={busy}
                onClick={() => void retryRead()}
              >
                Reintentar lectura tras importación
              </button>
            ) : null}
          </form>
        </>
      ) : null}
    </section>
  )
}
