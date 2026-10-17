// @vitest-environment node
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, afterEach, expect, test } from 'vitest'
import {
  AuditoriumDatabase,
  DATABASE_VERSION,
  SCHEMA_V1,
  SCHEMA_V2,
  SCHEMA_V3,
} from '../db/database'
import { IndexedDbRepository } from './indexeddb-repository'
import { IDENTITY_KEY, toStoredUserAlbum } from '../db/records'
import {
  makeContext,
  makeLibrary,
  libraryIds,
  times,
} from '../../domain/library/library.fixture'
import { fixtureId, ids } from '../../domain/catalog/catalog.fixture'

let indexedDB: IDBFactory, databases: Dexie[]
beforeEach(() => {
  indexedDB = new IDBFactory()
  databases = []
})
afterEach(async () => {
  for (const db of databases) db.close()
  await databases[0]?.delete()
})
async function legacy(version: number, schema: Record<string, string>) {
  const db = new Dexie('wishes-migration', { indexedDB, IDBKeyRange })
  databases.push(db)
  db.version(version).stores(schema)
  await db.open()
  await db
    .table('metadata')
    .add({ key: IDENTITY_KEY, userId: libraryIds.user, createdAt: times.added })
  return db
}
function current() {
  const database = new AuditoriumDatabase('wishes-migration', {
    indexedDB,
    IDBKeyRange,
  })
  databases.push(database)
  return { database, repository: new IndexedDbRepository({ database }) }
}
async function rows(db: Dexie, names: string[]) {
  return Object.fromEntries<unknown[]>(
    await Promise.all(
      names.map(
        async (name) =>
          [name, await db.table<unknown, string>(name).toArray()] as const,
      ),
    ),
  )
}
test.each([
  [1, false],
  [1, true],
  [2, false],
  [2, true],
] as const)(
  'v%s poblada=%s migra al esquema actual sin modificar ninguna fila previa',
  async (version, populated) => {
    const schema = version === 1 ? SCHEMA_V1 : SCHEMA_V2,
      old = await legacy(version, schema)
    if (populated)
      await old.transaction('rw', old.tables, async () => {
        for (const [name, data] of Object.entries(makeContext().catalog))
          await old.table(name).bulkAdd(data)
        const library = makeLibrary()
        await old
          .table('userAlbums')
          .bulkAdd(library.userAlbums.map(toStoredUserAlbum))
        await old.table('albumRatings').bulkAdd(library.albumRatings)
        await old.table('trackRatings').bulkAdd(library.trackRatings)
        if (version === 2)
          await old.table('ownedItems').add({
            id: fixtureId(800),
            userAlbumId: libraryIds.entry,
            medium: 'physical',
            format: 'cd',
            releaseId: ids.original,
            notes: '  Ejemplar ficticio protegido.  ',
            createdAt: times.later,
          })
      })
    const names = Object.keys(schema),
      before = await rows(old, names)
    old.close()
    const next = current(),
      snapshot = await next.repository.readSnapshot()
    expect(next.database.backendDB().version).toBe(DATABASE_VERSION * 10)
    expect(snapshot.library.purchaseWishes).toEqual([])
    expect(snapshot.identity.userId).toBe(libraryIds.user)
    expect(await rows(next.database, names)).toEqual(before)
    expect(next.database.tables.map((table) => table.name).sort()).toEqual(
      Object.keys(SCHEMA_V3).sort(),
    )
  },
)
test('dos conexiones migran v2 conservando la misma identidad', async () => {
  const old = await legacy(2, SCHEMA_V2)
  old.close()
  const first = current(),
    second = current()
  const [a, b] = await Promise.all([
    first.repository.readSnapshot(),
    second.repository.readSnapshot(),
  ])
  expect(a).toEqual(b)
  expect(a.identity.userId).toBe(libraryIds.user)
})
test.each([2, 3])(
  'v%s con esquema anterior incompleto se rechaza sin reparar ni migrar',
  async (version) => {
    const old = await legacy(version, version === 2 ? SCHEMA_V1 : SCHEMA_V2),
      before = await rows(
        old,
        old.tables.map((table) => table.name),
      )
    old.close()
    await expect(current().repository.open()).rejects.toMatchObject({
      code: 'corrupt_data',
    })
    await old.open()
    expect(old.backendDB().version).toBe(version * 10)
    expect(
      await rows(
        old,
        old.tables.map((table) => table.name),
      ),
    ).toEqual(before)
  },
)
test('v2 con índice de ejemplares alterado no se repara automáticamente', async () => {
  const old = await legacy(2, {
    ...SCHEMA_V2,
    ownedItems: 'id, userAlbumId, releaseId, medium, format',
  })
  old.close()
  await expect(current().repository.open()).rejects.toMatchObject({
    code: 'corrupt_data',
  })
  await old.open()
  expect(old.backendDB().version).toBe(20)
  expect(
    old
      .table('ownedItems')
      .schema.indexes.some((spec) => spec.name === 'createdAt'),
  ).toBe(false)
})
test('v3 añade únicamente purchaseWishes; los esquemas históricos mantienen claves e índices', () => {
  const { purchaseWishes, ...previous } = SCHEMA_V3
  expect(previous).toEqual(SCHEMA_V2)
  expect(purchaseWishes).toBe(
    'id, userAlbumId, targetReleaseId, targetFormat, status, createdAt',
  )
})
