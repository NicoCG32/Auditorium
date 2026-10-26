// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { expect, test } from 'vitest'
import { AuditoriumDatabase } from '../db/database'
import { IndexedDbRepository } from './indexeddb-repository'
import { makeBackup } from '../../domain/backup.fixture'
import {
  classificationFromLegacy,
  legacyReleaseTypeSchema,
} from '../../domain/catalog/legacy-classification'
import { legacySnapshotFixture } from '../../test/legacy-backup.fixture'
import {
  historicalStores,
  seedNativeStorage,
  inspectNativeStorage,
} from '../../test/historical-storage.fixture'
import { fixtureId } from '../../domain/catalog/catalog.fixture'

async function seed(
  type: (typeof legacyReleaseTypeSchema.options)[number],
  damaged = false,
) {
  const factory = new IDBFactory(),
    snapshot = makeBackup().data
  snapshot.catalog.albums[0] = {
    ...snapshot.catalog.albums[0]!,
    ...classificationFromLegacy(type),
  }
  const legacy = legacySnapshotFixture(snapshot)
  legacy.catalog.albums[0]!.releaseType = type
  const checkpoint = {
    key: 'cloud',
    revision: 8,
    base: legacy,
    pending: {
      operationId: fixtureId(999),
      expectedRevision: 8,
      snapshot: legacy,
      localSnapshot: legacy,
    },
    recovery: { local: legacy, remote: legacy },
  }
  const rows = {
    metadata: [{ key: 'local_identity', ...snapshot.identity }],
    ...legacy.catalog,
    ...legacy.library,
    userAlbums: legacy.library.userAlbums.map((entry) => ({
      ...entry,
      activeAlbumKey: entry.deletedAt
        ? null
        : `${entry.userId}:${entry.albumId}`,
    })),
    syncCheckpoint: [
      damaged
        ? { ...checkpoint, base: { ...legacy, unknown: true } }
        : checkpoint,
    ],
  }
  await seedNativeStorage({
    name: 'classification',
    version: 70,
    factory,
    stores: [
      ...historicalStores(3),
      { name: 'syncCheckpoint', keyPath: 'key', indexes: [] },
    ],
    rows,
  })
  const database = new AuditoriumDatabase('classification', {
    indexedDB: factory,
    IDBKeyRange,
  })
  return {
    factory,
    snapshot,
    checkpoint,
    database,
    repository: new IndexedDbRepository({ database }),
  }
}
test.each(legacyReleaseTypeSchema.options)(
  'DB7 %s migra todos los documentos del checkpoint y conserva los demás registros',
  async (type) => {
    const { factory, snapshot, checkpoint, database, repository } =
      await seed(type)
    try {
      const before = await inspectNativeStorage({
        name: 'classification',
        factory,
      })
      const frame = await repository.readSyncFrame()
      expect(frame.snapshot).toEqual(snapshot)
      expect(frame.checkpoint).toEqual({
        ...checkpoint,
        base: snapshot,
        pending: { ...checkpoint.pending, snapshot, localSnapshot: snapshot },
        recovery: { local: snapshot, remote: snapshot },
      })
      const after = await inspectNativeStorage({
        name: 'classification',
        factory,
      })
      expect(after.version).toBe(110)
      expect(after.rows['albumGenreRatings']).toEqual([])
      for (const [name, rows] of Object.entries(before.rows))
        if (name !== 'albums' && name !== 'syncCheckpoint')
          expect(after.rows[name]).toEqual(rows)
      expect(
        after.stores
          .find((store) => store.name === 'albums')
          ?.indexes.map((index) => index.name)
          .sort(),
      ).toEqual(['originalYear', 'primaryType', 'title'])
    } finally {
      database.close()
      await database.delete()
    }
  },
)
test('un checkpoint inválido revierte tanto las filas como el reemplazo de índices', async () => {
  const { factory, database, repository } = await seed('demo', true)
  try {
    const before = await inspectNativeStorage({
      name: 'classification',
      factory,
    })
    await expect(repository.readSyncFrame()).rejects.toThrow()
    expect(
      await inspectNativeStorage({ name: 'classification', factory }),
    ).toEqual(before)
  } finally {
    database.close()
    await database.delete()
  }
})
