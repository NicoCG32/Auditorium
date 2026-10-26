// @vitest-environment node
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { expect, test, vi } from 'vitest'
import { makeBackup } from '../../domain/backup.fixture'
import { legacySnapshotV6Schema } from '../../domain/backup'
import { audioItem, audioScope } from '../../domain/audio'
import { fixtureId, ids } from '../../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../../domain/library/library.fixture'
import {
  AuditoriumDatabase,
  SCHEMA_V1,
  SCHEMA_V2,
  SCHEMA_V3,
  SCHEMA_V4,
  SCHEMA_V5,
  SCHEMA_V6,
  SCHEMA_V7,
  SCHEMA_V8,
  SCHEMA_V9,
  SCHEMA_V10,
} from '../db/database'
import { toStoredUserAlbum } from '../db/records'
import { IndexedDbRepository } from './indexeddb-repository'
import { inspectNativeStorage } from '../../test/historical-storage.fixture'
import { legacySnapshotFixture } from '../../test/legacy-backup.fixture'
import { syntheticAudio } from '../../test/audio.fixture'

const historicalSchemas: Record<number, Record<string, string>> = {
  1: SCHEMA_V1,
  2: SCHEMA_V2,
  3: SCHEMA_V3,
  4: SCHEMA_V4,
  5: SCHEMA_V5,
  6: SCHEMA_V6,
  7: SCHEMA_V7,
  8: SCHEMA_V8,
  9: SCHEMA_V9,
  10: SCHEMA_V10,
}

async function historicalDatabase(version: number, damage?: string) {
  const factory = new IDBFactory()
  const name = `rate-genres-${version}-${damage ?? 'valid'}`
  const expected = makeBackup().data
  if (version < 2) expected.library.ownedItems = []
  if (version < 3) expected.library.purchaseWishes = []
  if (version >= 9)
    expected.library.albumRatings[0]!.referenceReleaseId = ids.deluxe
  const snapshot = legacySnapshotV6Schema.parse({
    ...expected,
    library: Object.fromEntries(
      Object.entries(expected.library).filter(
        ([key]) => key !== 'albumGenreRatings',
      ),
    ),
  })
  const stored = {
    ...snapshot,
    catalog:
      version < 8 ? legacySnapshotFixture(expected).catalog : snapshot.catalog,
  }
  const checkpoint = {
    key: 'cloud',
    revision: 7,
    base: structuredClone(stored),
    pending: {
      operationId: fixtureId(98100),
      expectedRevision: 7,
      snapshot: structuredClone(stored),
      localSnapshot: structuredClone(stored),
    },
    recovery: {
      local: structuredClone(stored),
      remote: structuredClone(stored),
    },
  }
  const targets = {
    rows: stored,
    base: checkpoint.base,
    pendingSnapshot: checkpoint.pending.snapshot,
    pendingLocal: checkpoint.pending.localSnapshot,
    recoveryLocal: checkpoint.recovery.local,
    recoveryRemote: checkpoint.recovery.remote,
  }
  if (damage)
    targets[
      damage as keyof typeof targets
    ].library.albumRatings[0]!.referenceReleaseId = ids.missing
  const previous = new Dexie(name, { indexedDB: factory, IDBKeyRange })
  previous.version(version).stores(historicalSchemas[version]!)
  await previous.open()
  const audio = await syntheticAudio()
  const scope = audioScope(snapshot.identity)
  const rows: Record<string, unknown[]> = {
    ...stored.catalog,
    ...stored.library,
    metadata: [{ key: 'local_identity', ...stored.identity }],
    userAlbums: stored.library.userAlbums.map(toStoredUserAlbum),
    syncCheckpoint: [checkpoint],
    audioAttachments: [
      { ...audioItem(audio), scope, userAlbumId: libraryIds.entry },
    ],
    audioFiles: [{ scope, id: audio.id, bytes: audio.bytes }],
  }
  await previous.transaction('rw', previous.tables, async () => {
    for (const table of previous.tables)
      await table.bulkPut(rows[table.name] ?? [])
  })
  previous.close()
  const database = new AuditoriumDatabase(name, {
    indexedDB: factory,
    IDBKeyRange,
  })
  const repository = new IndexedDbRepository({
    database,
    createId: () => {
      throw new Error('Migration must preserve the local identity')
    },
    now: () => {
      throw new Error('Migration must preserve timestamps')
    },
  })
  return { factory, name, database, repository, expected, checkpoint }
}

test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
  'DB%s reaches DB11 through frozen historical stages and preserves every existing row',
  async (version) => {
    const seeded = await historicalDatabase(version)
    const { factory, name, database, repository, expected, checkpoint } = seeded
    try {
      const before = await inspectNativeStorage({ name, factory })
      const frame = await repository.readSyncFrame()
      expect(frame.snapshot).toEqual(expected)
      expect(frame.snapshot.library.albumGenreRatings).toEqual([])
      if (version >= 6)
        expect(frame.checkpoint).toEqual({
          ...checkpoint,
          base: expected,
          pending: {
            ...checkpoint.pending,
            snapshot: expected,
            localSnapshot: expected,
          },
          recovery: { local: expected, remote: expected },
        })
      const after = await inspectNativeStorage({ name, factory })
      expect(after.version).toBe(110)
      expect(after.rows['albumGenreRatings']).toEqual([])
      for (const [table, rows] of Object.entries(before.rows))
        if (table !== 'albums' && table !== 'syncCheckpoint')
          expect(after.rows[table]).toEqual(rows)
      repository.close()
      expect(await repository.readSnapshot()).toEqual(expected)
    } finally {
      database.close()
      await database.delete()
    }
  },
)

test.each([
  'rows',
  'base',
  'pendingSnapshot',
  'pendingLocal',
  'recoveryLocal',
  'recoveryRemote',
])(
  'DB10 rejects invalid %s and rolls back schema, checkpoint and binary stores',
  async (damage) => {
    const { factory, name, database, repository } = await historicalDatabase(
      10,
      damage,
    )
    try {
      const before = await inspectNativeStorage({ name, factory })
      await expect(repository.readSyncFrame()).rejects.toMatchObject({
        code: 'corrupt_data',
      })
      expect(await inspectNativeStorage({ name, factory })).toEqual(before)
    } finally {
      database.close()
      await database.delete()
    }
  },
)

test('contextual key changes persist atomically with album genres and recover after a quota failure', async () => {
  const { database, repository } = await historicalDatabase(10)
  try {
    await repository.mutate((snapshot) => {
      snapshot.catalog.albums[0]!.genres = ['Metal']
      snapshot.library.albumGenreRatings.push({
        userAlbumId: libraryIds.entry,
        genreKey: 'metal',
        scoreUnits: 18,
        updatedAt: times.updated,
        referenceReleaseId: ids.original,
      })
      return { snapshot, result: undefined }
    })
    const before = await repository.readSnapshot()
    vi.spyOn(database.albumGenreRatings, 'bulkPut').mockRejectedValueOnce(
      new DOMException('Fictitious contextual quota', 'QuotaExceededError'),
    )
    const rename = () =>
      repository.mutate((snapshot) => {
        snapshot.catalog.albums[0]!.genres = ['Rock']
        snapshot.library.albumGenreRatings[0]!.genreKey = 'rock'
        return { snapshot, result: undefined }
      })
    await expect(rename()).rejects.toMatchObject({ code: 'quota_exceeded' })
    expect(await repository.readSnapshot()).toEqual(before)
    await rename()
    repository.close()
    const after = await repository.readSnapshot()
    expect(after.catalog.albums[0]!.genres).toEqual(['Rock'])
    expect(after.library.albumGenreRatings).toEqual([
      { ...before.library.albumGenreRatings[0], genreKey: 'rock' },
    ])
    expect(
      await database.albumGenreRatings.get([libraryIds.entry, 'metal']),
    ).toBeUndefined()
  } finally {
    vi.restoreAllMocks()
    database.close()
    await database.delete()
  }
})
