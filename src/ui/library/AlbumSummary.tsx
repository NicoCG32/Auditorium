import { useEffect, useRef, useState } from 'react'
import type { Album, Catalog } from '../../domain/catalog/schemas'
import type { LibraryAlbum } from '../../application/library-query'
import {
  classificationLabel,
  publicationLabels,
} from '../../domain/catalog/classification'
import type { MusicLibrary } from '../../application/music-library'
import { AlbumCover } from './AlbumCover'
import { AlbumRatingForm } from './AlbumRatingForm'
import { AlbumExperienceForm } from './AlbumExperienceForm'
import type {
  UserAlbum,
  TrackRating,
  Library,
} from '../../domain/library/schemas'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { AlbumTrackLists } from './AlbumTrackLists'
import { OwnedItemsPanel } from './OwnedItemsPanel'
import type { OwnedItem } from '../../domain/library/owned-items'
import type { PurchaseWish } from '../../domain/library/purchase-wishes'
import { PurchaseWishesPanel } from './PurchaseWishesPanel'
import { RemoveAlbumPanel } from './RemoveAlbumPanel'
import { AlbumReferenceLinks } from '../catalog/AlbumReferenceLinks'
import { PersonalAlbumLinks } from './PersonalAlbumLinks'
import { AlbumEditPanel } from './AlbumEditPanel'
import { useNavigation } from '../navigation/navigation-context'

export function AlbumSummary({
  snapshot,
  album,
  entry,
  onBack,
  library,
  onRatingCommitted,
  busy,
  onBusyChange,
  personalEntry,
  onExperienceCommitted,
  catalog,
  trackRatings,
  ownedItems,
  purchaseWishes,
  personalLibrary,
  onRemoved,
  editing,
  onEdit,
  onEditComplete,
  onEditCancel,
  backLabel,
}: {
  snapshot: LocalSnapshot
  album: Album
  entry: LibraryAlbum
  onBack: () => void
  library: MusicLibrary
  onRatingCommitted: () => Promise<void>
  busy: boolean
  onBusyChange: (busy: boolean) => void
  personalEntry: UserAlbum
  onExperienceCommitted: () => Promise<LocalSnapshot>
  catalog: Catalog
  trackRatings: TrackRating[]
  ownedItems: OwnedItem[]
  purchaseWishes: PurchaseWish[]
  personalLibrary: Library
  onRemoved: () => void
  editing: boolean
  onEdit: () => void
  onEditComplete: () => void
  onEditCancel: () => void
  backLabel: string
}) {
  const navigation = useNavigation()
  const [focusLinks, setFocusLinks] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [entry.id])
  const creditedArtists = catalog.albumArtists
    .filter((credit) => credit.albumId === album.id)
    .toSorted((a, b) => a.position - b.position)
    .map((credit) =>
      catalog.artists.find((artist) => artist.id === credit.artistId),
    )
    .filter((artist) => artist !== undefined)
  if (editing)
    return (
      <AlbumEditPanel
        snapshot={snapshot}
        albumId={album.id}
        library={library}
        onCommitted={onExperienceCommitted}
        onBusyChange={onBusyChange}
        onComplete={onEditComplete}
        onCancel={onEditCancel}
        focusLinks={focusLinks}
      />
    )
  return (
    <>
      <section className="album-summary" aria-labelledby="album-summary-title">
        <button
          type="button"
          className="text-button mb-6"
          disabled={busy}
          onClick={onBack}
        >
          {backLabel}
        </button>
        <button
          id="album-edit-button"
          type="button"
          className="action-button mb-6 ml-3"
          disabled={busy}
          onClick={(event) => {
            event.currentTarget.focus()
            setFocusLinks(false)
            onEdit()
          }}
        >
          Editar álbum
        </button>
        <div className="album-summary-grid">
          <AlbumCover
            title={album.title}
            {...(album.coverUrl ? { url: album.coverUrl } : {})}
            {...(album.coverImage ? { image: album.coverImage } : {})}
          />
          <div className="min-w-0">
            <p className="mb-4 text-xs tracking-widest text-accent-text uppercase">
              En tu biblioteca
            </p>
            <h2
              id="album-summary-title"
              ref={heading}
              tabIndex={-1}
              className="text-3xl font-semibold wrap-anywhere"
            >
              {album.title}
            </h2>
            <p className="mt-3 text-lg text-muted wrap-anywhere">
              {entry.artist}
            </p>
            <dl className="mt-6 grid gap-4 text-sm">
              <div>
                <dt className="text-muted">Clasificación</dt>
                <dd>{classificationLabel(album)}</dd>
                <dt className="text-muted mt-3">Publicación</dt>
                <dd>{publicationLabels[album.publicationStatus]}</dd>
              </div>
              <div>
                <dt className="text-muted">Año original</dt>
                <dd>{album.originalYear ?? 'Sin registrar'}</dd>
              </div>
              <div>
                <dt className="text-muted">Géneros</dt>
                <dd>
                  {album.genres?.length
                    ? album.genres.join(' · ')
                    : 'Sin registrar'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">País de origen</dt>
                <dd>
                  {creditedArtists.some((artist) => artist.country)
                    ? creditedArtists
                        .map(
                          (artist) =>
                            `${artist.name}: ${artist.country ?? 'Sin registrar'}`,
                        )
                        .join(' · ')
                    : 'Sin registrar'}
                </dd>
              </div>
            </dl>
            {album.description ? (
              <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed wrap-anywhere">
                {album.description}
              </p>
            ) : null}
            {album.coverUrl ? (
              <a
                className="text-button mt-5 inline-flex items-center"
                href={album.coverUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                Abrir enlace de portada
              </a>
            ) : null}
            <AlbumRatingForm
              key={entry.id}
              entryId={entry.id}
              score={entry.score}
              library={library}
              onCommitted={onRatingCommitted}
              onBusyChange={onBusyChange}
              blocked={busy}
            />
          </div>
        </div>
        <PersonalAlbumLinks
          entry={personalEntry}
          onEdit={() => {
            setFocusLinks(true)
            onEdit()
          }}
          disabled={busy}
        />
        <AlbumReferenceLinks album={album} artist={entry.artist} />
        <AlbumTrackLists
          albumId={album.id}
          catalog={catalog}
          entryId={personalEntry.id}
          ratings={trackRatings}
          library={library}
          blocked={busy}
          onBusyChange={onBusyChange}
          onCommitted={onExperienceCommitted}
        />
        <AlbumExperienceForm
          key={personalEntry.id}
          entry={personalEntry}
          library={library}
          blocked={busy}
          onCommitted={onExperienceCommitted}
          onBusyChange={onBusyChange}
        />
        <OwnedItemsPanel
          entryId={personalEntry.id}
          items={ownedItems}
          releases={catalog.releases.filter(
            (release) => release.albumId === album.id,
          )}
          library={library}
          blocked={busy}
          onBusyChange={onBusyChange}
          onCommitted={onExperienceCommitted}
        />
        <PurchaseWishesPanel
          entryId={personalEntry.id}
          wishes={purchaseWishes}
          items={ownedItems}
          releases={catalog.releases.filter(
            (release) => release.albumId === album.id,
          )}
          library={library}
          blocked={busy}
          onBusyChange={onBusyChange}
          onCommitted={onExperienceCommitted}
        />
        <RemoveAlbumPanel
          entryId={personalEntry.id}
          title={album.title}
          data={personalLibrary}
          library={library}
          blocked={busy || Boolean(navigation?.drafts.dirty().length)}
          onBusyChange={onBusyChange}
          onCommitted={onExperienceCommitted}
          onRemoved={onRemoved}
        />
      </section>
    </>
  )
}
