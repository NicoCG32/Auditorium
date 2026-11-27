// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, test, vi } from 'vitest'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import {
  collectionShortcutsBackup,
  shortcutsIds,
} from '../test/collection-shortcuts.fixture'
import { CollectionBatches } from './collection-batches'
import { MusicLibrary } from './music-library'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../domain/repositories/local-repository'

const databases: AuditoriumDatabase[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases) {
    db.close()
    await db.delete()
  }
  databases.length = 0
})
async function setup() {
  const db = new AuditoriumDatabase('collection-batch-test', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
  databases.push(db)
  const repository = new IndexedDbRepository({
    database: db,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  const backup = collectionShortcutsBackup()
  await repository.mutate(() => ({ snapshot: backup.data, result: undefined }))
  let nextId = 9500
  const options = {
    createId: () => fixtureId(nextId++),
    now: () => new Date(times.later),
  }
  return {
    db,
    repository,
    service: new CollectionBatches(repository, options),
    library: new MusicLibrary(repository, options),
  }
}
const selection = [libraryIds.entry, libraryIds.otherEntry, shortcutsIds.empty]

test('un lote guarda sólo los formatos ausentes en una transacción y conserva todos los demás datos al reabrir', async () => {
  const { db, repository, service } = await setup()
  const before = await repository.readSnapshot()
  const mutate = vi.spyOn(repository, 'mutate')
  const preview = await service.prepare(selection, {
    kind: 'own',
    format: 'cd',
  })
  expect(preview.rows.map((row) => row.change)).toEqual([false, true, true])
  expect(preview.changed).toBe(2)
  expect(await service.confirm(preview)).toEqual({ changed: 2, unchanged: 1 })
  expect(mutate).toHaveBeenCalledTimes(1)
  repository.close()
  const reopened = new IndexedDbRepository({ database: db })
  const after = await reopened.readSnapshot()
  expect(after.library.ownedItems).toEqual(
    expect.arrayContaining(before.library.ownedItems),
  )
  expect(
    after.library.ownedItems.filter(
      (row) => !before.library.ownedItems.some((old) => old.id === row.id),
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        userAlbumId: libraryIds.otherEntry,
        medium: 'physical',
        format: 'cd',
        createdAt: times.later,
      }),
      expect.objectContaining({
        userAlbumId: shortcutsIds.empty,
        medium: 'physical',
        format: 'cd',
        createdAt: times.later,
      }),
    ]),
  )
  expect({
    ...after,
    library: { ...after.library, ownedItems: before.library.ownedItems },
  }).toEqual(before)
  await expect(service.confirm(preview)).rejects.toThrow('Vuelve a revisar')
})

test('una descarga se registra como digital y no cambia escucha ni cumple deseos', async () => {
  const { repository, service } = await setup()
  const before = await repository.readSnapshot()
  await service.confirm(
    await service.prepare(selection, {
      kind: 'own',
      format: 'digital_download',
    }),
  )
  const after = await repository.readSnapshot()
  expect(
    after.library.ownedItems.filter((row) => row.format === 'digital_download'),
  ).toHaveLength(3)
  expect(
    after.library.ownedItems
      .filter((row) => row.format === 'digital_download')
      .every((row) => row.medium === 'purchased_digital'),
  ).toBe(true)
  expect({ ...after.library, ownedItems: before.library.ownedItems }).toEqual(
    before.library,
  )
})

test('un deseo activo de una edición equivale a su formato, los cumplidos no bloquean uno nuevo', async () => {
  const { repository, service, library } = await setup()
  const wish = await library.addPurchaseWish(libraryIds.otherEntry, {
    targetFormat: 'vinyl',
  })
  const owned = await library.addOwnedItem(libraryIds.otherEntry, {
    medium: 'physical',
    format: 'vinyl',
  })
  await library.setPurchaseWishStatus(wish, 'fulfilled', owned.id)
  const before = await repository.readSnapshot()
  const preview = await service.prepare(selection, {
    kind: 'wish',
    format: 'vinyl',
  })
  expect(preview.rows.map((row) => row.change)).toEqual([false, true, true])
  await service.confirm(preview)
  const after = await repository.readSnapshot()
  expect(after.library.purchaseWishes).toHaveLength(
    before.library.purchaseWishes.length + 2,
  )
  expect(after.library.purchaseWishes).toEqual(
    expect.arrayContaining(before.library.purchaseWishes),
  )
  expect({
    ...after.library,
    purchaseWishes: before.library.purchaseWishes,
  }).toEqual(before.library)
})

test('cambiar escucha conserva notas, enlaces, calificaciones y tablas ajenas', async () => {
  const { repository, service } = await setup()
  const before = await repository.readSnapshot()
  const preview = await service.prepare(selection, {
    kind: 'listening',
    status: 'completed',
  })
  expect(preview.changed).toBe(2)
  await service.confirm(preview)
  const after = await repository.readSnapshot()
  for (const old of before.library.userAlbums) {
    const actual = after.library.userAlbums.find((row) => row.id === old.id)!
    expect(actual).toEqual(
      selection.includes(old.id) && old.listeningStatus !== 'completed'
        ? { ...old, listeningStatus: 'completed', updatedAt: times.later }
        : old,
    )
  }
  expect({ ...after.library, userAlbums: before.library.userAlbums }).toEqual(
    before.library,
  )
})

test('un fallo de cuota tras preparar el lote revierte todas las tablas y permite revisar de nuevo', async () => {
  const { db, repository, service } = await setup()
  const before = await repository.readSnapshot()
  const preview = await service.prepare(selection, {
    kind: 'own',
    format: 'cassette',
  })
  const fail = vi
    .spyOn(db.ownedItems, 'bulkPut')
    .mockRejectedValue(new DOMException('Cuota ficticia', 'QuotaExceededError'))
  await expect(service.confirm(preview)).rejects.toMatchObject({
    code: 'quota_exceeded',
  })
  fail.mockRestore()
  expect(await repository.readSnapshot()).toEqual(before)
  await expect(
    service.confirm(
      await service.prepare(selection, { kind: 'own', format: 'cassette' }),
    ),
  ).resolves.toEqual({ changed: 3, unchanged: 0 })
})

test.each(['copia', 'deseo', 'escucha', 'retiro'] as const)(
  'un cambio concurrente de %s cancela el lote entero sin sobrescribirlo',
  async (kind) => {
    const { repository, service, library } = await setup()
    const action =
      kind === 'deseo'
        ? { kind: 'wish', format: 'cd' }
        : kind === 'escucha'
          ? { kind: 'listening', status: 'completed' }
          : { kind: 'own', format: 'cassette' }
    const preview = await service.prepare(selection, action)
    if (kind === 'copia')
      await library.addOwnedItem(libraryIds.otherEntry, {
        medium: 'physical',
        format: 'cassette',
      })
    if (kind === 'deseo')
      await library.addPurchaseWish(libraryIds.otherEntry, {
        targetFormat: 'cd',
      })
    if (kind === 'escucha')
      await library.updatePersonalExperience(libraryIds.entry, {
        listeningStatus: 'in_progress',
      })
    if (kind === 'retiro')
      await repository.mutate((snapshot) => {
        snapshot.library.userAlbums.find(
          (row) => row.id === libraryIds.otherEntry,
        )!.deletedAt = times.later
        return { snapshot, result: undefined }
      })
    const before = await repository.readSnapshot()
    await expect(service.confirm(preview)).rejects.toThrow('selección cambió')
    expect(await repository.readSnapshot()).toEqual(before)
  },
)

test('una nota concurrente o un formato diferente se conservan y no bloquean una adquisición compatible', async () => {
  const { repository, service, library } = await setup()
  const preview = await service.prepare(selection, {
    kind: 'own',
    format: 'cassette',
  })
  await library.updatePersonalExperience(libraryIds.entry, {
    listeningStatus: 'in_progress',
    personalNotes: 'Nota posterior a la revisión',
  })
  await library.addOwnedItem(libraryIds.otherEntry, {
    medium: 'physical',
    format: 'vinyl',
    notes: 'Adquisición posterior',
  })
  const before = await repository.readSnapshot()
  await service.confirm(preview)
  const after = await repository.readSnapshot()
  expect(after.library.ownedItems).toEqual(
    expect.arrayContaining(before.library.ownedItems),
  )
  expect({ ...after.library, ownedItems: before.library.ownedItems }).toEqual(
    before.library,
  )
})

test.each([
  { ids: [shortcutsIds.retired] },
  { ids: [fixtureId(9999)] },
  { ids: [] },
  { ids: [libraryIds.entry, libraryIds.entry] },
])(
  'rechaza selección ausente, retirada, vacía o duplicada $ids antes de escribir',
  async ({ ids }) => {
    const { repository, service } = await setup()
    const mutate = vi.spyOn(repository, 'mutate')
    await expect(
      service.prepare(ids, { kind: 'own', format: 'cd' }),
    ).rejects.toThrow()
    expect(mutate).not.toHaveBeenCalled()
  },
)

test('no acepta una revisión construida por el llamador ni una identidad reemplazada', async () => {
  const { repository } = await setup()
  let snapshot: LocalSnapshot = await repository.readSnapshot()
  const memory: TransactionalLocalRepository = {
    open: () => Promise.resolve(snapshot.identity),
    close: () => {},
    readSnapshot: () => Promise.resolve(structuredClone(snapshot)),
    mutate: (change) => {
      const next = change(structuredClone(snapshot))
      snapshot = next.snapshot
      return Promise.resolve(next.result)
    },
  }
  const service = new CollectionBatches(memory)
  const preview = await service.prepare(selection, {
    kind: 'own',
    format: 'other',
  })
  await expect(service.confirm(structuredClone(preview))).rejects.toThrow(
    'Vuelve a revisar',
  )
  snapshot.identity.createdAt = times.earlier
  const before = structuredClone(snapshot)
  await expect(service.confirm(preview)).rejects.toThrow('selección cambió')
  expect(snapshot).toEqual(before)
})

test('la validación de un lote no inventa referencias de edición', async () => {
  const { repository, service } = await setup()
  await service.confirm(
    await service.prepare([libraryIds.entry], { kind: 'own', format: 'vinyl' }),
  )
  const snapshot = await repository.readSnapshot()
  expect(
    snapshot.library.ownedItems.find(
      (row) => row.format === 'vinyl' && row.userAlbumId === libraryIds.entry,
    ),
  ).not.toHaveProperty('releaseId')
  expect(
    snapshot.catalog.releases.find((row) => row.id === ids.deluxe),
  ).toBeDefined()
})

test('dos revisiones simultáneas del mismo formato no crean copias duplicadas', async () => {
  const { repository, service } = await setup()
  const second = new CollectionBatches(repository)
  const action = { kind: 'own', format: 'cassette' }
  const firstPreview = await service.prepare(selection, action)
  const secondPreview = await second.prepare(selection, action)
  const results = await Promise.allSettled([
    service.confirm(firstPreview),
    second.confirm(secondPreview),
  ])
  expect(results.map((result) => result.status).toSorted()).toEqual([
    'fulfilled',
    'rejected',
  ])
  expect(
    (await repository.readSnapshot()).library.ownedItems.filter(
      (row) => row.format === 'cassette',
    ),
  ).toHaveLength(3)
})
