import { audioScope } from '../../domain/audio'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import type { AuditoriumDatabase } from './database'

// Called inside the same transaction as an edit, import, restore or sync.
export async function pruneCoverFiles(
  database: AuditoriumDatabase,
  snapshot: LocalSnapshot,
) {
  const scope = audioScope(snapshot.identity)
  const albums = new Map(snapshot.catalog.albums.map((row) => [row.id, row]))
  const stale = (await database.coverAttachments.toArray())
    .filter((row) => {
      const album = albums.get(row.albumId)
      return (
        row.scope !== scope ||
        !album ||
        album.coverImage ||
        album.coverUrl !== row.sourceUrl
      )
    })
    .map((row): [string, string] => [row.scope, row.albumId])
  if (stale.length) {
    await database.coverAttachments.bulkDelete(stale)
    await database.coverFiles.bulkDelete(stale)
  }
}
