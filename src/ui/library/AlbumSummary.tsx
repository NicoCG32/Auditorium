import { useEffect, useRef } from 'react'
import type { Album, Catalog } from '../../domain/catalog/schemas'
import type { LibraryAlbum } from '../../application/library-query'
import { releaseTypeLabels } from './labels'
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

export function AlbumSummary({
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
}: {
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
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [entry.id])
  return (
    <section className="album-summary" aria-labelledby="album-summary-title">
      <button
        type="button"
        className="text-button mb-6"
        disabled={busy}
        onClick={onBack}
      >
        Volver a biblioteca
      </button>
      <div className="album-summary-grid">
        <AlbumCover
          key={album.coverUrl ?? album.id}
          title={album.title}
          {...(album.coverUrl ? { url: album.coverUrl } : {})}
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
              <dt className="text-muted">Tipo</dt>
              <dd>{releaseTypeLabels[album.releaseType]}</dd>
            </div>
            <div>
              <dt className="text-muted">Año original</dt>
              <dd>{album.originalYear ?? 'Sin registrar'}</dd>
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
        blocked={busy}
        onBusyChange={onBusyChange}
        onCommitted={onExperienceCommitted}
        onRemoved={onRemoved}
      />
    </section>
  )
}
