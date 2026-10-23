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
      snapshot = makeBackup().data
    const checkpoint = {
      key: 'cloud',
      revision: 8,
      base: structuredClone(snapshot),
      pending: {
        operationId: fixtureId(99000),
        expectedRevision: 8,
        snapshot: structuredClone(snapshot),
        localSnapshot: structuredClone(snapshot),
      },
      recovery: {
        local: structuredClone(snapshot),
        remote: structuredClone(snapshot),
      },
    }
    const targets = {
      rows: snapshot,
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
        ...snapshot.catalog,
        ...snapshot.library,
        metadata: [{ key: 'local_identity', ...snapshot.identity }],
        userAlbums: snapshot.library.userAlbums.map(toStoredUserAlbum),
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
        expect(frame.checkpoint).toEqual(checkpoint)
        expect(database.verno).toBe(9)
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
