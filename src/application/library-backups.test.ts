// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { LibraryBackups } from './library-backups'
import { MusicLibrary } from './music-library'
import { makeBackup } from '../domain/backup.fixture'
import { MAX_BACKUP_BYTES, parseBackupText } from '../domain/backup'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { times, libraryIds } from '../domain/library/library.fixture'
import {
  AuditoriumDatabase,
  DATABASE_VERSION,
} from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { projectLibrary, projectRemovedAlbums } from './library-query'

let indexedDB: IDBFactory, databases: AuditoriumDatabase[]
beforeEach(() => {
  indexedDB = new IDBFactory()
  databases = []
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases) db.close()
  for (const db of new Map(databases.map((db) => [db.name, db])).values())
    await db.delete()
})
function connect(name: string, userId = fixtureId(901)) {
  const database = new AuditoriumDatabase(name, { indexedDB, IDBKeyRange })
  databases.push(database)
  const createId = vi.fn(() => userId)
  const repository = new IndexedDbRepository({
    database,
    createId,
    now: () => new Date(times.added),
  })
  return {
    database,
    repository,
    createId,
    backups: new LibraryBackups(repository, () => new Date(times.later)),
  }
}
async function source() {
  const source = connect('backup-source', libraryIds.user),
    data = makeBackup().data
  await source.repository.mutate(() => ({ snapshot: data, result: undefined }))
  return source
}
async function rows(database: AuditoriumDatabase) {
  return Object.fromEntries<unknown[]>(
    await Promise.all(
      database.tables.map(
        async (table) =>
          [table.name, (await table.toArray()) as unknown[]] as const,
      ),
    ),
  )
}
test('exportar y restaurar adopta identidad y todas las relaciones, incluidos retirados; reapertura y edición conservan IDs', async () => {
  const origin = await source(),
    before = await rows(origin.database),
    exported = await origin.backups.export()
  expect(parseBackupText(exported.text)).toEqual(exported.document)
  expect(await rows(origin.database)).toEqual(before)
  const target = connect('backup-target'),
    empty = await target.repository.readSnapshot()
  expect(empty.identity.userId).not.toBe(exported.document.data.identity.userId)
  const prepared = await target.backups.readFile({
    size: new TextEncoder().encode(exported.text).byteLength,
    text: () => Promise.resolve(exported.text),
  })
  expect(await target.repository.readSnapshot()).toEqual(empty)
  expect(await target.backups.restore(prepared, empty.identity)).toEqual(
    exported.document.data,
  )
  const restored = await target.repository.readSnapshot()
  expect(restored).toEqual(exported.document.data)
  expect(await rows(target.database)).toEqual(before)
  expect(await target.repository.open()).toEqual(
    exported.document.data.identity,
  )
  target.repository.close()
  expect(await target.repository.readSnapshot()).toEqual(restored)
  expect(target.createId).toHaveBeenCalledTimes(1)
  expect(target.database.verno).toBe(DATABASE_VERSION)
  expect(projectLibrary(restored).map((row) => row.id)).toEqual([
    libraryIds.entry,
  ])
  expect(projectRemovedAlbums(restored).map((row) => row.id)).toEqual([
    libraryIds.otherEntry,
  ])
  await new MusicLibrary(target.repository).rateAlbum(libraryIds.entry, 8.5)
  expect(
    (await target.repository.readSnapshot()).library.albumRatings.find(
      (row) => row.userAlbumId === libraryIds.entry,
    )?.scoreUnits,
  ).toBe(17)
})
test.each(['active', 'removed', 'catalog'])(
  'destino no vacío %s se rechaza sin cambiar ni mezclar datos',
  async (kind) => {
    const target = connect('nonempty', libraryIds.user),
      data = makeBackup().data
    if (kind === 'catalog') {
      const current = await target.repository.readSnapshot()
      data.library = current.library
    } else if (kind === 'removed')
      for (const entry of data.library.userAlbums) {
        entry.deletedAt = times.later
        entry.updatedAt = times.later
      }
    await target.repository.mutate(() => ({
      snapshot: data,
      result: undefined,
    }))
    const before = await target.repository.readSnapshot()
    await expect(
      target.backups.restore(makeBackup(), before.identity),
    ).rejects.toMatchObject({ code: 'not_empty' })
    expect(await target.repository.readSnapshot()).toEqual(before)
  },
)
test.each(['json', 'version', 'relations', 'size'])(
  'importación inválida %s se rechaza antes de llamar a restauración',
  async (kind) => {
    const target = connect('invalid-file'),
      before = await target.repository.readSnapshot(),
      restore = vi.spyOn(target.repository, 'restoreEmpty'),
      input = makeBackup()
    let text = JSON.stringify(input),
      size = new TextEncoder().encode(text).byteLength
    if (kind === 'json') text = '{'
    if (kind === 'version')
      text = JSON.stringify({ ...input, schemaVersion: 99 })
    if (kind === 'relations') {
      input.data.library.userAlbums[0]!.userId = fixtureId(902)
      text = JSON.stringify(input)
    }
    if (kind === 'size') size = MAX_BACKUP_BYTES + 1
    await expect(
      target.backups.readFile({ size, text: () => Promise.resolve(text) }),
    ).rejects.toThrow()
    expect(restore).not.toHaveBeenCalled()
    expect(await target.repository.readSnapshot()).toEqual(before)
  },
)
test('tamaño declarado excesivo no lee contenido; tamaño real UTF-8 también se comprueba', async () => {
  const target = connect('size-read'),
    text = vi.fn(() => Promise.resolve(''))
  await expect(
    target.backups.readFile({ size: MAX_BACKUP_BYTES + 1, text }),
  ).rejects.toMatchObject({ code: 'file_too_large' })
  expect(text).not.toHaveBeenCalled()
  await expect(
    target.backups.readFile({
      size: 1,
      text: () => Promise.resolve('é'.repeat(MAX_BACKUP_BYTES / 2 + 1)),
    }),
  ).rejects.toMatchObject({ code: 'file_too_large' })
})
test.each(['QuotaExceededError', 'AbortError'])(
  'fallo tardío %s revierte tablas y adopción de identidad; reintento restaura una vez',
  async (name) => {
    const target = connect('rollback'),
      before = await target.repository.readSnapshot(),
      raw = await rows(target.database)
    const failure = vi
      .spyOn(target.database.purchaseWishes, 'bulkPut')
      .mockRejectedValueOnce(new DOMException('Fallo ficticio', name))
    await expect(
      target.backups.restore(makeBackup(), before.identity),
    ).rejects.toMatchObject({
      code: name === 'AbortError' ? 'aborted' : 'quota_exceeded',
    })
    expect(await rows(target.database)).toEqual(raw)
    target.repository.close()
    expect(await target.repository.readSnapshot()).toEqual(before)
    failure.mockRestore()
    await target.backups.restore(makeBackup(), before.identity)
    expect(
      (await target.repository.readSnapshot()).library.ownedItems,
    ).toHaveLength(1)
    expect((await target.repository.readSnapshot()).identity.userId).toBe(
      libraryIds.user,
    )
  },
)
test('fallo de identidad antes de escribir tablas conserva el destino', async () => {
  const target = connect('metadata-failure'),
    before = await target.repository.readSnapshot()
  vi.spyOn(target.database.metadata, 'put').mockRejectedValueOnce(
    new DOMException('Quota ficticia', 'QuotaExceededError'),
  )
  await expect(
    target.backups.restore(makeBackup(), before.identity),
  ).rejects.toMatchObject({ code: 'quota_exceeded' })
  expect(await target.repository.readSnapshot()).toEqual(before)
})
test('alta concurrente después de preparar bloquea restauración; dos restauraciones competidoras no se mezclan', async () => {
  const first = connect('concurrent'),
    second = connect('concurrent'),
    before = await first.repository.readSnapshot()
  await new MusicLibrary(second.repository).createAlbum({
    title: 'Alta ficticia concurrente',
    artists: [{ name: 'Artista ficticio' }],
  })
  const populated = await second.repository.readSnapshot()
  await expect(
    first.backups.restore(makeBackup(), before.identity),
  ).rejects.toMatchObject({ code: 'not_empty' })
  expect(await first.repository.readSnapshot()).toEqual(populated)
  const a = connect('restore-race'),
    b = connect('restore-race'),
    empty = await a.repository.readSnapshot()
  const results = await Promise.allSettled([
    a.backups.restore(makeBackup(), empty.identity),
    b.backups.restore(makeBackup(), empty.identity),
  ])
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1)
  expect((await b.repository.readSnapshot()).library.ownedItems).toHaveLength(1)
})
test('otra restauración vacía que cambia identidad invalida la preparación anterior', async () => {
  const target = connect('identity-changed'),
    before = await target.repository.readSnapshot(),
    emptyBackup = makeBackup()
  for (const rows of Object.values(emptyBackup.data.catalog)) rows.splice(0)
  for (const rows of Object.values(emptyBackup.data.library)) rows.splice(0)
  await target.backups.restore(emptyBackup, before.identity)
  const adopted = await target.repository.readSnapshot()
  await expect(
    target.backups.restore(makeBackup(), before.identity),
  ).rejects.toMatchObject({ code: 'destination_changed' })
  expect(await target.repository.readSnapshot()).toEqual(adopted)
})
test('modelo inválido se rechaza antes de crear una base; mutaciones musicales aún prohíben cambiar identidad', async () => {
  const target = connect('before-open'),
    data = makeBackup().data
  data.library.ownedItems[0]!.releaseId = ids.missing
  await expect(
    target.repository.restoreEmpty(data, {
      userId: fixtureId(901),
      createdAt: times.added,
    }),
  ).rejects.toThrow()
  expect(await indexedDB.databases()).toEqual([])
  const before = await target.repository.readSnapshot()
  await expect(
    target.repository.mutate((snapshot) => ({
      snapshot: { ...snapshot, identity: makeBackup().data.identity },
      result: undefined,
    })),
  ).rejects.toThrow('identidad')
  expect(await target.repository.readSnapshot()).toEqual(before)
})
test('metadata ajena impide considerar vacía la biblioteca sin eliminarla', async () => {
  const target = connect('extra-metadata'),
    before = await target.repository.readSnapshot()
  await target.database
    .table<unknown, string>('metadata')
    .add({ key: 'extra-fixture', value: 'Dato ficticio' })
  const raw = await rows(target.database)
  await expect(
    target.backups.restore(makeBackup(), before.identity),
  ).rejects.toMatchObject({ code: 'not_empty' })
  expect(await rows(target.database)).toEqual(raw)
})
