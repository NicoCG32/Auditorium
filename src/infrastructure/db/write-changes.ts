import type { Table } from 'dexie'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { AuditoriumDatabase } from './database'
import { toStoredUserAlbum } from './records'

async function syncTable<T, K extends string | (string | number)[]>(
  table: Table<T, K>,
  before: T[],
  after: T[],
  keyOf: (row: T) => K,
) {
  const oldRows = new Map(
    before.map((row) => [JSON.stringify(keyOf(row)), row] as const),
  )
  const newRows = new Map(
    after.map((row) => [JSON.stringify(keyOf(row)), row] as const),
  )
  const changed = (key: string, row: T) =>
    JSON.stringify(oldRows.get(key)) !== JSON.stringify(row)
  const removed = before.filter((row) => {
    const key = JSON.stringify(keyOf(row))
    const next = newRows.get(key)
    return !newRows.has(key) || changed(key, next ?? row)
  })
  const written = after.filter((row) =>
    changed(JSON.stringify(keyOf(row)), row),
  )
  // Liberar primero las claves afectadas permite cambios de índices únicos.
  // El scope transaccional conserva los registros originales si algo falla.
  if (removed.length) await table.bulkDelete(removed.map(keyOf))
  if (written.length) await table.bulkPut(written)
}

export async function writeSnapshotChanges(
  database: AuditoriumDatabase,
  before: LocalSnapshot,
  after: LocalSnapshot,
): Promise<void> {
  await Promise.all([
    syncTable(
      database.artists,
      before.catalog.artists,
      after.catalog.artists,
      (row) => row.id,
    ),
    syncTable(
      database.albums,
      before.catalog.albums,
      after.catalog.albums,
      (row) => row.id,
    ),
    syncTable(
      database.albumArtists,
      before.catalog.albumArtists,
      after.catalog.albumArtists,
      (row): [string, string, string] => [row.albumId, row.artistId, row.role],
    ),
    syncTable(
      database.tracks,
      before.catalog.tracks,
      after.catalog.tracks,
      (row) => row.id,
    ),
    syncTable(
      database.coreTracks,
      before.catalog.coreTracks,
      after.catalog.coreTracks,
      (row): [string, number, number] => [
        row.albumId,
        row.discNumber,
        row.trackNumber,
      ],
    ),
    syncTable(
      database.releases,
      before.catalog.releases,
      after.catalog.releases,
      (row) => row.id,
    ),
    syncTable(
      database.releaseTracks,
      before.catalog.releaseTracks,
      after.catalog.releaseTracks,
      (row) => row.id,
    ),
    syncTable(
      database.userAlbums,
      before.library.userAlbums.map(toStoredUserAlbum),
      after.library.userAlbums.map(toStoredUserAlbum),
      (row) => row.id,
    ),
    syncTable(
      database.albumRatings,
      before.library.albumRatings,
      after.library.albumRatings,
      (row) => row.userAlbumId,
    ),
    syncTable(
      database.trackRatings,
      before.library.trackRatings,
      after.library.trackRatings,
      (row): [string, string] => [row.userAlbumId, row.trackId],
    ),
  ])
}
