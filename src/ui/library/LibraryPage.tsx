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
  type LibraryAlbum,
} from '../../application/library-query'
import { MusicLibrary } from '../../application/music-library'
import type {
  LocalSnapshot,
  BackupLocalRepository,
} from '../../domain/repositories/local-repository'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { AlbumForm } from './AlbumForm'
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
import {
  RatingsDestination,
  CollectionDestination,
  WishesDestination,
} from './LibraryDestinations'

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

const mainRoutes: Route[] = [
  { kind: 'library' },
  { kind: 'add' },
  { kind: 'ratings' },
  { kind: 'collection' },
]
const optionRoutes: Route[] = [
  { kind: 'options', section: 'recommendations' },
  { kind: 'options', section: 'backups' },
  { kind: 'options', section: 'removed' },
  { kind: 'options', section: 'wishes' },
  { kind: 'options', section: 'account' },
]

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
    <LibraryContent
      repository={repository}
      navigation={navigation}
      {...(account ? { account } : {})}
    />
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
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [ratingSearch, setRatingSearch] = useState('')
  const [ratingMode, setRatingMode] = useState<'unrated' | 'rated'>('unrated')
  const [collectionMedium, setCollectionMedium] = useState<
    'all' | 'physical' | 'purchased_digital'
  >('all')
  const [notice, setNotice] = useState('')
  const [detailBusy, setDetailBusy] = useState(false)
  const [recommendationProvider, setRecommendationProvider] =
    useState<RecommendationProvider>('groq')
  const [recommendationKey, setRecommendationKey] = useState('')
  const content = useRef<HTMLDivElement>(null)
  const utilities = useRef<HTMLDetailsElement>(null)
  const emptyForm = useRef<HTMLFormElement>(null)
  const library = useMemo(() => new MusicLibrary(repository), [repository])
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const menu = utilities.current
      if (
        menu?.open &&
        event.target instanceof Node &&
        !menu.contains(event.target)
      )
        menu.open = false
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])
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
  const initialView = useRef(true)
  useLayoutEffect(() => {
    if (ready && content.current) {
      if (!initialView.current || route.kind !== 'library')
        navigation.restore(content.current)
      initialView.current = false
    }
  }, [navigation, path, ready, route.kind])
  useEffect(() => {
    document.title = `${routeTitle(route)} · Auditórium`
  }, [route])
  function go(next: Route) {
    setNotice('')
    closeUtilities()
    navigation.request(next)
  }
  function closeUtilities() {
    if (utilities.current?.open) {
      utilities.current.open = false
      utilities.current.querySelector('summary')?.focus()
    }
  }
  function refresh() {
    closeUtilities()
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
  return (
    <div ref={content}>
      <nav className="primary-navigation" aria-label="Navegación principal">
        {mainRoutes.map((next) => (
          <button
            key={next.kind}
            id={`nav-${next.kind}`}
            type="button"
            className="action-button"
            aria-current={next.kind === route.kind ? 'page' : undefined}
            disabled={!ready || blocked}
            onClick={(event) => {
              event.currentTarget.focus()
              go(next)
            }}
          >
            {next.kind === 'library' ? 'Biblioteca' : routeTitle(next)}
          </button>
        ))}
      </nav>
      <div className="library-heading">
        <div
          className={`library-intro${route.kind === 'library' ? ' library-intro-home' : ''}`}
        >
          <p className="library-kicker">El archivo de tu música</p>
          <h1
            tabIndex={-1}
            data-route-heading
            className="library-title font-display font-black"
          >
            {route.kind === 'add'
              ? 'Registrar un álbum'
              : route.kind === 'options' && route.section === 'removed'
                ? 'Tu archivo retirado'
                : routeTitle(route)}
          </h1>
          {route.kind === 'library' ? (
            <p className="library-description text-muted">
              Los álbumes que te acompañan y los que te quedan por descubrir.
            </p>
          ) : null}
        </div>
        <details
          ref={utilities}
          className="library-utilities"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && utilities.current?.open) {
              event.preventDefault()
              closeUtilities()
            }
          }}
        >
          <summary>Más opciones</summary>
          <nav className="secondary-navigation" aria-label="Más opciones">
            {optionRoutes.map((next) => (
              <button
                key={routeHash(next)}
                id={`nav-${routeHash(next).split('/').at(-1)}`}
                type="button"
                className="text-button"
                disabled={!ready || blocked}
                onClick={(event) => {
                  event.currentTarget.focus()
                  go(next)
                }}
              >
                {routeTitle(next)}
                {next.kind === 'options' &&
                next.section === 'removed' &&
                state.status === 'ready'
                  ? ' (' +
                    state.snapshot.library.userAlbums.filter(
                      (row) => row.deletedAt !== undefined,
                    ).length +
                    ')'
                  : ''}
              </button>
            ))}
            <button
              type="button"
              className="text-button"
              disabled={!ready || blocked}
              onClick={refresh}
            >
              Actualizar biblioteca
            </button>
          </nav>
        </details>
      </div>
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
      ) : route.kind === 'add' ? (
        <AlbumForm
          snapshot={state.snapshot}
          library={library}
          onComplete={complete}
          onCommitted={synchronizeDetail}
          onCancel={() => go({ kind: 'library' })}
        />
      ) : route.kind === 'album' ? (
        selected && selectedAlbum && personalEntry ? (
          <AlbumSummary
            key={selected.id}
            snapshot={state.snapshot}
            album={selectedAlbum}
            entry={selected}
            library={library}
            onRatingCommitted={async () => {
              await synchronizeDetail()
            }}
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
              from.kind === 'library'
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
      ) : route.kind === 'library' ? (
        <LibraryView
          albums={state.albums}
          filters={filters}
          onFiltersChange={setFilters}
          view={view}
          onViewChange={setView}
          onOpen={(id) => navigation.openAlbum(id)}
          onAdd={() => go({ kind: 'add' })}
        />
      ) : route.kind === 'ratings' ? (
        <RatingsDestination
          albums={state.albums}
          search={ratingSearch}
          onSearch={setRatingSearch}
          mode={ratingMode}
          onMode={setRatingMode}
          onOpen={(id) => navigation.openAlbum(id, 'experience')}
        />
      ) : route.kind === 'collection' ? (
        <CollectionDestination
          albums={state.albums}
          snapshot={state.snapshot}
          medium={collectionMedium}
          onMedium={setCollectionMedium}
          onOpen={(id) => navigation.openAlbum(id, 'collection')}
        />
      ) : route.kind === 'options' ? (
        route.section === 'account' ? (
          account ? (
            <AccountPanel account={account} />
          ) : (
            <p>
              El acceso entre dispositivos todavía no está disponible en esta
              instalación. Puedes seguir usando la biblioteca y sus respaldos.
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
            onRestored={() => {
              setFilters(defaultLibraryFilters)
              setNotice(
                'Biblioteca restaurada con sus datos e identidad local.',
              )
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
    </div>
  )
}
