// @vitest-environment node
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { expect, test } from 'vitest'
import { makeBackup } from '../../domain/backup.fixture'
import { fixtureId } from '../../domain/catalog/catalog.fixture'
import { AuditoriumDatabase, SCHEMA_V12 } from '../db/database'
import { toStoredUserAlbum } from '../db/records'
import { IndexedDbRepository } from './indexeddb-repository'
import { inspectNativeStorage } from '../../test/historical-storage.fixture'

test.each([
  'valid',
  'snapshot',
  'base',
  'pending',
  'pendingLocal',
  'recoveryLocal',
  'recoveryRemote',
])(
  'DB12 → DB13 conserva filas y checkpoints o revierte campos futuros: %s',
  async (variant) => {
    const factory = new IDBFactory(),
      name = `edition-upgrade-${variant}`
    const snapshot = makeBackup().data
    const checkpoint = {
      key: 'cloud',
      revision: 3,
      base: structuredClone(snapshot),
      pending: {
        operationId: fixtureId(8500),
        expectedRevision: 3,
        snapshot: structuredClone(snapshot),
        localSnapshot: structuredClone(snapshot),
      },
      recovery: {
        local: structuredClone(snapshot),
        remote: structuredClone(snapshot),
      },
    }
    const bad =
      variant === 'snapshot'
        ? snapshot
        : variant === 'base'
          ? checkpoint.base
          : variant === 'pending'
            ? checkpoint.pending.snapshot
            : variant === 'pendingLocal'
              ? checkpoint.pending.localSnapshot
              : variant === 'recoveryLocal'
                ? checkpoint.recovery.local
                : checkpoint.recovery.remote
    if (variant !== 'valid')
      bad.catalog.releases[0]!.musicBrainz = {
        id: fixtureId(8501),
        retrievedAt: snapshot.identity.createdAt,
      }
    const previous = new Dexie(name, { indexedDB: factory, IDBKeyRange })
    previous.version(12).stores(SCHEMA_V12)
    await previous.open()
    const rows: Record<string, unknown[]> = {
      ...snapshot.catalog,
      ...snapshot.library,
      metadata: [{ key: 'local_identity', ...snapshot.identity }],
      userAlbums: snapshot.library.userAlbums.map(toStoredUserAlbum),
      syncCheckpoint: [checkpoint],
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
      }),
      repository = new IndexedDbRepository({ database })
    try {
      if (variant !== 'valid') {
        await expect(repository.readSnapshot()).rejects.toThrow()
        database.close()
        expect(await inspectNativeStorage({ name, factory })).toEqual(before)
      } else {
        expect(await repository.readSyncFrame()).toEqual({
          snapshot,
          checkpoint,
        })
        const after = await inspectNativeStorage({ name, factory })
        expect(after.version).toBe(140)
        expect(after.rows).toEqual({
          ...before.rows,
          coverAttachments: [],
          coverFiles: [],
        })
        expect(
          after.stores.find((row) => row.name === 'releases')?.indexes,
        ).toContainEqual({
          name: 'musicBrainz.id',
          keyPath: 'musicBrainz.id',
          unique: true,
          multiEntry: false,
        })
        expect(
          after.stores.find((row) => row.name === 'tracks')?.indexes,
        ).toContainEqual({
          name: '[albumId+musicBrainz.id]',
          keyPath: ['albumId', 'musicBrainz.id'],
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
