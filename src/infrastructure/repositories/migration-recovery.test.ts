// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { LibraryBackups } from '../../application/library-backups'
import { parseBackupText } from '../../domain/backup'
import {
  AuditoriumDatabase,
  DATABASE_VERSION,
  SCHEMA_V3,
  SCHEMA_V4,
  SCHEMA_V5,
} from '../db/database'
import { IndexedDbRepository } from './indexeddb-repository'
import {
  historicalStores,
  historicalSnapshot,
  historicalRows,
  seedNativeStorage,
  inspectNativeStorage,
} from '../../test/historical-storage.fixture'

let factory: IDBFactory, databases: AuditoriumDatabase[]
beforeEach(() => {
  factory = new IDBFactory()
  databases = []
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of databases) database.close()
  for (const database of new Map(databases.map((db) => [db.name, db])).values())
    await database.delete()
})

test.each(['identity', 'rating'] as const)(
  'v5 dañada (%s) conserva esquema y filas al rechazar la migración v6',
  async (damaged) => {
    const snapshot = historicalSnapshot(3),
      stores = historicalStores(3)
    const rows = historicalRows(snapshot, stores)
    if (damaged === 'identity') rows['metadata'] = []
    else
      rows['albumRatings'] = [
        { ...snapshot.library.albumRatings[0], scoreUnits: 0 },
      ]
    await seedNativeStorage({
      name: 'migration-recovery',
      version: 50,
      stores,
      rows,
      factory,
    })
    const before = await inspectNativeStorage({
      name: 'migration-recovery',
      factory,
    })
    await expect(current().repository.readSnapshot()).rejects.toThrow()
    expect(
      await inspectNativeStorage({ name: 'migration-recovery', factory }),
    ).toEqual(before)
  },
)
function current(name = 'migration-recovery') {
  const database = new AuditoriumDatabase(name, {
    indexedDB: factory,
    IDBKeyRange,
  })
  databases.push(database)
  const createId = vi.fn(() => {
    throw new Error('Should not replace existing identity')
  })
  const now = vi.fn(() => {
    throw new Error('Should not replace existing date')
  })
  return {
    database,
    repository: new IndexedDbRepository({ database, createId, now }),
    createId,
    now,
  }
}
async function legacy(version: 1 | 2 | 3 | 4 | 5) {
  const historicalVersion = version >= 4 ? 3 : (version as 1 | 2 | 3)
  const snapshot = historicalSnapshot(historicalVersion),
    stores = historicalStores(historicalVersion)
  if (version >= 4)
    snapshot.catalog.albums[0]!.catalogReference = {
      provider: 'wikidata',
      entityId: 'Q999999999',
      retrievedAt: '2026-10-16T12:00:00.000Z',
    }
  await seedNativeStorage({
    name: 'migration-recovery',
    version: version * 10,
    stores,
    rows: historicalRows(snapshot, stores),
    factory,
  })
  return {
    snapshot,
    before: await inspectNativeStorage({ name: 'migration-recovery', factory }),
  }
}

test.each([1, 2, 3, 4, 5] as const)(
  'contrato histórico v%s conserva todas las filas, retirados e identidad al migrar y exportar',
  async (version) => {
    const { snapshot, before } = await legacy(version)
    const connection = current()
    const migrated = await connection.repository.readSnapshot()
    const after = await inspectNativeStorage({
      name: 'migration-recovery',
      factory,
    })
    expect(after.version).toBe(DATABASE_VERSION * 10)
    for (const [name, rows] of Object.entries(before.rows))
      expect(after.rows[name]).toEqual(rows)
    for (const definition of before.stores)
      expect(after.stores.find(({ name }) => name === definition.name)).toEqual(
        definition,
      )
    expect(migrated.identity).toEqual(snapshot.identity)
    expect(
      migrated.library.userAlbums.find((entry) => entry.deletedAt),
    ).toEqual(snapshot.library.userAlbums.find((entry) => entry.deletedAt))
    expect(migrated.library.purchaseWishes).toEqual(
      snapshot.library.purchaseWishes,
    )
    expect(migrated.library.ownedItems).toHaveLength(version >= 2 ? 1 : 0)
    expect(connection.createId).not.toHaveBeenCalled()
    expect(connection.now).not.toHaveBeenCalled()
    const exported = await new LibraryBackups(connection.repository).export()
    expect(parseBackupText(exported.text).data).toEqual(migrated)
    connection.repository.close()
    expect(await current().repository.readSnapshot()).toEqual(migrated)
  },
)

for (const version of [1, 2, 3, 4, 5] as const) {
  test.each([
    ['QuotaExceededError', 'quota_exceeded'],
    ['AbortError', 'aborted'],
  ] as const)(
    'v' + version + ' revierte esquema y filas si falla la migración con %s',
    async (name, code) => {
      const { before } = await legacy(version)
      let injected = false
      const connection = current()
      connection.database
        .version(DATABASE_VERSION)
        .upgrade(async (transaction) => {
          expect(await transaction.table('purchaseWishes').count()).toBe(
            version >= 3 ? 1 : 0,
          )
          injected = true
          throw new DOMException('Fictitious migration fault', name)
        })
      await expect(connection.repository.readSnapshot()).rejects.toMatchObject({
        code,
      })
      expect(injected).toBe(true)
      expect(
        await inspectNativeStorage({ name: 'migration-recovery', factory }),
      ).toEqual(before)
      expect(connection.createId).not.toHaveBeenCalled()
      connection.repository.close()
      expect((await current().repository.readSnapshot()).identity.userId).toBe(
        historicalSnapshot(version >= 4 ? 3 : (version as 1 | 2 | 3)).identity
          .userId,
      )
      expect(
        (await inspectNativeStorage({ name: 'migration-recovery', factory }))
          .version,
      ).toBe(DATABASE_VERSION * 10)
    },
  )
}

test('v5 conserva las trece tablas e índices v4 y persiste metadatos y portada sin cambiar UUID ni biblioteca personal', async () => {
  const { snapshot } = await legacy(4)
  const connection = current()
  await connection.repository.readSnapshot()
  const reference = {
    provider: 'wikidata' as const,
    entityId: 'Q999999999',
    retrievedAt: '2026-10-16T12:00:00.000Z',
    spotifyAlbumIds: ['a'.repeat(22)],
    youtubeVideoIds: ['ficticio_01'],
  }
  await connection.repository.mutate((currentSnapshot) => {
    currentSnapshot.catalog.albums[0]!.catalogReference = reference
    currentSnapshot.catalog.albums[0]!.genres = ['Metal', 'Progresivo']
    currentSnapshot.catalog.albums[0]!.coverImage =
      'data:image/png;base64,iVBORw0KGgo='
    currentSnapshot.catalog.artists[0]!.country = 'Chile'
    return { snapshot: currentSnapshot, result: undefined }
  })
  connection.repository.close()
  const reopened = await current().repository.readSnapshot()
  expect(reopened.identity).toEqual(snapshot.identity)
  expect(reopened.library).toEqual(snapshot.library)
  expect(reopened.catalog).toEqual({
    ...snapshot.catalog,
    artists: snapshot.catalog.artists.map((artist, index) =>
      index === 0 ? { ...artist, country: 'Chile' } : artist,
    ),
    albums: snapshot.catalog.albums.map((album, index) =>
      index === 0
        ? {
            ...album,
            catalogReference: reference,
            genres: ['Metal', 'Progresivo'],
            coverImage: 'data:image/png;base64,iVBORw0KGgo=',
          }
        : album,
    ),
  })
  expect(DATABASE_VERSION).toBe(6)
  expect(SCHEMA_V4).toEqual(SCHEMA_V3)
  expect(SCHEMA_V5).toEqual(SCHEMA_V4)
  const native = await inspectNativeStorage({
    name: 'migration-recovery',
    factory,
  })
  expect(native.version).toBe(60)
  expect(native.stores).toHaveLength(14)
  const openedAsV3 = factory.open('migration-recovery', 40)
  const failure = await new Promise<DOMException | null>((resolve) => {
    openedAsV3.onerror = () => resolve(openedAsV3.error)
    openedAsV3.onsuccess = () => {
      openedAsV3.result.close()
      resolve(null)
    }
  })
  expect(failure?.name).toBe('VersionError')
})

test.each(['unique', 'keyPath', 'multiEntry'] as const)(
  'contrato histórico alterado en %s se rechaza antes de cambiar esquema o datos',
  async (attribute) => {
    const stores = historicalStores(2)
    const active = stores
      .find((table) => table.name === 'userAlbums')
      ?.indexes.find((spec) => spec.name === 'activeAlbumKey')
    if (!active) throw new Error('Missing historical index')
    if (attribute === 'unique') active.unique = false
    if (attribute === 'keyPath') active.keyPath = ['userId', 'albumId']
    if (attribute === 'multiEntry') active.multiEntry = true
    await seedNativeStorage({
      name: 'migration-recovery',
      version: 20,
      stores,
      rows: historicalRows(historicalSnapshot(2), stores),
      factory,
    })
    const before = await inspectNativeStorage({
      name: 'migration-recovery',
      factory,
    })
    await expect(current().repository.readSnapshot()).rejects.toMatchObject({
      code: 'corrupt_data',
    })
    expect(
      await inspectNativeStorage({ name: 'migration-recovery', factory }),
    ).toEqual(before)
  },
)
