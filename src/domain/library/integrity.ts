import type { Catalog } from '../catalog/schemas'
import type { Library } from './schemas'
import { ownedItemMatchesRelease } from './owned-items'

export type LibraryRule =
  | 'duplicate_id'
  | 'duplicate_active_album'
  | 'missing_reference'
  | 'wrong_owner'
  | 'wrong_album'
  | 'duplicate_rating'
  | 'rating_before_entry'
  | 'inactive_entry'
  | 'outdated_change'
  | 'incompatible_release'
  | 'item_before_entry'

export interface LibraryIssue {
  rule: LibraryRule
  path: (string | number)[]
  message: string
}

export function getLibraryIssues(
  catalog: Catalog,
  library: Library,
  localUserId: string,
): LibraryIssue[] {
  const issues: LibraryIssue[] = []
  function report(
    rule: LibraryRule,
    path: LibraryIssue['path'],
    message: string,
  ) {
    issues.push({ rule, path, message })
  }
  const albumIds = new Set(catalog.albums.map((album) => album.id))
  const tracks = new Map(
    catalog.tracks.map((track) => [track.id, track] as const),
  )
  const entries = new Map<string, Library['userAlbums'][number]>()
  const activeAlbums = new Set<string>()
  const personalLinkIds = new Set<string>()

  library.userAlbums.forEach((entry, index) => {
    for (const [linkIndex, link] of (entry.links ?? []).entries()) {
      if (personalLinkIds.has(link.id))
        report(
          'duplicate_id',
          ['userAlbums', index, 'links', linkIndex, 'id'],
          'Identificador de enlace personal duplicado.',
        )
      personalLinkIds.add(link.id)
    }
    if (entries.has(entry.id)) {
      report('duplicate_id', ['userAlbums', index, 'id'], 'Entrada duplicada.')
    } else {
      entries.set(entry.id, entry)
    }
    if (entry.userId !== localUserId) {
      report(
        'wrong_owner',
        ['userAlbums', index, 'userId'],
        'La entrada pertenece a otra identidad local.',
      )
    }
    if (!albumIds.has(entry.albumId)) {
      report(
        'missing_reference',
        ['userAlbums', index, 'albumId'],
        'No existe el álbum referenciado.',
      )
    }
    if (entry.deletedAt === undefined) {
      const key = `${entry.userId}:${entry.albumId}`
      if (activeAlbums.has(key)) {
        report(
          'duplicate_active_album',
          ['userAlbums', index],
          'Ya existe una entrada activa para este álbum e identidad.',
        )
      }
      activeAlbums.add(key)
    }
  })

  function checkRatingReference(
    row: { userAlbumId: string; updatedAt: string },
    path: LibraryIssue['path'],
  ) {
    const entry = entries.get(row.userAlbumId)
    if (!entry) {
      report(
        'missing_reference',
        [...path, 'userAlbumId'],
        'No existe la entrada personal referenciada.',
      )
    } else if (row.updatedAt < entry.addedAt) {
      report(
        'rating_before_entry',
        [...path, 'updatedAt'],
        'La calificación no puede preceder al alta en biblioteca.',
      )
    }
    return entry
  }

  const ratedAlbums = new Set<string>()
  library.albumRatings.forEach((row, index) => {
    const entry = checkRatingReference(row, ['albumRatings', index])
    if (row.referenceReleaseId) {
      const release = catalog.releases.find(
        (release) => release.id === row.referenceReleaseId,
      )
      if (!release)
        report(
          'missing_reference',
          ['albumRatings', index, 'referenceReleaseId'],
          'No existe la edición de referencia.',
        )
      else if (entry && release.albumId !== entry.albumId)
        report(
          'wrong_album',
          ['albumRatings', index, 'referenceReleaseId'],
          'La edición de referencia pertenece a otro álbum.',
        )
    }
    if (ratedAlbums.has(row.userAlbumId)) {
      report(
        'duplicate_rating',
        ['albumRatings', index],
        'La entrada ya tiene una calificación de álbum.',
      )
    }
    ratedAlbums.add(row.userAlbumId)
  })
  const ratedTracks = new Set<string>()
  library.trackRatings.forEach((row, index) => {
    const entry = checkRatingReference(row, ['trackRatings', index])
    const track = tracks.get(row.trackId)
    if (!track) {
      report(
        'missing_reference',
        ['trackRatings', index, 'trackId'],
        'No existe la pista referenciada.',
      )
    } else if (entry && track.albumId !== entry.albumId) {
      report(
        'wrong_album',
        ['trackRatings', index, 'trackId'],
        'La pista no pertenece al álbum de la entrada personal.',
      )
    }
    const key = `${row.userAlbumId}:${row.trackId}`
    if (ratedTracks.has(key)) {
      report(
        'duplicate_rating',
        ['trackRatings', index],
        'La pista ya tiene una calificación en esta entrada.',
      )
    }
    ratedTracks.add(key)
  })
  const releases = new Map(
    catalog.releases.map((release) => [release.id, release]),
  )
  const ownedIds = new Set<string>()
  library.ownedItems.forEach((item, index) => {
    const path = ['ownedItems', index]
    if (ownedIds.has(item.id))
      report('duplicate_id', [...path, 'id'], 'Ejemplar duplicado por ID.')
    ownedIds.add(item.id)
    const entry = entries.get(item.userAlbumId)
    if (!entry)
      report(
        'missing_reference',
        [...path, 'userAlbumId'],
        'No existe la entrada del ejemplar.',
      )
    else if (item.createdAt < entry.addedAt)
      report(
        'item_before_entry',
        [...path, 'createdAt'],
        'El registro del ejemplar no puede preceder al alta en biblioteca.',
      )
    if (item.releaseId) {
      const release = releases.get(item.releaseId)
      if (!release)
        report(
          'missing_reference',
          [...path, 'releaseId'],
          'No existe la edición del ejemplar.',
        )
      else {
        if (entry && release.albumId !== entry.albumId)
          report(
            'wrong_album',
            [...path, 'releaseId'],
            'La edición pertenece a otro álbum.',
          )
        if (!ownedItemMatchesRelease(item, release))
          report(
            'incompatible_release',
            [...path, 'releaseId'],
            'La edición no es compatible con el medio y formato poseído.',
          )
      }
    }
  })
  const wishIds = new Set<string>()
  library.purchaseWishes.forEach((wish, index) => {
    const path = ['purchaseWishes', index]
    if (wishIds.has(wish.id))
      report('duplicate_id', [...path, 'id'], 'Deseo duplicado por ID.')
    wishIds.add(wish.id)
    const entry = entries.get(wish.userAlbumId)
    if (!entry)
      report(
        'missing_reference',
        [...path, 'userAlbumId'],
        'No existe la entrada del deseo.',
      )
    else if (wish.createdAt < entry.addedAt)
      report(
        'item_before_entry',
        [...path, 'createdAt'],
        'El deseo no puede preceder al alta en biblioteca.',
      )
    if (wish.targetReleaseId) {
      const release = releases.get(wish.targetReleaseId)
      if (!release)
        report(
          'missing_reference',
          [...path, 'targetReleaseId'],
          'No existe la edición deseada.',
        )
      else {
        if (entry && release.albumId !== entry.albumId)
          report(
            'wrong_album',
            [...path, 'targetReleaseId'],
            'La edición deseada pertenece a otro álbum.',
          )
        if (wish.targetFormat && wish.targetFormat !== release.format)
          report(
            'incompatible_release',
            [...path, 'targetFormat'],
            'El formato y la edición deseados no son compatibles.',
          )
      }
    }
  })
  return issues
}
