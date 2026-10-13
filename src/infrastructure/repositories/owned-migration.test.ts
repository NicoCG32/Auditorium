// @vitest-environment node
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, afterEach, expect, test } from 'vitest'
import {
  AuditoriumDatabase,
  DATABASE_VERSION,
  SCHEMA_V1,
  SCHEMA_V2,
} from '../db/database'
import { IDENTITY_KEY, toStoredUserAlbum } from '../db/records'
import { IndexedDbRepository } from './indexeddb-repository'
import {
  makeContext,
  makeLibrary,
  libraryIds,
  times,
} from '../../domain/library/library.fixture'

let indexedDB: IDBFactory, databases: Dexie[]
beforeEach(() => {
  indexedDB = new IDBFactory()
  databases = []
})
afterEach(async () => {
  for (const database of databases) database.close()
  await databases[0]?.delete()
})
async function legacy(schema: Record<string, string> = SCHEMA_V1, version = 1) {
  const database = new Dexie('owned-migration', { indexedDB, IDBKeyRange })
  databases.push(database)
  database.version(version).stores(schema)
  await database.open()
  await database
    .table('metadata')
    .add({ key: IDENTITY_KEY, userId: libraryIds.user, createdAt: times.added })
  return database
}
function current() {
  const database = new AuditoriumDatabase('owned-migration', {
    indexedDB,
    IDBKeyRange,
  })
  databases.push(database)
  return { database, repository: new IndexedDbRepository({ database }) }
}
async function rows(database: Dexie, names: string[]) {
  return Object.fromEntries<unknown[]>(
    await Promise.all(
      names.map(
        async (name) =>
          [
            name,
            await database.table<unknown, string>(name).toArray(),
          ] as const,
      ),
    ),
  )
}
test.each([false, true])(
  'migra v1 poblada=%s conservando todas las filas e identidad',
  async (populated) => {
    const old = await legacy()
    if (populated) {
      const catalog = makeContext().catalog,
        library = makeLibrary()
      await old.transaction('rw', old.tables, async () => {
        for (const [name, data] of Object.entries(catalog))
          await old.table(name).bulkAdd(data)
        await old
          .table('userAlbums')
          .bulkAdd(library.userAlbums.map(toStoredUserAlbum))
        await old.table('albumRatings').bulkAdd(library.albumRatings)
        await old.table('trackRatings').bulkAdd(library.trackRatings)
      })
    }
    const names = Object.keys(SCHEMA_V1),
      before = await rows(old, names)
    old.close()
    const next = current(),
      snapshot = await next.repository.readSnapshot()
    expect(next.database.backendDB().version).toBe(DATABASE_VERSION * 10)
    expect(snapshot.identity.userId).toBe(libraryIds.user)
    expect(snapshot.library.ownedItems).toEqual([])
    expect(await rows(next.database, names)).toEqual(before)
  },
)
test('apertura concurrente desde v1 conserva la misma identidad y esquema actual', async () => {
  const old = await legacy()
  old.close()
  const first = current(),
    second = current()
  const snapshots = await Promise.all([
    first.repository.readSnapshot(),
    second.repository.readSnapshot(),
  ])
  expect(snapshots[0]).toEqual(snapshots[1])
  expect(snapshots[0].identity.userId).toBe(libraryIds.user)
  expect(first.database.backendDB().version).toBe(DATABASE_VERSION * 10)
})
test('v1 incompleta se rechaza sin subir versión ni reparar tablas', async () => {
  const { trackRatings: omitted, ...schema } = SCHEMA_V1
  expect(omitted).toBeTruthy()
  const old = await legacy(schema)
  old.close()
  await expect(current().repository.open()).rejects.toMatchObject({
    code: 'corrupt_data',
  })
  await old.open()
  expect(old.backendDB().version).toBe(10)
  expect(await old.table('metadata').count()).toBe(1)
  expect(old.tables.some((table) => table.name === 'ownedItems')).toBe(false)
})
test('v2 sin tabla de ejemplares se rechaza sin recrearla', async () => {
  const old = await legacy(SCHEMA_V1, 2)
  old.close()
  await expect(current().repository.open()).rejects.toMatchObject({
    code: 'corrupt_data',
  })
  await old.open()
  expect(old.backendDB().version).toBe(20)
  expect(old.tables.some((table) => table.name === 'ownedItems')).toBe(false)
})
test('versión intermedia desconocida no se migra automáticamente', async () => {
  const old = await legacy(SCHEMA_V1, 1.5)
  old.close()
  await expect(current().repository.open()).rejects.toMatchObject({
    code: 'version_mismatch',
  })
  await old.open()
  expect(old.backendDB().version).toBe(15)
})
test('esquema v2 añade solo ownedItems a v1 y conserva claves e índices anteriores', () => {
  const { ownedItems, ...original } = SCHEMA_V2
  expect(original).toEqual(SCHEMA_V1)
  expect(ownedItems).toBe(
    'id, userAlbumId, releaseId, medium, format, createdAt',
  )
})
