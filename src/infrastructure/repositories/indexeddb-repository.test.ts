// @vitest-environment node
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fixtureId, ids } from '../../domain/catalog/catalog.fixture'
import {
  libraryIds,
  makeContext,
  makeLibrary,
  times,
} from '../../domain/library/library.fixture'
import {
  AuditoriumDatabase,
  DATABASE_VERSION,
  SCHEMA_V1,
  SCHEMA_V3,
  SCHEMA_V6,
} from '../db/database'
import { asLocalStorageError, LocalStorageError } from '../db/errors'
import {
  fromStoredUserAlbum,
  IDENTITY_KEY,
  toStoredUserAlbum,
} from '../db/records'
import { IndexedDbRepository } from './indexeddb-repository'

let indexedDB: IDBFactory
let databases: Dexie[]

beforeEach(() => {
  indexedDB = new IDBFactory()
  databases = []
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of databases) database.close()
  const unique = new Map(
    databases.map((database) => [database.name, database] as const),
  )
  for (const database of unique.values()) await database.delete()
})

function makeStore(
  name = 'auditorium-test',
  createId = vi.fn(() => libraryIds.user),
) {
  const database = new AuditoriumDatabase(name, { indexedDB, IDBKeyRange })
  databases.push(database)
  const now = vi.fn(() => new Date(times.added))
  const repository = new IndexedDbRepository({ database, createId, now })
  return { database, repository, createId, now }
}

async function seed(database: AuditoriumDatabase) {
  const { catalog } = makeContext()
  const library = makeLibrary()
  await database.transaction('rw', database.tables, async () => {
    await Promise.all([
      database.artists.bulkAdd(catalog.artists),
      database.albums.bulkAdd(catalog.albums),
      database.albumArtists.bulkAdd(catalog.albumArtists),
      database.tracks.bulkAdd(catalog.tracks),
      database.coreTracks.bulkAdd(catalog.coreTracks),
      database.releases.bulkAdd(catalog.releases),
      database.releaseTracks.bulkAdd(catalog.releaseTracks),
      database.userAlbums.bulkAdd(library.userAlbums.map(toStoredUserAlbum)),
      database.albumRatings.bulkAdd(library.albumRatings),
      database.trackRatings.bulkAdd(library.trackRatings),
    ])
  })
}

describe('identidad persistente', () => {
  test('crea esquema actual e identidad válida sin sembrar música', async () => {
    const { database, repository, createId, now } = makeStore()
    const identity = await repository.open()
    expect(identity).toEqual({
      userId: libraryIds.user,
      createdAt: times.added,
    })
    expect(database.verno).toBe(DATABASE_VERSION)
    expect(database.tables.map((table) => table.name).sort()).toEqual(
      Object.keys(SCHEMA_V6).sort(),
    )
    const snapshot = await repository.readSnapshot()
    expect(snapshot.identity).toEqual(identity)
    expect(snapshot.catalog.albums).toEqual([])
    expect(snapshot.library.userAlbums).toEqual([])
    expect(createId).toHaveBeenCalledTimes(1)
    expect(now).toHaveBeenCalledTimes(1)
  })

  test('reabre conservando identidad, relaciones y notas', async () => {
    const first = makeStore()
    await first.repository.open()
    await seed(first.database)
    const before = await first.repository.readSnapshot()
    first.repository.close()
    const second = makeStore()
    expect(await second.repository.readSnapshot()).toEqual(before)
    expect(second.createId).not.toHaveBeenCalled()
    expect(second.now).not.toHaveBeenCalled()
    expect(
      before.catalog.tracks.find((track) => track.id === ids.demo)
        ?.variantOfTrackId,
    ).toBe(ids.eclipse)
    expect(before.library.userAlbums[0]?.personalNotes).toBe(
      '  Comentario ficticio.\nSegunda línea.  ',
    )
  })

  test('seis conexiones concurrentes generan una sola identidad', async () => {
    const stores = Array.from({ length: 6 }, (_, index) =>
      makeStore(
        'concurrent',
        vi.fn(() => fixtureId(800 + index)),
      ),
    )
    const identities = await Promise.all(
      stores.map((store) => store.repository.open()),
    )
    expect(new Set(identities.map((identity) => identity.userId)).size).toBe(1)
    expect(
      stores.reduce(
        (count, store) => count + store.createId.mock.calls.length,
        0,
      ),
    ).toBe(1)
    expect(
      stores.reduce((count, store) => count + store.now.mock.calls.length, 0),
    ).toBe(1)
    expect(await stores[0]?.database.metadata.count()).toBe(1)
  })

  test('un generador inválido aborta y permite un intento posterior sin datos parciales', async () => {
    const invalid = makeStore(
      'invalid-id',
      vi.fn(() => 'fixed-user'),
    )
    await expect(invalid.repository.open()).rejects.toMatchObject({
      code: 'identity_generation_failed',
      recoverable: true,
    })
    expect(await invalid.database.metadata.count()).toBe(0)
    const retry = makeStore('invalid-id')
    expect((await retry.repository.open()).userId).toBe(libraryIds.user)
  })

  test('identidad ausente con datos existentes no crea otra ni borra música', async () => {
    const store = makeStore()
    await store.database.open()
    const artist = makeContext().catalog.artists[0]
    if (!artist) throw new Error('Falta el fixture de artista.')
    await store.database.artists.add(artist)
    await expect(store.repository.open()).rejects.toMatchObject({
      code: 'identity_missing',
    })
    expect(store.createId).not.toHaveBeenCalled()
    expect(await store.database.artists.count()).toBe(1)
    expect(await store.database.metadata.count()).toBe(0)
  })

  test('identidad corrupta se conserva y se informa', async () => {
    const store = makeStore()
    await store.database.open()
    const corrupt = {
      key: IDENTITY_KEY,
      userId: 'invalid',
      createdAt: times.added,
    }
    await store.database.metadata.add(corrupt)
    await expect(store.repository.open()).rejects.toMatchObject({
      code: 'corrupt_data',
    })
    expect(await store.database.metadata.get(IDENTITY_KEY)).toEqual(corrupt)
    expect(store.createId).not.toHaveBeenCalled()
  })
})

describe('índices y snapshots', () => {
  test('protege una entrada activa y permite históricos', async () => {
    const { database, repository } = makeStore()
    await repository.open()
    const entry = toStoredUserAlbum(makeLibrary().userAlbums[0])
    await database.userAlbums.add(entry)
    await expect(
      database.userAlbums.add({ ...entry, id: libraryIds.historicalEntry }),
    ).rejects.toMatchObject({ name: 'ConstraintError' })
    await database.userAlbums.add(
      toStoredUserAlbum({
        ...fromStoredUserAlbum(entry),
        id: libraryIds.historicalEntry,
        deletedAt: times.updated,
      }),
    )
    expect(await database.userAlbums.count()).toBe(2)
    expect(
      await database.userAlbums
        .where('[userId+albumId]')
        .equals([libraryIds.user, ids.album])
        .count(),
    ).toBe(2)
  })

  test('mapper conserva datos de dominio y detecta índice alterado', () => {
    const entry = makeLibrary().userAlbums[0]
    const stored = toStoredUserAlbum(entry)
    expect(fromStoredUserAlbum(stored)).toEqual(entry)
    expect(() =>
      fromStoredUserAlbum({ ...stored, activeAlbumKey: 'wrong' }),
    ).toThrow(LocalStorageError)
    expect(() =>
      fromStoredUserAlbum({ ...stored, activeAlbumKey: null }),
    ).toThrow(LocalStorageError)
  })

  test('posición de edición única y lookup de pistas compartidas', async () => {
    const { database, repository } = makeStore()
    await repository.open()
    await seed(database)
    const appearance = makeContext().catalog.releaseTracks[0]
    if (!appearance) throw new Error('Falta aparición ficticia.')
    await expect(
      database.releaseTracks.add({ ...appearance, id: fixtureId(850) }),
    ).rejects.toMatchObject({ name: 'ConstraintError' })
    expect(
      await database.releaseTracks
        .where('[releaseId+trackId]')
        .equals([ids.deluxe, ids.eclipse])
        .count(),
    ).toBe(1)
    expect(
      await database.tracks.where('albumId').equals(ids.album).count(),
    ).toBe(4)
  })

  test('claves de calificación y créditos son únicas', async () => {
    const { database, repository } = makeStore()
    await repository.open()
    await seed(database)
    await expect(
      database.albumRatings.add({
        userAlbumId: libraryIds.entry,
        scoreUnits: 20,
        updatedAt: times.updated,
      }),
    ).rejects.toMatchObject({ name: 'ConstraintError' })
    await expect(
      database.trackRatings.add({
        userAlbumId: libraryIds.entry,
        trackId: ids.eclipse,
        scoreUnits: 20,
        updatedAt: times.updated,
      }),
    ).rejects.toMatchObject({ name: 'ConstraintError' })
    await expect(
      database.albumArtists.add({
        albumId: ids.album,
        artistId: ids.artist,
        role: 'collaborator',
        position: 1,
      }),
    ).rejects.toMatchObject({ name: 'ConstraintError' })
  })

  test('una transacción fallida revierte todas sus escrituras', async () => {
    const { database, repository } = makeStore()
    await repository.open()
    const identity = await database.metadata.get(IDENTITY_KEY)
    const artist = makeContext().catalog.artists[0]
    if (!artist) throw new Error('Falta artista ficticio.')
    await expect(
      database.transaction(
        'rw',
        database.artists,
        database.albums,
        async () => {
          await database.artists.add(artist)
          await database.albums.add({
            id: ids.album,
            title: 'Eclipse',
            primaryType: 'full_length',
            categories: [],
            publicationStatus: 'unknown' as const,
            catalogScope: 'personal',
          })
          await database.artists.add(artist)
        },
      ),
    ).rejects.toMatchObject({ name: 'ConstraintError' })
    expect(await database.artists.count()).toBe(0)
    expect(await database.albums.count()).toBe(0)
    expect(await database.metadata.get(IDENTITY_KEY)).toEqual(identity)
  })

  test('detecta referencia corrupta sin reparar ni borrar automáticamente', async () => {
    const { database, repository } = makeStore()
    await repository.open()
    await seed(database)
    await database.albumRatings.put({
      userAlbumId: libraryIds.entry,
      scoreUnits: 0,
      updatedAt: times.updated,
    })
    await expect(repository.readSnapshot()).rejects.toMatchObject({
      code: 'corrupt_data',
    })
    expect(
      (await database.albumRatings.get(libraryIds.entry))?.scoreUnits,
    ).toBe(0)
    expect(await database.albums.count()).toBe(2)
  })
})

describe('errores recuperables', () => {
  test('una conexión que bloquea la apertura se informa y permite reintentar', async () => {
    const versionOne = new Dexie('blocked', { indexedDB, IDBKeyRange })
    databases.push(versionOne)
    versionOne.version(1).stores(SCHEMA_V1)
    await versionOne.open()
    versionOne.close()
    const request = indexedDB.open('blocked', 10)
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(request.error ?? new Error('No se pudo abrir el fixture.'))
    })
    try {
      const transaction = legacy.transaction('metadata', 'readwrite')
      transaction.objectStore('metadata').add({
        key: IDENTITY_KEY,
        userId: libraryIds.user,
        createdAt: times.added,
      })
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(
            transaction.error ?? new Error('No se pudo preparar el fixture.'),
          )
      })
      const store = makeStore('blocked')
      await expect(store.repository.open()).rejects.toMatchObject({
        code: 'blocked',
      })
      legacy.close()
      await vi.waitFor(async () => {
        expect((await store.repository.open()).userId).toBe(libraryIds.user)
      })
      expect(store.createId).not.toHaveBeenCalled()
    } finally {
      legacy.close()
    }
  })
  test('falta de API IndexedDB se informa', async () => {
    const database = new AuditoriumDatabase('unavailable')
    const repository = new IndexedDbRepository({ database })
    await expect(repository.open()).rejects.toMatchObject({
      code: 'unavailable',
      recoverable: true,
    })
    repository.close()
  })

  test('quota impide persistir identidad y permite reintentar', async () => {
    const store = makeStore()
    const failure = vi
      .spyOn(store.database.metadata, 'add')
      .mockRejectedValue(
        new DOMException('Quota de prueba', 'QuotaExceededError'),
      )
    await expect(store.repository.open()).rejects.toMatchObject({
      code: 'quota_exceeded',
    })
    expect(await store.database.metadata.count()).toBe(0)
    failure.mockRestore()
    expect((await store.repository.open()).userId).toBe(libraryIds.user)
  })

  test('esquema más reciente no se degrada ni se borra', async () => {
    const original = makeStore('newer')
    const identity = await original.repository.open()
    original.repository.close()
    const newer = new Dexie('newer', { indexedDB, IDBKeyRange })
    databases.push(newer)
    newer
      .version(DATABASE_VERSION + 1)
      .stores({ ...SCHEMA_V3, futureData: 'id' })
    await newer.open()
    newer.close()
    const old = makeStore('newer')
    await expect(old.repository.open()).rejects.toMatchObject({
      code: 'version_mismatch',
    })
    await newer.open()
    expect(await newer.table('metadata').get(IDENTITY_KEY)).toMatchObject(
      identity,
    )
    expect(newer.backendDB().version).toBe((DATABASE_VERSION + 1) * 10)
    expect(newer.tables.some((table) => table.name === 'futureData')).toBe(true)
  })

  test.each([
    ['SecurityError', 'unavailable'],
    ['AbortError', 'aborted'],
    ['ConstraintError', 'constraint'],
    ['VersionError', 'version_mismatch'],
  ])('normaliza %s sin perder la causa', (name, code) => {
    const cause = new DOMException('Error ficticio', name)
    const error = asLocalStorageError(cause)
    expect(error.code).toBe(code)
    expect(error.cause).toBe(cause)
    expect(asLocalStorageError(error)).toBe(error)
  })
})
