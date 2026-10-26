// @vitest-environment node
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { expect, test } from 'vitest'
import { makeBackup } from '../../domain/backup.fixture'
import { fixtureId, ids } from '../../domain/catalog/catalog.fixture'
import { AuditoriumDatabase, SCHEMA_V8 } from '../db/database'
import { IndexedDbRepository } from './indexeddb-repository'
import { toStoredUserAlbum } from '../db/records'
import { inspectNativeStorage } from '../../test/historical-storage.fixture'
import { legacySnapshotV6Fixture } from '../../test/legacy-backup.fixture'

test.each([
  'valid',
  'rows',
  'base',
  'pendingSnapshot',
  'pendingLocal',
  'recoveryLocal',
  'recoveryRemote',
])(
  'DB8 → DB9 valida filas y cada documento del checkpoint: %s',
  async (damage) => {
    const factory = new IDBFactory(),
      name = `rating-${damage}`,
      snapshot = makeBackup().data,
      historical = legacySnapshotV6Fixture(snapshot)
    const checkpoint = {
      key: 'cloud',
      revision: 8,
      base: structuredClone(historical),
      pending: {
        operationId: fixtureId(99000),
        expectedRevision: 8,
        snapshot: structuredClone(historical),
        localSnapshot: structuredClone(historical),
      },
      recovery: {
        local: structuredClone(historical),
        remote: structuredClone(historical),
      },
    }
    const targets = {
      rows: historical,
      base: checkpoint.base,
      pendingSnapshot: checkpoint.pending.snapshot,
      pendingLocal: checkpoint.pending.localSnapshot,
      recoveryLocal: checkpoint.recovery.local,
      recoveryRemote: checkpoint.recovery.remote,
    }
    if (damage !== 'valid')
      targets[
        damage as keyof typeof targets
      ].library.albumRatings[0]!.referenceReleaseId = ids.deluxe
    const old = new Dexie(name, { indexedDB: factory, IDBKeyRange })
    old.version(8).stores(SCHEMA_V8)
    await old.open()
    await old.transaction('rw', old.tables, async () => {
      for (const [table, rows] of Object.entries({
        ...historical.catalog,
        ...historical.library,
        metadata: [{ key: 'local_identity', ...historical.identity }],
        userAlbums: historical.library.userAlbums.map(toStoredUserAlbum),
        syncCheckpoint: [checkpoint],
      }))
        await old.table(table).bulkPut(rows)
    })
    old.close()
    const before = await inspectNativeStorage({ name, factory })
    const database = new AuditoriumDatabase(name, {
      indexedDB: factory,
      IDBKeyRange,
    })
    const repository = new IndexedDbRepository({ database })
    try {
      if (damage === 'valid') {
        const frame = await repository.readSyncFrame()
        expect(frame.snapshot).toEqual(snapshot)
        expect(frame.checkpoint).toEqual({
          ...checkpoint,
          base: snapshot,
          pending: { ...checkpoint.pending, snapshot, localSnapshot: snapshot },
          recovery: { local: snapshot, remote: snapshot },
        })
        expect(database.verno).toBe(11)
        expect(frame.snapshot.library.albumGenreRatings).toEqual([])
        expect(frame.snapshot.library.albumRatings[0]).not.toHaveProperty(
          'referenceReleaseId',
        )
      } else {
        await expect(repository.readSyncFrame()).rejects.toThrow()
        expect(await inspectNativeStorage({ name, factory })).toEqual(before)
      }
    } finally {
      database.close()
      await database.delete()
    }
  },
)
