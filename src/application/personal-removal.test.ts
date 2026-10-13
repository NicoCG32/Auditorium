// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  makeContext,
  makeLibrary,
  libraryIds,
  times,
} from '../domain/library/library.fixture'
import { ids } from '../domain/catalog/catalog.fixture'
import { createLibrarySchema } from '../domain/library/library'
import { personalEntryToken } from '../domain/library/personal-entry'
import { projectLibrary, projectRemovedAlbums } from './library-query'
import {
  AuditoriumDatabase,
  DATABASE_VERSION,
} from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { MusicLibrary } from './music-library'

let databases: AuditoriumDatabase[], indexedDB: IDBFactory
beforeEach(() => {
  databases = []
  indexedDB = new IDBFactory()
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases) db.close()
  await databases[0]?.delete()
})
async function setup(seed = true) {
  const database = new AuditoriumDatabase('personal-removal', {
    indexedDB,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  const service = new MusicLibrary(repository, {
    now: () => new Date(times.later),
  })
  if (seed) {
    const context = makeContext()
    await repository.mutate((snapshot) => ({
      snapshot: {
        ...snapshot,
        catalog: context.catalog,
        library: createLibrarySchema(context).parse(makeLibrary()),
      },
      result: undefined,
    }))
    await service.addOwnedItem(libraryIds.entry, {
      medium: 'physical',
      format: 'cd',
      releaseId: ids.original,
      notes: '  Copia ficticia.\nOtra línea.  ',
    })
    await service.addPurchaseWish(libraryIds.entry, {
      targetReleaseId: ids.deluxe,
      notes: '  Deseo ficticio.  ',
    })
  }
  return { database, repository, service }
}
test('baja y restauración persisten con mismo ID y datos; solo cambia fila personal e índice activo', async () => {
  const { database, repository, service } = await setup(),
    before = await repository.readSnapshot()
  const names = database.tables
    .map((table) => table.name)
    .filter((name) => name !== 'userAlbums')
  const raw = async () =>
    Object.fromEntries<unknown[]>(
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
  const protectedRows = await raw()
  await service.removePersonalAlbum(
    libraryIds.entry,
    personalEntryToken(before.library, libraryIds.entry),
  )
  expect(
    projectLibrary(await repository.readSnapshot()).map((row) => row.id),
  ).toEqual([libraryIds.otherEntry])
  expect(
    projectRemovedAlbums(await repository.readSnapshot()).map((row) => row.id),
  ).toEqual([libraryIds.entry])
  expect(
    (await database.userAlbums.get(libraryIds.entry))?.activeAlbumKey,
  ).toBeNull()
  expect(await raw()).toEqual(protectedRows)
  repository.close()
  const removed = await repository.readSnapshot()
  expect(removed.library.userAlbums[0]?.deletedAt).toBe(times.later)
  await service.restorePersonalAlbum(
    libraryIds.entry,
    personalEntryToken(removed.library, libraryIds.entry),
  )
  const after = await repository.readSnapshot()
  expect(after).toEqual({
    ...before,
    library: {
      ...before.library,
      userAlbums: before.library.userAlbums.map((row) =>
        row.id === libraryIds.entry ? { ...row, updatedAt: times.later } : row,
      ),
    },
  })
  expect(
    (await database.userAlbums.get(libraryIds.entry))?.activeAlbumKey,
  ).toBe(`${libraryIds.user}:${ids.album}`)
  expect(await raw()).toEqual(protectedRows)
  expect(database.verno).toBe(DATABASE_VERSION)
  repository.close()
  expect(await repository.readSnapshot()).toEqual(after)
})
test.each(['remove', 'restore'])(
  'cuota y aborto en %s revierten la baja y conservan filas previas',
  async (operation) => {
    const { database, repository, service } = await setup()
    if (operation === 'restore') {
      const snapshot = await repository.readSnapshot()
      await service.removePersonalAlbum(
        libraryIds.entry,
        personalEntryToken(snapshot.library, libraryIds.entry),
      )
    }
    const before = await repository.readSnapshot(),
      token = personalEntryToken(before.library, libraryIds.entry)
    const action = () =>
      operation === 'remove'
        ? service.removePersonalAlbum(libraryIds.entry, token)
        : service.restorePersonalAlbum(libraryIds.entry, token)
    const failure = vi.spyOn(database.userAlbums, 'bulkPut')
    for (const [name, code] of [
      ['QuotaExceededError', 'quota_exceeded'],
      ['AbortError', 'aborted'],
    ]) {
      failure.mockRejectedValueOnce(new DOMException('Fallo ficticio', name))
      await expect(action()).rejects.toMatchObject({ code })
      expect(await repository.readSnapshot()).toEqual(before)
    }
    await action()
    expect(
      (await repository.readSnapshot()).library.userAlbums[0]?.deletedAt,
    ).toBe(operation === 'remove' ? times.later : undefined)
  },
)
test('copia nueva en otra conexión invalida las consecuencias confirmadas; nuevo intento conserva todo', async () => {
  const first = await setup(),
    second = await setup(false),
    before = await first.repository.readSnapshot()
  const token = personalEntryToken(before.library, libraryIds.entry)
  await second.service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
  })
  const updated = await second.repository.readSnapshot()
  await expect(
    first.service.removePersonalAlbum(libraryIds.entry, token),
  ).rejects.toMatchObject({ rule: 'outdated_change' })
  expect(await first.repository.readSnapshot()).toEqual(updated)
  await first.service.removePersonalAlbum(
    libraryIds.entry,
    personalEntryToken(updated.library, libraryIds.entry),
  )
  expect((await second.repository.readSnapshot()).library.ownedItems).toEqual(
    updated.library.ownedItems,
  )
})
test('alta nueva del mismo álbum impide restaurar y conserva ambas entradas sin fusionarlas', async () => {
  const first = await setup(),
    second = await setup(false),
    before = await first.repository.readSnapshot()
  await first.service.removePersonalAlbum(
    libraryIds.entry,
    personalEntryToken(before.library, libraryIds.entry),
  )
  const newEntry = await second.service.addAlbumToLibrary(ids.album),
    current = await first.repository.readSnapshot()
  expect(newEntry.id).not.toBe(libraryIds.entry)
  await expect(
    first.service.restorePersonalAlbum(
      libraryIds.entry,
      personalEntryToken(current.library, libraryIds.entry),
    ),
  ).rejects.toMatchObject({ rule: 'duplicate_active_album' })
  expect(await second.repository.readSnapshot()).toEqual(current)
})
test.each([false, true])(
  'ediciones referenciadas por copias y deseos no pueden borrarse aunque retirada=%s',
  async (removed) => {
    const { repository, service } = await setup()
    if (removed) {
      const snapshot = await repository.readSnapshot()
      await service.removePersonalAlbum(
        libraryIds.entry,
        personalEntryToken(snapshot.library, libraryIds.entry),
      )
    }
    const before = await repository.readSnapshot()
    for (const releaseId of [ids.original, ids.deluxe]) {
      await expect(
        repository.mutate((snapshot) => {
          snapshot.catalog.releases = snapshot.catalog.releases.filter(
            (row) => row.id !== releaseId,
          )
          snapshot.catalog.releaseTracks =
            snapshot.catalog.releaseTracks.filter(
              (row) => row.releaseId !== releaseId,
            )
          return { snapshot, result: undefined }
        }),
      ).rejects.toThrow()
      expect(await repository.readSnapshot()).toEqual(before)
    }
  },
)
test('quitar notas con valor obsoleto no borra las valoraciones vigentes', async () => {
  const { repository, service } = await setup()
  await service.rateAlbum(libraryIds.entry, 10)
  await service.rateTrack(libraryIds.entry, ids.eclipse, 10)
  const before = await repository.readSnapshot()
  await expect(
    service.removeAlbumRating(libraryIds.entry, 9.5),
  ).rejects.toMatchObject({ rule: 'outdated_change' })
  await expect(
    service.removeTrackRating(libraryIds.entry, ids.eclipse, 9),
  ).rejects.toMatchObject({ rule: 'outdated_change' })
  expect(await repository.readSnapshot()).toEqual(before)
})
