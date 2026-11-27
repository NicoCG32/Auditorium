import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  defaultLibraryFilters,
  projectLibrary,
  ratingGenre,
  type LibraryAlbum,
} from '../../application/library-query'
import { MusicLibrary } from '../../application/music-library'
import type {
  LocalSnapshot,
  BackupLocalRepository,
} from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { AddMusicPage } from './AddMusicPage'
import { AlbumSummary } from './AlbumSummary'
import { RemovedAlbumsPanel } from './RemovedAlbumsPanel'
import { BackupPanel } from './BackupPanel'
import type { CloudAccount } from '../../application/cloud-account'
import { AccountPanel } from '../account/AccountPanel'
import type { RecommendationProvider } from '../../application/recommendations'
import { RecommendationsPanel } from '../recommendations/RecommendationsPanel'
import { useNavigation } from '../navigation/navigation-context'
import { useDraftGuard } from '../navigation/draft-context'
import { routeHash, routeTitle, type Route } from '../navigation/routes'
import { LibraryView } from './LibraryView'
import { RatingsDestination, WishesDestination } from './LibraryDestinations'
import { CollectionDestination } from './CollectionDestination'
import { defaultCollectionFilters } from '../../application/collection-query'
import { ArtistPage } from './ArtistPage'
import { CollectionPreferences } from '../appearance/CollectionPreferences'
import { useCollectionPreferences } from '../appearance/use-collection-preferences'
import type {
  CollectionMedium,
  PhysicalFormat,
} from '../../application/library-holdings'
import { useSavedCollectionViews } from '../appearance/use-saved-collection-views'
import { ApplicationSettings } from '../settings/ApplicationSettings'
import { SettingsPage } from '../settings/SettingsPage'
import { AppShell } from '../navigation/AppShell'
import { ArtistsDirectory } from './ArtistsDirectory'
import { DiscographyImportPanel } from '../catalog/DiscographyImportPanel'
import { LocalCovers } from './LocalCovers'
import { CoverActivity } from './cover-context'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; albums: LibraryAlbum[]; snapshot: LocalSnapshot }
function errorMessage(error: unknown) {
  if (error instanceof LocalStorageError) {
    if (error.code === 'quota_exceeded')
      return 'No hay espacio para abrir tu biblioteca. Los datos existentes se conservan; libera espacio y vuelve a intentar.'
    if (error.code === 'aborted')
      return 'La apertura de tu biblioteca no pudo completarse. Los datos existentes se conservan; vuelve a intentar.'
    if (error.code === 'blocked')
      return 'Otra pestaña impide abrir tu biblioteca. Ciérrala y vuelve a intentar.'
    if (error.code === 'unavailable')
      return 'Este navegador no permite acceder al almacenamiento local. Revisa sus permisos y vuelve a intentar.'
    if (
      ['corrupt_data', 'identity_missing', 'version_mismatch'].includes(
        error.code,
      )
    )
      return 'No se puede abrir esta biblioteca con seguridad. Los datos se conservan; comprueba que utilizas la versión adecuada antes de volver a intentar.'
  }
  return 'No se pudo leer tu biblioteca. Vuelve a intentar.'
}

export function LibraryPage({
  repository,
  account,
}: {
  repository: BackupLocalRepository
  account?: CloudAccount
}) {
  const navigation = useNavigation()
  if (!navigation)
    throw new Error('La biblioteca necesita su controlador de navegación.')
  return (
    <ApplicationSettings>
      <CollectionPreferences>
        <LibraryContent
          repository={repository}
          navigation={navigation}
          {...(account ? { account } : {})}
        />
      </CollectionPreferences>
    </ApplicationSettings>
  )
}

function LibraryContent({
  repository,
  navigation,
  account,
}: {
  repository: BackupLocalRepository
  navigation: NonNullable<ReturnType<typeof useNavigation>>
  account?: CloudAccount
}) {
  const navigationState = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
  )
  const route = navigationState.route
  const path = routeHash(route)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [request, setRequest] = useState(0)
  const [filters, setFilters] = useState(defaultLibraryFilters)
  const [controlsOpen, setControlsOpen] = useState(false)
  const preferences = useCollectionPreferences()
  const [medium, setMedium] = useState<CollectionMedium>('all')
  const [physicalFormat, setPhysicalFormat] = useState<PhysicalFormat>('all')
  const [artistSearch, setArtistSearch] = useState('')
  const [artistOrigin, setArtistOrigin] = useState<Route>({ kind: 'artists' })
  const [ratingSearch, setRatingSearch] = useState('')
  const [ratingMode, setRatingMode] = useState<'unrated' | 'rated'>('unrated')
  const [ratingsGenre, setRatingsGenre] = useState('')
  const [ratingsBasis, setRatingsBasis] = useState<'auto' | 'general'>('auto')
  const [collectionFilters, setCollectionFilters] = useState(
    defaultCollectionFilters,
  )
  const [collectionAlbumSearch, setCollectionAlbumSearch] = useState('')
  const [collectionRegisterOpen, setCollectionRegisterOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [detailBusy, setDetailBusy] = useState(false)
  const [recommendationProvider, setRecommendationProvider] =
    useState<RecommendationProvider>('groq')
  const [recommendationKey, setRecommendationKey] = useState('')
  const content = useRef<HTMLDivElement>(null)
  const emptyForm = useRef<HTMLFormElement>(null)
  const library = useMemo(() => new MusicLibrary(repository), [repository])
  useEffect(() => {
    if (!account) return
    const stopSync = account.startSync(
      () =>
        !navigation.drafts
          .active()
          .some(
            (editor) =>
              editor.id !== 'account' &&
              (editor.dirty || editor.busy || editor.pendingRead),
          ) && !navigation.getSnapshot().prompt,
    )
    const stopLibrary = account.subscribeLibrary(() => {
      void repository
        .readSnapshot()
        .then((snapshot) => {
          setState({
            status: 'ready',
            albums: projectLibrary(snapshot),
            snapshot,
          })
        })
        .catch(() => {
          setNotice(
            'La biblioteca cambió. Pulsa Actualizar biblioteca para volver a leerla.',
          )
        })
    })
    return () => {
      stopSync()
      stopLibrary()
    }
  }, [account, navigation, repository])
  useDraftGuard({
    id: 'operation',
    label: 'Operación de biblioteca',
    dirty: false,
    busy: detailBusy,
    pendingRead: false,
    form: emptyForm,
  })
  useEffect(() => {
    let active = true
    void repository
      .readSnapshot()
      .then((snapshot) => {
        if (active)
          setState({
            status: 'ready',
            albums: projectLibrary(snapshot),
            snapshot,
          })
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', message: errorMessage(error) })
      })
    return () => {
      active = false
    }
  }, [repository, request])
  const ready = state.status === 'ready'
  const savedViews = useSavedCollectionViews(
    ready ? state.snapshot.identity : undefined,
  )
  const initialView = useRef(true)
  useLayoutEffect(() => {
    if (ready && content.current) {
      if (!initialView.current || route.kind !== 'library')
        navigation.restore(content.current)
      initialView.current = false
    }
  }, [navigation, path, ready, route.kind])
  useEffect(() => {
    document.title = `${route.kind === 'library' ? preferences.name.trim() || 'Mi colección' : routeTitle(route)} · Auditórium`
  }, [route, preferences.name])
  function go(next: Route) {
    setNotice('')
    navigation.request(next)
  }
  function openArtist(id: string) {
    setArtistOrigin(route)
    go({ kind: 'artist', id })
  }
  function refresh() {
    navigation.requestAction(() => {
      setNotice('')
      setState({ status: 'loading' })
      setRequest((previous) => previous + 1)
    })
  }
  async function synchronizeDetail() {
    const snapshot = await repository.readSnapshot()
    setState({ status: 'ready', albums: projectLibrary(snapshot), snapshot })
    return snapshot
  }
  function complete(entryId: string, existing: boolean) {
    setNotice(
      existing
        ? 'Álbum disponible en tu biblioteca.'
        : 'Álbum guardado en tu biblioteca.',
    )
    navigation.completed({ kind: 'album', id: entryId }, 'new-album')
  }
  const selected =
    ready && route.kind === 'album'
      ? state.albums.find((entry) => entry.id === route.id)
      : undefined
  const selectedAlbum =
    ready && selected
      ? state.snapshot.catalog.albums.find(
          (album) => album.id === selected.albumId,
        )
      : undefined
  const personalEntry =
    ready && selected
      ? state.snapshot.library.userAlbums.find((row) => row.id === selected.id)
      : undefined
  const blocked =
    navigationState.blocked ||
    navigationState.resolving ||
    navigationState.restoring
  const from = selected
    ? navigation.origin(selected.id)
    : ({ kind: 'library' } as const)
  const comparisonGenre =
    from.kind === 'ratings'
      ? ratingGenre({ genre: ratingsGenre, ratingBasis: ratingsBasis })
      : from.kind === 'library'
        ? ratingGenre(filters)
        : undefined
  const title =
    route.kind === 'library'
      ? preferences.name.trim() || 'Mi colección'
      : route.kind === 'add'
        ? 'Añadir música'
        : route.kind === 'artist' && state.status === 'ready'
          ? (state.snapshot.catalog.artists.find((row) => row.id === route.id)
              ?.name ?? 'Artista')
          : routeTitle(route)
  return (
    <div ref={content} className="library-content">
      <AppShell
        route={route}
        title={title}
        disabled={!ready || blocked}
        onNavigate={go}
        accountLabel={
          account?.getSnapshot().user?.email ?? 'En este dispositivo'
        }
        onRefresh={refresh}
      >
        <LocalCovers
          repository={repository}
          snapshot={ready ? state.snapshot : undefined}
          onCommitted={synchronizeDetail}
        >
          <CoverActivity />
          {notice ? (
            <p role="status" className="mb-6 text-sm text-accent-text">
              {notice}
            </p>
          ) : null}
          {state.status === 'loading' ? (
            <div className="library-empty" role="status">
              <p>Cargando tu biblioteca…</p>
            </div>
          ) : state.status === 'error' ? (
            <section className="library-empty" aria-labelledby="error-title">
              <h2 id="error-title" className="text-2xl font-semibold">
                No pudimos abrir la biblioteca
              </h2>
              <p className="mt-4 max-w-lg text-muted" role="alert">
                {state.message}
              </p>
              <button
                type="button"
                className="action-button mt-6"
                onClick={refresh}
              >
                Volver a intentar
              </button>
            </section>
          ) : route.kind === 'settings' ? (
            <SettingsPage
              section={route.section}
              onRefresh={refresh}
              disabled={blocked}
            />
          ) : route.kind === 'artists' ? (
            <ArtistsDirectory
              albums={state.albums}
              snapshot={state.snapshot}
              search={artistSearch}
              onSearch={setArtistSearch}
              onArtist={openArtist}
              onSearchCatalog={() => go({ kind: 'catalog' })}
            />
          ) : route.kind === 'catalog' ? (
            <DiscographyImportPanel
              snapshot={state.snapshot}
              repository={repository}
              onBusyChange={setDetailBusy}
              onCommitted={synchronizeDetail}
              onOpenAlbum={(id) => navigation.openAlbum(id)}
              onImported={(result) => {
                setFilters(defaultLibraryFilters)
                setNotice(
                  `${result.added} álbumes incorporados y ${result.linked} vinculados. Tu experiencia se conserva.`,
                )
                navigation.completed({ kind: 'library' }, 'discography')
              }}
            />
          ) : route.kind === 'add' ? (
            <AddMusicPage
              snapshot={state.snapshot}
              repository={repository}
              library={library}
              onBusyChange={setDetailBusy}
              onImported={(result) => {
                setFilters(defaultLibraryFilters)
                setNotice(
                  result
                    ? `${result.added} álbumes incorporados y ${result.linked} vinculados. Tu experiencia se conserva.`
                    : 'Datos incorporados a tu biblioteca.',
                )
                navigation.completed({ kind: 'library' }, 'discography')
              }}
              onComplete={complete}
              onCommitted={synchronizeDetail}
              onCancel={() => go({ kind: 'library' })}
            />
          ) : route.kind === 'album' ? (
            selected && selectedAlbum && personalEntry ? (
              <AlbumSummary
                key={selected.id}
                snapshot={state.snapshot}
                repository={repository}
                onArtist={openArtist}
                album={selectedAlbum}
                entry={selected}
                {...(comparisonGenre ? { ratingGenre: comparisonGenre } : {})}
                library={library}
                busy={detailBusy}
                onBusyChange={setDetailBusy}
                personalEntry={personalEntry}
                catalog={state.snapshot.catalog}
                trackRatings={state.snapshot.library.trackRatings}
                ownedItems={state.snapshot.library.ownedItems}
                purchaseWishes={state.snapshot.library.purchaseWishes}
                personalLibrary={state.snapshot.library}
                onExperienceCommitted={synchronizeDetail}
                editing={route.editor === 'edit'}
                experienceEditing={route.editor === 'experience'}
                collectionEditing={route.editor === 'collection'}
                onExperienceOpen={() =>
                  go({ kind: 'album', id: selected.id, editor: 'experience' })
                }
                onExperienceComplete={() => {
                  setNotice('Experiencia guardada.')
                  navigation.completed(
                    { kind: 'album', id: selected.id },
                    `experience:${selected.id}`,
                  )
                }}
                onExperienceCancel={() =>
                  go({ kind: 'album', id: selected.id })
                }
                onEdit={() =>
                  go({ kind: 'album', id: selected.id, editor: 'edit' })
                }
                onEditComplete={() => {
                  setNotice('Datos del álbum guardados.')
                  navigation.completed(
                    { kind: 'album', id: selected.id },
                    `edit:${selected.albumId}`,
                  )
                }}
                onEditCancel={() => go({ kind: 'album', id: selected.id })}
                backLabel={
                  from.kind === 'artist'
                    ? `Volver a ${state.snapshot.catalog.artists.find((row) => row.id === from.id)?.name ?? 'artista'}`
                    : from.kind === 'library'
                      ? 'Volver a biblioteca'
                      : `Volver a ${routeTitle(from).toLocaleLowerCase()}`
                }
                onBack={() => go(from)}
                onRemoved={() => {
                  setNotice(
                    'Álbum retirado. Puedes restaurarlo desde «Álbumes retirados» con todos sus datos personales.',
                  )
                  navigation.completed({ kind: 'library' }, 'operation')
                }}
              />
            ) : (
              <section className="library-empty">
                <h2 className="text-xl font-semibold">
                  Este álbum no está en esta biblioteca
                </h2>
                <p className="mt-3 text-muted">
                  Puede estar retirado o pertenecer a otro navegador.
                </p>
                <button
                  type="button"
                  className="action-button mt-5"
                  onClick={() => go({ kind: 'library' })}
                >
                  Volver a biblioteca
                </button>
              </section>
            )
          ) : route.kind === 'artist' ? (
            <ArtistPage
              key={route.id}
              artistId={route.id}
              snapshot={state.snapshot}
              repository={repository}
              onBack={() => go(artistOrigin)}
              backLabel={
                artistOrigin.kind === 'library'
                  ? 'Volver a biblioteca'
                  : `Volver a ${routeTitle(artistOrigin).toLocaleLowerCase('es')}`
              }
              onOpenAlbum={(id) => navigation.openAlbum(id)}
              onBusyChange={setDetailBusy}
              onCommitted={synchronizeDetail}
              onLinked={() =>
                navigation.completed(
                  { kind: 'artist', id: route.id },
                  'artist-link',
                )
              }
              onImported={() =>
                navigation.completed(
                  { kind: 'artist', id: route.id },
                  'discography',
                )
              }
            />
          ) : route.kind === 'library' ? (
            <LibraryView
              repository={repository}
              onCommitted={synchronizeDetail}
              onBusyChange={setDetailBusy}
              savedViews={savedViews}
              format={physicalFormat}
              onFormatChange={setPhysicalFormat}
              controlsOpen={controlsOpen}
              onControlsOpen={setControlsOpen}
              albums={state.albums}
              snapshot={state.snapshot}
              filters={{ ...filters, order: preferences.order }}
              onFiltersChange={(next) => {
                setNotice('')
                setFilters(next)
                if (next.order !== preferences.order)
                  preferences.update({ order: next.order })
              }}
              view={preferences.view}
              onViewChange={(view) => {
                setNotice('')
                preferences.update({ view })
              }}
              medium={medium}
              onMediumChange={(next) => {
                setNotice('')
                setMedium(next)
                setPhysicalFormat('all')
              }}
              covers={preferences.covers}
              details={preferences.details}
              onOpen={(id) => navigation.openAlbum(id)}
              onAdd={() => go({ kind: 'add' })}
              onArtist={openArtist}
            />
          ) : route.kind === 'ratings' ? (
            <RatingsDestination
              albums={state.albums}
              search={ratingSearch}
              onSearch={setRatingSearch}
              mode={ratingMode}
              genre={ratingsGenre}
              basis={ratingsBasis}
              onGenre={(genre) => {
                setRatingsGenre(genre)
                setRatingsBasis('auto')
              }}
              onBasis={setRatingsBasis}
              onMode={setRatingMode}
              onOpen={(id) => navigation.openAlbum(id, 'experience')}
            />
          ) : route.kind === 'collection' ? (
            <CollectionDestination
              albums={state.albums}
              snapshot={state.snapshot}
              filters={collectionFilters}
              onFilters={setCollectionFilters}
              albumSearch={collectionAlbumSearch}
              onAlbumSearch={setCollectionAlbumSearch}
              registerOpen={collectionRegisterOpen}
              onRegisterOpen={setCollectionRegisterOpen}
              onOpen={(id) => navigation.openAlbum(id, 'collection')}
              onWishes={() => go({ kind: 'options', section: 'wishes' })}
              onAdd={() => go({ kind: 'add' })}
            />
          ) : route.kind === 'options' ? (
            route.section === 'account' ? (
              account ? (
                <AccountPanel account={account} />
              ) : (
                <p>
                  El acceso entre dispositivos todavía no está disponible en
                  esta instalación. Puedes seguir usando la biblioteca y sus
                  respaldos.
                </p>
              )
            ) : route.section === 'recommendations' ? (
              <RecommendationsPanel
                albums={state.albums}
                provider={recommendationProvider}
                apiKey={recommendationKey}
                onProviderChange={(provider) => {
                  setRecommendationProvider(provider)
                  setRecommendationKey('')
                }}
                onKeyChange={setRecommendationKey}
                onOpenAlbum={(id) => navigation.openAlbum(id)}
                onClose={() => go({ kind: 'library' })}
              />
            ) : route.section === 'backups' ? (
              <BackupPanel
                repository={repository}
                snapshot={state.snapshot}
                blocked={detailBusy}
                onBusyChange={setDetailBusy}
                onCommitted={synchronizeDetail}
                onImported={() => {
                  setFilters(defaultLibraryFilters)
                  setNotice('Datos añadidos a tu colección.')
                  navigation.completed({ kind: 'library' }, 'operation')
                }}
                onRestored={() => {
                  setFilters(defaultLibraryFilters)
                  setNotice('Respaldo restaurado.')
                  navigation.completed({ kind: 'library' }, 'operation')
                }}
                onBack={() => go({ kind: 'library' })}
              />
            ) : route.section === 'removed' ? (
              <RemovedAlbumsPanel
                snapshot={state.snapshot}
                library={library}
                blocked={detailBusy}
                onBusyChange={setDetailBusy}
                onCommitted={synchronizeDetail}
                onRestored={(id) => {
                  setNotice('Álbum restaurado con sus datos personales.')
                  navigation.completed({ kind: 'album', id }, 'operation')
                }}
                onOpenActive={(id) => navigation.openAlbum(id)}
                onBack={() => go({ kind: 'library' })}
              />
            ) : (
              <WishesDestination
                albums={state.albums}
                snapshot={state.snapshot}
                onOpen={(id) => navigation.openAlbum(id)}
              />
            )
          ) : (
            <section className="library-empty">
              <h2 className="text-xl font-semibold">
                No encontramos esta pantalla
              </h2>
              <button
                type="button"
                className="action-button mt-5"
                onClick={() => go({ kind: 'library' })}
              >
                Volver a biblioteca
              </button>
            </section>
          )}
        </LocalCovers>
      </AppShell>
    </div>
  )
}
