import { useEffect, useRef, useState } from 'react'
import type { Album, Catalog } from '../../domain/catalog/schemas'
import type { LibraryAlbum } from '../../application/library-query'
import {
  classificationLabel,
  publicationLabels,
} from '../../domain/catalog/classification'
import type { MusicLibrary } from '../../application/music-library'
import { AlbumCover } from './AlbumCover'
import { formatScore, listeningLabels } from './labels'
import { unitsToScore } from '../../domain/library/scores'
import { releaseLabels } from './release-labels'
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
import { AudioPanel } from './AudioPanel'
import { GenreRatingsSummary } from './GenreRatingsSummary'
import { GenreRenameForm } from './GenreRenameForm'

export function AlbumSummary({
  snapshot,
  album,
  entry,
  onBack,
  library,
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
  experienceEditing,
  collectionEditing,
  onExperienceOpen,
  onExperienceComplete,
  onExperienceCancel,
  ratingGenre,
}: {
  experienceEditing: boolean
  collectionEditing: boolean
  onExperienceOpen: () => void
  onExperienceComplete: () => void
  onExperienceCancel: () => void
  ratingGenre?: string
  snapshot: LocalSnapshot
  album: Album
  entry: LibraryAlbum
  onBack: () => void
  library: MusicLibrary
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
    if (!experienceEditing) heading.current?.focus()
  }, [entry.id, experienceEditing])
  const creditedArtists = catalog.albumArtists
    .filter((credit) => credit.albumId === album.id)
    .toSorted((a, b) => a.position - b.position)
    .map((credit) =>
      catalog.artists.find((artist) => artist.id === credit.artistId),
    )
    .filter((artist) => artist !== undefined)
  const rating = personalLibrary.albumRatings.find(
    (row) => row.userAlbumId === personalEntry.id,
  )
  const releaseNames = releaseLabels(
    catalog.releases.filter((release) => release.albumId === album.id),
  )
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
    <section className="album-summary" aria-labelledby="album-summary-title">
      <div className="album-task-actions">
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={onBack}
        >
          {backLabel}
        </button>
        <button
          id="album-edit-button"
          type="button"
          className="action-button"
          disabled={busy}
          onClick={(event) => {
            event.currentTarget.focus()
            setFocusLinks(false)
            onEdit()
          }}
        >
          Editar álbum
        </button>
      </div>
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
          <p className="mt-4 text-sm">{classificationLabel(album)}</p>
          <p className="mt-2 text-sm text-muted">
            Año original: {album.originalYear ?? 'Sin registrar'}
          </p>
        </div>
      </div>
      <PersonalAlbumLinks
        key={JSON.stringify([
          personalEntry.id,
          personalEntry.links,
          personalEntry.preferredPlaybackLinkId,
        ])}
        entry={personalEntry}
        onEdit={() => {
          setFocusLinks(true)
          onEdit()
        }}
        disabled={busy}
      />
      {experienceEditing ? (
        <AlbumExperienceForm
          key={personalEntry.id}
          snapshot={snapshot}
          entryId={personalEntry.id}
          library={library}
          blocked={busy}
          onCommitted={onExperienceCommitted}
          onBusyChange={onBusyChange}
          onComplete={onExperienceComplete}
          onCancel={onExperienceCancel}
          {...(ratingGenre ? { initialGenre: ratingGenre } : {})}
        />
      ) : (
        <section
          className="experience-panel experience-summary"
          aria-labelledby="experience-summary-title"
        >
          <h3 id="experience-summary-title" className="text-xl font-semibold">
            Mi experiencia
          </h3>
          <div className="experience-summary-values">
            <p>
              Escucha guardada:{' '}
              <strong>{listeningLabels[personalEntry.listeningStatus]}</strong>
            </p>
            <p>
              Nota general guardada:{' '}
              <strong className="text-accent-text">
                {rating
                  ? formatScore(unitsToScore(rating.scoreUnits)) + ' / 10'
                  : 'Sin nota'}
              </strong>
            </p>
          </div>
          <p className="mt-3 text-sm text-muted">
            Edición de referencia:{' '}
            {rating?.referenceReleaseId
              ? releaseNames.get(rating.referenceReleaseId)
              : 'Sin edición de referencia'}
          </p>
          <GenreRatingsSummary
            labels={album.genres ?? []}
            ratings={personalLibrary.albumGenreRatings.filter(
              (row) => row.userAlbumId === personalEntry.id,
            )}
            releases={releaseNames}
            {...(ratingGenre ? { selected: ratingGenre } : {})}
          />
          {personalEntry.personalNotes ? (
            <p className="mt-4 whitespace-pre-wrap wrap-anywhere">
              {personalEntry.personalNotes}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Aún no has escrito un comentario.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={onExperienceOpen}
            >
              {rating ? 'Recalificar álbum' : 'Calificar álbum'}
            </button>
            <button
              type="button"
              className="action-button"
              disabled={busy}
              onClick={onExperienceOpen}
            >
              Editar experiencia
            </button>
          </div>
        </section>
      )}
      {library.audio ? (
        <AudioPanel
          key={personalEntry.id + snapshot.identity.createdAt}
          service={library.audio}
          snapshot={snapshot}
          entryId={personalEntry.id}
          blocked={busy}
          onBusyChange={onBusyChange}
          onCommitted={onExperienceCommitted}
        />
      ) : null}
      <details className="album-area" data-album-area="data">
        <summary>Datos del álbum</summary>
        <dl className="mt-5 grid gap-4 text-sm">
          <div>
            <dt className="text-muted">Publicación</dt>
            <dd>{publicationLabels[album.publicationStatus]}</dd>
          </div>
          <div>
            <dt className="text-muted">Géneros</dt>
            <dd>{album.genres?.join(' · ') || 'Sin registrar'}</dd>
          </div>
          <div>
            <dt className="text-muted">País de origen</dt>
            <dd>
              {creditedArtists.some((artist) => artist.country)
                ? creditedArtists
                    .map(
                      (artist) =>
                        artist.name +
                        ': ' +
                        (artist.country ?? 'Sin registrar'),
                    )
                    .join(' · ')
                : 'Sin registrar'}
            </dd>
          </div>
        </dl>
        {album.genres?.length ? (
          <GenreRenameForm
            snapshot={snapshot}
            albumId={album.id}
            library={library}
            blocked={busy}
            onBusyChange={onBusyChange}
            onCommitted={onExperienceCommitted}
          />
        ) : null}
        {album.description ? (
          <p className="mt-5 whitespace-pre-wrap wrap-anywhere">
            {album.description}
          </p>
        ) : null}
        {album.coverUrl ? (
          <a
            className="text-button mt-4 inline-block"
            href={album.coverUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Abrir enlace de portada
          </a>
        ) : null}
        <AlbumReferenceLinks album={album} artist={entry.artist} />
      </details>
      <details className="album-area" data-album-area="tracks">
        <summary>Pistas y ediciones</summary>
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
      </details>
      <details
        className="album-area"
        data-album-area="collection"
        open={collectionEditing || undefined}
      >
        <summary>Mi colección</summary>
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
      </details>
      <details className="album-area" data-album-area="actions">
        <summary>Más acciones: deseos y retirada</summary>
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
      </details>
    </section>
  )
}
