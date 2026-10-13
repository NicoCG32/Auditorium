// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import {
  makeContext,
  makeLibrary,
  libraryIds,
  times,
} from '../domain/library/library.fixture'
import { createLibrarySchema } from '../domain/library/library'
import { ids } from '../domain/catalog/catalog.fixture'
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
  const database = new AuditoriumDatabase('wishes-app', {
    indexedDB,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  if (seed)
    await repository.mutate((snapshot) => ({
      snapshot: {
        ...snapshot,
        catalog: makeContext().catalog,
        library: createLibrarySchema(makeContext()).parse(makeLibrary()),
      },
      result: undefined,
    }))
  return {
    database,
    repository,
    service: new MusicLibrary(repository, { now: () => new Date(times.later) }),
  }
}
test('crear, editar, cancelar, reactivar y cumplir persisten conservando todas las otras tablas', async () => {
  const { service, repository } = await setup()
  const copy = await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
    releaseId: ids.original,
  })
  const before = await repository.readSnapshot()
  const vinyl = await service.addPurchaseWish(libraryIds.entry, {
    targetFormat: 'vinyl',
    notes: '  Nota ficticia.\nLínea.  ',
  })
  const exact = await service.addPurchaseWish(libraryIds.entry, {
    targetReleaseId: ids.original,
  })
  let updated = await service.updatePurchaseWish(vinyl, {
    targetReleaseId: ids.deluxe,
    notes: '  ',
  })
  expect(updated).not.toHaveProperty('notes')
  expect(updated).not.toHaveProperty('targetFormat')
  updated = await service.setPurchaseWishStatus(updated, 'cancelled')
  expect(updated.status).toBe('cancelled')
  updated = await service.setPurchaseWishStatus(updated, 'active')
  expect(updated.status).toBe('active')
  await service.setPurchaseWishStatus(exact, 'fulfilled', copy.id)
  const after = await repository.readSnapshot()
  expect(after.library.purchaseWishes.map((row) => row.status).sort()).toEqual([
    'active',
    'fulfilled',
  ])
  expect({
    ...after,
    library: { ...after.library, purchaseWishes: [] },
  }).toEqual(before)
  repository.close()
  expect(await repository.readSnapshot()).toEqual(after)
})
test('comprar una copia deja deseos activos; eliminarla conserva incluso el cumplimiento histórico', async () => {
  const { service, repository } = await setup()
  const wishes = await Promise.all([
    service.addPurchaseWish(libraryIds.entry, { targetFormat: 'cd' }),
    service.addPurchaseWish(libraryIds.entry, { targetFormat: 'vinyl' }),
  ])
  const item = await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
  })
  expect(
    (await repository.readSnapshot()).library.purchaseWishes.every(
      (row) => row.status === 'active',
    ),
  ).toBe(true)
  await service.setPurchaseWishStatus(wishes[0], 'fulfilled', item.id)
  const before = await repository.readSnapshot()
  await service.removeOwnedItem(libraryIds.entry, item.id)
  expect((await repository.readSnapshot()).library.purchaseWishes).toEqual(
    before.library.purchaseWishes,
  )
})
test('faltantes, otro álbum, incompatibilidad y campos desconocidos se rechazan sin escrituras', async () => {
  const { service, repository } = await setup(),
    before = await repository.readSnapshot()
  for (const target of [
    {},
    { targetReleaseId: ids.missing },
    { targetReleaseId: ids.deluxe, targetFormat: 'cd' },
    { targetFormat: 'streaming' },
    { targetFormat: 'cd', status: 'fulfilled' },
  ])
    await expect(
      service.addPurchaseWish(libraryIds.entry, target),
    ).rejects.toThrow()
  await expect(
    service.addPurchaseWish(libraryIds.otherEntry, {
      targetReleaseId: ids.original,
    }),
  ).rejects.toThrow()
  expect(await repository.readSnapshot()).toEqual(before)
})
test('cuota y aborto revierten la transacción; reintento crea y cumple una vez', async () => {
  const { database, service, repository } = await setup(),
    before = await repository.readSnapshot()
  const failure = vi
    .spyOn(database.purchaseWishes, 'bulkPut')
    .mockRejectedValueOnce(
      new DOMException('Quota ficticia', 'QuotaExceededError'),
    )
  await expect(
    service.addPurchaseWish(libraryIds.entry, { targetFormat: 'cd' }),
  ).rejects.toMatchObject({ code: 'quota_exceeded' })
  expect(await repository.readSnapshot()).toEqual(before)
  const wish = await service.addPurchaseWish(libraryIds.entry, {
    targetFormat: 'cd',
  })
  const item = await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
  })
  const protectedSnapshot = await repository.readSnapshot()
  failure.mockRejectedValueOnce(
    new DOMException('Aborto ficticio', 'AbortError'),
  )
  await expect(
    service.setPurchaseWishStatus(wish, 'fulfilled', item.id),
  ).rejects.toMatchObject({ code: 'aborted' })
  expect(await repository.readSnapshot()).toEqual(protectedSnapshot)
  await service.setPurchaseWishStatus(wish, 'fulfilled', item.id)
  expect((await repository.readSnapshot()).library.purchaseWishes).toHaveLength(
    1,
  )
})
test('dos conexiones conservan altas; edición y cambios de estado obsoletos no sobrescriben', async () => {
  const first = await setup(),
    second = await setup(false)
  const [wish] = await Promise.all([
    first.service.addPurchaseWish(libraryIds.entry, { targetFormat: 'cd' }),
    second.service.addPurchaseWish(libraryIds.entry, { targetFormat: 'vinyl' }),
  ])
  await second.service.updatePurchaseWish(wish, {
    targetFormat: 'cd',
    notes: 'Nota nueva ficticia',
  })
  await expect(
    first.service.updatePurchaseWish(wish, { targetFormat: 'vinyl' }),
  ).rejects.toThrow()
  const cancelled = await first.service.setPurchaseWishStatus(wish, 'cancelled')
  expect(cancelled.notes).toBe('Nota nueva ficticia')
  await expect(
    second.service.setPurchaseWishStatus(wish, 'active'),
  ).rejects.toThrow()
  expect(
    (await second.repository.readSnapshot()).library.purchaseWishes,
  ).toHaveLength(2)
})
test('compra retirada después de la lectura rechaza el cumplimiento sin cambiar el deseo', async () => {
  const { service, repository } = await setup()
  const wish = await service.addPurchaseWish(libraryIds.entry, {
    targetFormat: 'cd',
  })
  const item = await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
  })
  await service.removeOwnedItem(libraryIds.entry, item.id)
  const before = await repository.readSnapshot()
  await expect(
    service.setPurchaseWishStatus(wish, 'fulfilled', item.id),
  ).rejects.toThrow()
  expect(await repository.readSnapshot()).toEqual(before)
})
