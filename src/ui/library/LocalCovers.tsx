import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AlbumCovers,
  type CoverChoice,
  type CoverProgress,
} from '../../application/album-covers'
import {
  coverSourceSchema,
  CoverError,
  hasCoverRepository,
  type CoverLocalRepository,
} from '../../domain/covers'
import type {
  BackupLocalRepository,
  LocalSnapshot,
} from '../../domain/repositories/local-repository'
import { audioScope } from '../../domain/audio'
import { musicBrainzCatalog } from '../../infrastructure/catalog/musicbrainz-client'
import { CoverDownload } from '../../infrastructure/browser/cover-download'
import { CoversContext } from './cover-context'
import { discographyClassification } from '../../application/discography-catalog'
import { classificationLabel } from '../../domain/catalog/classification'

export function LocalCovers({
  repository,
  snapshot,
  onCommitted,
  children,
}: {
  repository: BackupLocalRepository
  snapshot: LocalSnapshot | undefined
  onCommitted: () => Promise<LocalSnapshot>
  children: ReactNode
}) {
  if (!snapshot || !hasCoverRepository(repository)) return children
  return (
    <CoverSession
      repository={repository}
      snapshot={snapshot}
      onCommitted={onCommitted}
    >
      {children}
    </CoverSession>
  )
}
function CoverSession({
  repository,
  snapshot,
  onCommitted,
  children,
}: {
  repository: CoverLocalRepository
  snapshot: LocalSnapshot
  onCommitted: () => Promise<LocalSnapshot>
  children: ReactNode
}) {
  const service = useMemo(
    () => new AlbumCovers(repository, musicBrainzCatalog, new CoverDownload()),
    [repository],
  )
  const [progress, setProgress] = useState<CoverProgress>()
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const scope = audioScope(snapshot.identity)
  const [session, setSession] = useState({ repository, scope })
  if (session.repository !== repository || session.scope !== scope) {
    setSession({ repository, scope })
    setProgress(undefined)
    setBusy(false)
    setMessage('')
    setFailure('')
    setRevision((value) => value + 1)
  }
  const active = useRef<AbortController | undefined>(undefined)
  const epoch = useRef({})
  const mounted = useRef(true)
  const seen = useRef(
    new Set(snapshot.library.userAlbums.map((row) => row.albumId)),
  )
  const sources = useRef(
    new Map(snapshot.catalog.albums.map((row) => [row.id, row.coverUrl])),
  )
  const queued = useRef(new Set<string>())
  const urls = useRef(new Map<string, Promise<string | undefined>>())
  const objectUrls = useRef(new Set<string>())
  const identity = useRef(snapshot.identity)
  const commit = useRef(onCommitted)
  const resetSession = useEffectEvent(() => {
    active.current?.abort()
    active.current = undefined
    epoch.current = {}
    identity.current = snapshot.identity
    seen.current = new Set(
      snapshot.library.userAlbums.map((row) => row.albumId),
    )
    sources.current = new Map(
      snapshot.catalog.albums.map((row) => [row.id, row.coverUrl]),
    )
    queued.current.clear()
    urls.current.clear()
    for (const url of objectUrls.current) URL.revokeObjectURL(url)
    objectUrls.current.clear()
  })
  // Reset cover work without remounting account/restore forms and their receipts.
  useLayoutEffect(() => {
    resetSession()
  }, [repository, scope])
  useEffect(() => {
    commit.current = onCommitted
  }, [onCommitted])
  useEffect(() => {
    mounted.current = true
    const allocated = objectUrls.current
    const cached = urls.current
    return () => {
      mounted.current = false
      active.current?.abort()
      active.current = undefined
      epoch.current = {}
      for (const url of allocated) URL.revokeObjectURL(url)
      allocated.clear()
      cached.clear()
    }
  }, [])
  const load = useCallback(
    async (url: string) => {
      if (!coverSourceSchema.safeParse(url).success) return
      const currentEpoch = epoch.current
      if (!urls.current.has(url))
        urls.current.set(
          url,
          repository
            .readCoverFile(url, identity.current)
            .then((file) => {
              if (!file || !mounted.current || currentEpoch !== epoch.current) {
                if (currentEpoch === epoch.current) urls.current.delete(url)
                return
              }
              const local = URL.createObjectURL(
                new Blob([new Uint8Array(file.bytes)], {
                  type: file.attachment.mime,
                }),
              )
              objectUrls.current.add(local)
              return local
            })
            .catch(() => {
              if (currentEpoch === epoch.current) urls.current.delete(url)
              return undefined
            }),
        )
      return urls.current.get(url)
    },
    [repository],
  )
  const refresh = useCallback(async () => {
    const currentEpoch = epoch.current
    const next = await commit.current()
    if (!mounted.current || epoch.current !== currentEpoch) return
    sources.current = new Map(
      next.catalog.albums.map((row) => [row.id, row.coverUrl]),
    )
    if (!mounted.current) return
    setRevision((value) => value + 1)
  }, [])
  const run = useCallback(
    async (ids: string[]) => {
      if (active.current) {
        ids.forEach((id) => queued.current.add(id))
        return
      }
      const controller = new AbortController()
      active.current = controller
      setBusy(true)
      setMessage('')
      setFailure('')
      try {
        await service.complete(ids, controller.signal, (next) => {
          if (!mounted.current || active.current !== controller) return
          setProgress(next)
        })
      } catch (error) {
        if (mounted.current && active.current === controller) {
          if (controller.signal.aborted)
            setMessage(
              'Búsqueda detenida. Las portadas guardadas se conservan.',
            )
          else
            setFailure(
              error instanceof Error &&
                'code' in error &&
                error.code === 'quota_exceeded'
                ? 'No hay espacio para más portadas. Las que ya guardaste se conservan.'
                : error instanceof CoverError
                  ? error.message
                  : 'No pudimos completar la búsqueda. Las portadas guardadas se conservan; puedes volver a intentar.',
            )
        }
      } finally {
        if (mounted.current && active.current === controller) {
          await refresh().catch(() => {
            if (mounted.current && active.current === controller)
              setFailure(
                'Las portadas se guardaron. Actualiza la colección para ver los cambios.',
              )
          })
          if (mounted.current && active.current === controller) {
            active.current = undefined
            setBusy(false)
          }
        }
      }
    },
    [refresh, service],
  )
  useEffect(() => {
    const added = snapshot.library.userAlbums
      .filter((row) => !row.deletedAt && !seen.current.has(row.albumId))
      .map((row) => row.albumId)
    snapshot.library.userAlbums.forEach((row) => seen.current.add(row.albumId))
    for (const album of snapshot.catalog.albums) {
      if (
        album.coverUrl !== sources.current.get(album.id) &&
        coverSourceSchema.safeParse(album.coverUrl).success
      )
        added.push(album.id)
      sources.current.set(album.id, album.coverUrl)
    }
    added.forEach((id) => queued.current.add(id))
    if (busy || active.current || !queued.current.size) return
    const pending = [...queued.current]
    queued.current.clear()
    // A saved album is already usable; cover work runs independently.
    void run(pending)
  }, [snapshot, busy, run])
  async function choose(choice: CoverChoice, candidate: string) {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setBusy(true)
    setFailure('')
    try {
      const result = await service.choose(choice, candidate, controller.signal)
      if (!mounted.current || active.current !== controller) return
      if (result === 'missing')
        setMessage(
          'Esta referencia todavía no tiene portada. Puedes elegir otra o añadir una propia.',
        )
      else {
        setProgress((current) =>
          current
            ? {
                ...current,
                saved: current.saved + (result === 'saved' ? 1 : 0),
                choices: current.choices.filter(
                  (row) => row.albumId !== choice.albumId,
                ),
              }
            : current,
        )
        setMessage(
          result === 'saved'
            ? 'Portada guardada en este dispositivo.'
            : 'El álbum cambió. Vuelve a completar sus portadas para revisarlo.',
        )
      }
    } catch {
      if (mounted.current && active.current === controller)
        setFailure(
          controller.signal.aborted
            ? 'Búsqueda detenida. Tus portadas se conservan.'
            : 'No pudimos guardar la portada. Puedes volver a intentar.',
        )
    } finally {
      if (mounted.current && active.current === controller) {
        await refresh().catch(() => {})
        if (mounted.current && active.current === controller) {
          active.current = undefined
          setBusy(false)
        }
      }
    }
  }
  const activity =
    progress || message || failure ? (
      <section
        className="cover-progress mb-6"
        aria-label="Portadas de la colección"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="text-sm">
            {busy
              ? `Buscando portadas · ${progress?.done ?? 0} de ${progress?.total ?? 1}`
              : `${progress?.saved ?? 0} ${progress?.saved === 1 ? 'portada guardada' : 'portadas guardadas'}`}
            {busy && progress?.current ? (
              <span className="block text-muted wrap-anywhere">
                {progress.current}
              </span>
            ) : null}
          </p>
          <button
            type="button"
            className="text-button"
            aria-label={busy ? 'Detener búsqueda' : 'Cerrar aviso de portadas'}
            onClick={() => {
              if (busy) {
                queued.current.clear()
                active.current?.abort()
              } else {
                setProgress(undefined)
                setMessage('')
                setFailure('')
              }
            }}
          >
            {busy ? 'Detener búsqueda' : 'Cerrar'}
          </button>
        </div>
        {busy && progress ? (
          <progress
            className="mt-3 w-full"
            max={Math.max(1, progress.total)}
            value={progress.done}
            aria-label="Progreso de portadas"
          />
        ) : null}
        {!busy && progress?.missing ? (
          <p className="mt-2 text-sm text-muted">
            {progress.missing} sin portada disponible. Puedes añadirla cuando
            quieras.
          </p>
        ) : null}
        {!busy && progress?.failed ? (
          <p className="mt-2 text-sm text-muted">
            {progress.failed} no pudieron consultarse. Vuelve a completar las
            portadas para reintentar.
          </p>
        ) : null}
        {message ? (
          <p className="mt-2 text-sm" role="status">
            {message}
          </p>
        ) : null}
        {failure ? (
          <p className="mt-2 text-sm" role="alert">
            {failure}
          </p>
        ) : null}
        {progress?.choices.length ? (
          <details className="mt-3" open>
            <summary className="text-sm font-semibold">
              Revisar {progress.choices.length}{' '}
              {progress.choices.length === 1 ? 'coincidencia' : 'coincidencias'}
            </summary>
            <p className="mt-2 text-sm text-muted">
              Confirma el disco para elegir su portada. Tus datos se conservan.
            </p>
            <ul className="mt-3 grid gap-4">
              {progress.choices.slice(0, 5).map((choice) => (
                <li key={choice.albumId}>
                  <p className="text-sm font-semibold wrap-anywhere">
                    {choice.artist} · {choice.title}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {choice.candidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        className="action-button"
                        disabled={busy}
                        onClick={() => void choose(choice, candidate.id)}
                      >
                        {candidate.title} ·{' '}
                        {candidate.firstReleaseDate?.slice(0, 4) ?? 'Sin año'}
                        {' · '}
                        {classificationLabel(
                          discographyClassification(candidate),
                        )}
                        {candidate.artists.some(
                          (artist) => artist.country || artist.description,
                        )
                          ? ` · ${candidate.artists
                              .map((artist) =>
                                [artist.country, artist.description]
                                  .filter(Boolean)
                                  .join(', '),
                              )
                              .filter(Boolean)
                              .join(' / ')}`
                          : ''}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        setProgress((current) =>
                          current
                            ? {
                                ...current,
                                choices: current.choices.filter(
                                  (row) => row.albumId !== choice.albumId,
                                ),
                              }
                            : current,
                        )
                      }
                    >
                      Omitir {choice.title}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {progress.choices.length > 5 ? (
              <p className="mt-3 text-sm text-muted">
                Mostrando las primeras 5. Al confirmar u omitir aparecerán las
                siguientes.
              </p>
            ) : null}
          </details>
        ) : null}
      </section>
    ) : null
  const value = {
    load,
    revision,
    busy,
    activity,
    complete: () => {
      if (!active.current)
        void run(
          snapshot.library.userAlbums
            .filter((row) => !row.deletedAt)
            .map((row) => row.albumId),
        )
    },
  }
  return <CoversContext value={value}>{children}</CoversContext>
}
