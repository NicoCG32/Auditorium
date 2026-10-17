import { useEffect, useRef, useState } from 'react'
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
import { AlbumReferenceLinks } from '../catalog/AlbumReferenceLinks'
import { AlbumEditPanel } from './AlbumEditPanel'

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
}) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const editButton = useRef<HTMLButtonElement>(null)
  const focusEdit = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [entry.id])
  useEffect(() => {
    if (!editing && focusEdit.current) {
      editButton.current?.focus()
      focusEdit.current = false
    }
  }, [editing])
  const creditedArtists = catalog.albumArtists
    .filter((credit) => credit.albumId === album.id)
    .toSorted((a, b) => a.position - b.position)
    .map((credit) =>
      catalog.artists.find((artist) => artist.id === credit.artistId),
    )
    .filter((artist) => artist !== undefined)
  return (
    <>
      {editing ? (
        <AlbumEditPanel
          snapshot={snapshot}
          albumId={album.id}
          library={library}
          onCommitted={onExperienceCommitted}
          onBusyChange={onBusyChange}
          onComplete={() => {
            focusEdit.current = true
            setEditing(false)
            setNotice('Datos del álbum guardados.')
          }}
          onCancel={() => {
            focusEdit.current = true
            setEditing(false)
          }}
        />
      ) : null}
      <section
        hidden={editing}
        className="album-summary"
        aria-labelledby="album-summary-title"
      >
        <button
          type="button"
          className="text-button mb-6"
          disabled={busy}
          onClick={onBack}
        >
          Volver a biblioteca
        </button>
        <button
          ref={editButton}
          type="button"
          className="action-button mb-6 ml-3"
          disabled={busy}
          onClick={() => {
            setNotice('')
            setEditing(true)
          }}
        >
          Editar álbum
        </button>
        {notice ? (
          <p role="status" className="mb-5 text-sm text-accent-text">
            {notice}
          </p>
        ) : null}
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
                <dt className="text-muted">Tipo</dt>
                <dd>{releaseTypeLabels[album.releaseType]}</dd>
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
          blocked={busy}
          onBusyChange={onBusyChange}
          onCommitted={onExperienceCommitted}
          onRemoved={onRemoved}
        />
      </section>
    </>
  )
}
