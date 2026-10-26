import type { LocalSnapshot } from '../domain/repositories/local-repository'
import type { LibraryBackup } from '../domain/backup'

export function legacySnapshotFixture(snapshot: LocalSnapshot) {
  const legacy = legacySnapshotV6Fixture(snapshot)
  return {
    ...legacy,
    catalog: {
      ...snapshot.catalog,
      albums: snapshot.catalog.albums.map(
        ({ primaryType, categories, publicationStatus, ...album }) => {
          if (
            publicationStatus !== 'unknown' ||
            categories.length > 1 ||
            (categories.length > 0 && primaryType !== 'unspecified')
          )
            throw new Error(
              'Historical fixtures cannot infer publication status',
            )
          return {
            ...album,
            releaseType:
              primaryType === 'full_length' || primaryType === 'unspecified'
                ? (categories[0] ?? 'album')
                : primaryType,
          }
        },
      ),
    },
  }
}
export function legacySnapshotV6Fixture(snapshot: LocalSnapshot) {
  const { albumGenreRatings, ...library } = snapshot.library
  if (albumGenreRatings.length)
    throw new Error('Historical fixtures cannot discard genre ratings')
  return { ...snapshot, library }
}
export function legacyBackupFixture(
  backup: LibraryBackup,
  schemaVersion: number,
) {
  return { ...backup, schemaVersion, data: legacySnapshotFixture(backup.data) }
}
