// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { LibraryBackups } from '../../application/library-backups'
import { parseBackupText } from '../../domain/backup'
import { AuditoriumDatabase } from '../db/database'
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
async function legacy(version: 1 | 2) {
  const snapshot = historicalSnapshot(version),
    stores = historicalStores(version)
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

test.each([1, 2] as const)(
  'contrato histórico v%s conserva todas las filas, retirados e identidad al migrar y exportar',
  async (version) => {
    const { snapshot, before } = await legacy(version)
    const connection = current()
    const migrated = await connection.repository.readSnapshot()
    const after = await inspectNativeStorage({
      name: 'migration-recovery',
      factory,
    })
    expect(after.version).toBe(30)
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
    expect(migrated.library.purchaseWishes).toEqual([])
    expect(migrated.library.ownedItems).toHaveLength(version === 2 ? 1 : 0)
    expect(connection.createId).not.toHaveBeenCalled()
    expect(connection.now).not.toHaveBeenCalled()
    const exported = await new LibraryBackups(connection.repository).export()
    expect(parseBackupText(exported.text).data).toEqual(migrated)
    connection.repository.close()
    expect(await current().repository.readSnapshot()).toEqual(migrated)
  },
)

for (const version of [1, 2] as const) {
  test.each([
    ['QuotaExceededError', 'quota_exceeded'],
    ['AbortError', 'aborted'],
  ] as const)(
    'v' + version + ' revierte esquema y filas si falla la migración con %s',
    async (name, code) => {
      const { before } = await legacy(version)
      let injected = false
      const connection = current()
      connection.database.version(3).upgrade(async (transaction) => {
        expect(await transaction.table('purchaseWishes').count()).toBe(0)
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
        historicalSnapshot(version).identity.userId,
      )
      expect(
        (await inspectNativeStorage({ name: 'migration-recovery', factory }))
          .version,
      ).toBe(30)
    },
  )
}

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
