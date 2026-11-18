// @vitest-environment node
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { expect, test } from 'vitest'
import { makeBackup } from '../../domain/backup.fixture'
import { AuditoriumDatabase, SCHEMA_V11 } from '../db/database'
import { toStoredUserAlbum } from '../db/records'
import { IndexedDbRepository } from './indexeddb-repository'
import { inspectNativeStorage } from '../../test/historical-storage.fixture'
import { fixtureId } from '../../domain/catalog/catalog.fixture'
import { times } from '../../domain/library/library.fixture'

test.each([false, true])(
  'DB11 → DB12 conserva biblioteca y checkpoints; un campo futuro en el origen antiguo se rechaza: %s',
  async (damaged) => {
    const factory = new IDBFactory(),
      name = 'musicbrainz-migration'
    const snapshot = makeBackup().data
    const checkpoint = {
      key: 'cloud',
      revision: 3,
      base: snapshot,
      pending: {
        operationId: fixtureId(8000),
        expectedRevision: 3,
        snapshot,
        localSnapshot: snapshot,
      },
      recovery: { local: snapshot, remote: snapshot },
    }
    const previous = new Dexie(name, { indexedDB: factory, IDBKeyRange })
    previous.version(11).stores(SCHEMA_V11)
    await previous.open()
    const rows: Record<string, unknown[]> = {
      ...snapshot.catalog,
      ...snapshot.library,
      metadata: [{ key: 'local_identity', ...snapshot.identity }],
      userAlbums: snapshot.library.userAlbums.map(toStoredUserAlbum),
      syncCheckpoint: [checkpoint],
    }
    if (damaged)
      (rows.albums![0] as Record<string, unknown>).musicBrainz = {
        id: fixtureId(9000),
        retrievedAt: times.later,
      }
    await previous.transaction('rw', previous.tables, async () => {
      for (const table of previous.tables)
        await table.bulkPut(rows[table.name] ?? [])
    })
    previous.close()
    const before = await inspectNativeStorage({ name, factory })
    const database = new AuditoriumDatabase(name, {
      indexedDB: factory,
      IDBKeyRange,
    })
    const repository = new IndexedDbRepository({
      database,
      createId: () => {
        throw new Error('No debe cambiar la identidad')
      },
    })
    try {
      if (damaged) {
        await expect(repository.readSnapshot()).rejects.toThrow()
        database.close()
        expect(await inspectNativeStorage({ name, factory })).toEqual(before)
      } else {
        expect(await repository.readSyncFrame()).toEqual({
          snapshot,
          checkpoint,
        })
        const after = await inspectNativeStorage({ name, factory })
        expect(after.version).toBe(130)
        expect(after.rows).toEqual(before.rows)
        for (const name of ['artists', 'albums'])
          expect(
            after.stores.find((store) => store.name === name)?.indexes,
          ).toContainEqual({
            name: 'musicBrainz.id',
            keyPath: 'musicBrainz.id',
            unique: true,
            multiEntry: false,
          })
      }
    } finally {
      database.close()
      await database.delete()
    }
  },
)
