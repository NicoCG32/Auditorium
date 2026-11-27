import { backupSchema } from '../domain/backup'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'

export const shortcutsIds = {
  vinyl: fixtureId(9401),
  empty: fixtureId(9403),
  retired: fixtureId(9405),
}

/** Fictional collection with overlapping formats, an unowned album and a retired entry. */
export function collectionShortcutsBackup() {
  const backup = makeBackup()
  delete backup.data.library.userAlbums[1]!.deletedAt
  backup.data.library.ownedItems.push({
    id: fixtureId(9410),
    userAlbumId: libraryIds.otherEntry,
    medium: 'purchased_digital',
    format: 'digital_download',
    createdAt: times.updated,
  })
  const rows = [
    [9400, shortcutsIds.vinyl, 'Jardín lunar', false],
    [9402, shortcutsIds.empty, 'Ritos del horizonte', false],
    [9404, shortcutsIds.retired, 'Archivo retirado', true],
  ] as const
  for (const [albumNumber, entryId, title, retired] of rows) {
    const albumId = fixtureId(albumNumber)
    backup.data.catalog.albums.push({
      id: albumId,
      title,
      primaryType: 'full_length',
      catalogScope: 'personal',
      categories: [],
      publicationStatus: 'unknown',
    })
    backup.data.catalog.albumArtists.push({
      albumId,
      artistId: ids.artist,
      role: 'primary',
      position: 1,
    })
    backup.data.library.userAlbums.push({
      id: entryId,
      albumId,
      userId: libraryIds.user,
      listeningStatus: 'untracked',
      addedAt: times.added,
      updatedAt: times.updated,
      ...(retired ? { deletedAt: times.updated } : {}),
    })
  }
  backup.data.library.ownedItems.push({
    id: fixtureId(9411),
    userAlbumId: shortcutsIds.vinyl,
    medium: 'physical',
    format: 'vinyl',
    notes: 'Vinilo ficticio',
    createdAt: times.updated,
  })
  return backupSchema.parse(backup)
}
