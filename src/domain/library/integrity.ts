import type { Catalog } from '../catalog/schemas'
import type { Library } from './schemas'

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

  library.userAlbums.forEach((entry, index) => {
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
    checkRatingReference(row, ['albumRatings', index])
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
  return issues
}
