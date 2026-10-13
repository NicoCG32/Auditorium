import {
  makeContext,
  makeLibrary,
  libraryIds,
  times,
} from './library/library.fixture'
import { createLibrarySchema } from './library/library'
import { fixtureId, ids } from './catalog/catalog.fixture'
import { BACKUP_SCHEMA_VERSION, backupSchema } from './backup'

export function makeBackup() {
  const context = makeContext(),
    input = makeLibrary()
  input.ownedItems = [
    {
      id: fixtureId(800),
      userAlbumId: libraryIds.entry,
      medium: 'physical',
      format: 'cd',
      releaseId: ids.original,
      notes: '  Copia ficticia.\nSegunda línea.  ',
      acquiredAt: '1998-01-01',
      createdAt: times.updated,
    },
  ]
  input.purchaseWishes = [
    {
      id: fixtureId(810),
      userAlbumId: libraryIds.entry,
      targetReleaseId: ids.deluxe,
      status: 'active',
      notes: '  Deseo ficticio.  ',
      createdAt: times.updated,
    },
  ]
  input.userAlbums[1] = {
    ...input.userAlbums[1]!,
    deletedAt: times.later,
    updatedAt: times.later,
  }
  return backupSchema.parse({
    format: 'auditorium-backup',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: times.later,
    data: {
      identity: { userId: libraryIds.user, createdAt: times.added },
      catalog: context.catalog,
      library: createLibrarySchema(context).parse(input),
    },
  })
}
