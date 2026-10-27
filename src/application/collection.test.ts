// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, test } from 'vitest'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import {
  makeContext,
  makeLibrary,
  libraryIds,
  times,
} from '../domain/library/library.fixture'
import { ids } from '../domain/catalog/catalog.fixture'
import { createLibrarySchema } from '../domain/library/library'
import { MusicLibrary } from './music-library'
import { projectLibrary } from './library-query'
import { experienceExpected } from './album-experience'
import { defaultCollectionFilters, queryCollection } from './collection-query'

const databases: AuditoriumDatabase[] = []
afterEach(async () => {
  for (const db of databases) {
    db.close()
    await db.delete()
  }
  databases.length = 0
})
async function setup() {
  const database = new AuditoriumDatabase('collection-test', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  const context = makeContext()
  await repository.mutate((snapshot) => ({
    snapshot: {
      ...snapshot,
      catalog: context.catalog,
      library: createLibrarySchema(context).parse(makeLibrary()),
    },
    result: undefined,
  }))
  return {
    repository,
    service: new MusicLibrary(repository, { now: () => new Date(times.later) }),
  }
}
test('editar una copia conserva su identidad, la edición compartida y todas las otras tablas', async () => {
  const { repository, service } = await setup()
  const first = await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
    releaseId: ids.original,
    notes: '  Primera.\nFicticia.  ',
    mediaCondition: 'mint',
  })
  const second = await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
    releaseId: ids.original,
  })
  const before = await repository.readSnapshot()
  const updated = await service.updateOwnedItem(first, {
    medium: 'physical',
    format: 'vinyl',
    releaseId: ids.deluxe,
    acquiredAt: '2000-02-29',
    notes: '  Otra nota.  ',
  })
  expect(updated).toEqual({
    id: first.id,
    userAlbumId: first.userAlbumId,
    createdAt: first.createdAt,
    medium: 'physical',
    format: 'vinyl',
    releaseId: ids.deluxe,
    acquiredAt: '2000-02-29',
    notes: '  Otra nota.  ',
  })
  const after = await repository.readSnapshot()
  expect({
    ...after,
    library: { ...after.library, ownedItems: before.library.ownedItems },
  }).toEqual(before)
  expect(after.library.ownedItems.find((row) => row.id === second.id)).toEqual(
    second,
  )
})
test('compra digital compatible no conserva condiciones físicas ni inventa una escucha o deseo cumplido', async () => {
  const { repository, service } = await setup()
  const release = await service.addRelease({
    albumId: ids.album,
    format: 'digital',
    editionLabel: 'Deluxe digital',
  })
  const item = await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
    mediaCondition: 'good',
  })
  const wish = await service.addPurchaseWish(libraryIds.entry, {
    targetFormat: 'digital',
  })
  const before = await repository.readSnapshot()
  const updated = await service.updateOwnedItem(item, {
    medium: 'purchased_digital',
    format: 'digital_download',
    releaseId: release.id,
    notes: '',
  })
  expect(updated).not.toHaveProperty('mediaCondition')
  expect(updated).not.toHaveProperty('notes')
  expect(
    (await repository.readSnapshot()).library.purchaseWishes,
  ).toContainEqual(wish)
  expect((await repository.readSnapshot()).library.userAlbums).toEqual(
    before.library.userAlbums,
  )
})
test.each(['editar', 'eliminar'])(
  'CAS completo impide %s una copia cambiada y no toca los datos',
  async (action) => {
    const { repository, service } = await setup()
    const item = await service.addOwnedItem(libraryIds.entry, {
      medium: 'physical',
      format: 'cd',
    })
    await service.updateOwnedItem(item, {
      medium: 'physical',
      format: 'cd',
      notes: 'Cambio desde otro dispositivo',
    })
    const before = await repository.readSnapshot()
    await expect(
      action === 'editar'
        ? service.updateOwnedItem(item, {
            medium: 'physical',
            format: 'cd',
            notes: 'Borrador antiguo',
          })
        : service.removeOwnedItem(item.userAlbumId, item.id, item),
    ).rejects.toThrow('cambió después de leerlo')
    expect(await repository.readSnapshot()).toEqual(before)
  },
)
test.each([
  { medium: 'physical', format: 'cd', releaseId: ids.deluxe },
  {
    medium: 'purchased_digital',
    format: 'digital_download',
    mediaCondition: 'mint',
  },
  { medium: 'physical', format: 'cd', acquiredAt: '2026-02-29' },
])(
  'edición rechaza incompatibilidad o fecha inválida %# sin cambios',
  async (fields) => {
    const { repository, service } = await setup()
    const item = await service.addOwnedItem(libraryIds.entry, {
      medium: 'physical',
      format: 'cd',
    })
    const before = await repository.readSnapshot()
    await expect(service.updateOwnedItem(item, fields)).rejects.toThrow()
    expect(await repository.readSnapshot()).toEqual(before)
  },
)
test('eliminar compra conserva edición de referencia, notas generales y de género', async () => {
  const { repository, service } = await setup()
  const item = await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
    releaseId: ids.original,
  })
  await repository.mutate((snapshot) => {
    snapshot.catalog.albums.find((row) => row.id === ids.album)!.genres = [
      'Death Metal',
    ]
    return { snapshot, result: undefined }
  })
  const snapshot = await repository.readSnapshot()
  const expected = experienceExpected(snapshot, libraryIds.entry)
  await service.saveAlbumExperience(libraryIds.entry, {
    listeningStatus: expected.listeningStatus,
    expected,
    rating: { score: 9, referenceReleaseId: ids.original },
  })
  await service.rateAlbumGenre({
    userAlbumId: libraryIds.entry,
    genre: 'Death Metal',
    score: 8,
    referenceReleaseId: ids.original,
    expected: null,
  })
  const before = await repository.readSnapshot()
  await service.removeOwnedItem(item.userAlbumId, item.id, item)
  const after = await repository.readSnapshot()
  expect(after.catalog).toEqual(before.catalog)
  expect({ ...after.library, ownedItems: before.library.ownedItems }).toEqual(
    before.library,
  )
})
test('consulta cuenta sólo adquisiciones activas, busca sin acentos y combina medio/formato', async () => {
  const { repository, service } = await setup()
  await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
    releaseId: ids.original,
    notes: 'Edición Aniversário',
  })
  await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'vinyl',
    releaseId: ids.deluxe,
  })
  await service.addOwnedItem(libraryIds.entry, {
    medium: 'purchased_digital',
    format: 'digital_download',
  })
  const snapshot = await repository.readSnapshot(),
    albums = projectLibrary(snapshot)
  const result = queryCollection(snapshot, albums, defaultCollectionFilters)
  expect([
    result.physical,
    result.digital,
    result.albumCount,
    result.all.length,
  ]).toEqual([2, 1, 1, 3])
  expect(
    queryCollection(snapshot, albums, {
      search: 'Eclipse aniversario cd',
      medium: 'physical',
      format: 'cd',
    }).visible,
  ).toHaveLength(1)
  expect(
    queryCollection(snapshot, albums, {
      search: 'descarga digital',
      medium: 'purchased_digital',
      format: 'digital_download',
    }).visible,
  ).toHaveLength(1)
  expect(
    queryCollection(snapshot, albums, {
      search: '',
      medium: 'physical',
      format: 'digital_download',
    }).visible,
  ).toEqual([])
})
