// @vitest-environment node
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ZodError } from 'zod'
import { MusicLibrary } from '../../application/music-library'
import { fixtureId, ids } from '../../domain/catalog/catalog.fixture'
import { createLibrarySchema } from '../../domain/library/library'
import {
  libraryIds,
  makeContext,
  makeLibrary,
  times,
} from '../../domain/library/library.fixture'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { AuditoriumDatabase, SCHEMA_V1 } from '../db/database'
import { IDENTITY_KEY } from '../db/records'
import { IndexedDbRepository } from './indexeddb-repository'

let indexedDB: IDBFactory
let databases: Dexie[]
let nextId: number

beforeEach(() => {
  indexedDB = new IDBFactory()
  databases = []
  nextId = 10000
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of databases) database.close()
  for (const database of new Map(databases.map((db) => [db.name, db])).values())
    await database.delete()
})

function connect(name = 'integrity-persistence') {
  const database = new AuditoriumDatabase(name, { indexedDB, IDBKeyRange })
  databases.push(database)
  const createId = vi.fn(() => libraryIds.user)
  const repository = new IndexedDbRepository({
    database,
    createId,
    now: () => new Date(times.added),
  })
  const service = new MusicLibrary(repository, {
    createId: () => fixtureId(nextId++),
    now: () => new Date(times.later),
  })
  return { database, repository, service, createId }
}

async function seeded() {
  const store = connect()
  const context = makeContext()
  await store.repository.mutate((snapshot) => ({
    snapshot: {
      identity: snapshot.identity,
      catalog: context.catalog,
      library: createLibrarySchema(context).parse(makeLibrary()),
    },
    result: undefined,
  }))
  return store
}

const invalidChanges: [string, (snapshot: LocalSnapshot) => void][] = [
  [
    'ciclo entre pista original y variante',
    (snapshot) => {
      snapshot.catalog.tracks = snapshot.catalog.tracks.map((track) =>
        track.id === ids.eclipse
          ? { ...track, variantOfTrackId: ids.demo }
          : track,
      )
    },
  ],
  [
    'dos entradas activas del mismo álbum',
    (snapshot) => {
      const entry = snapshot.library.userAlbums[0]
      if (!entry) throw new Error('Falta entrada ficticia.')
      snapshot.library.userAlbums.push({ ...entry, id: fixtureId(900) })
    },
  ],
  [
    'aparición de una pista de otro álbum',
    (snapshot) => {
      snapshot.catalog.releaseTracks = snapshot.catalog.releaseTracks.map(
        (row) =>
          row.id === fixtureId(100)
            ? { ...row, trackId: libraryIds.otherTrack }
            : row,
      )
    },
  ],
  [
    'calificación fuera del rango interno',
    (snapshot) => {
      snapshot.library.albumRatings = snapshot.library.albumRatings.map(
        (row) => ({ ...row, scoreUnits: 21 }),
      )
    },
  ],
]

describe('rechazos conservan los datos al reabrir', () => {
  test.each(invalidChanges)('%s', async (_, change) => {
    const store = await seeded()
    const before = await store.repository.readSnapshot()
    await expect(
      store.repository.mutate((snapshot) => {
        // Combinar un cambio válido con el inválido detecta escrituras parciales.
        snapshot.catalog.albums = snapshot.catalog.albums.map((album) => ({
          ...album,
          title: 'Cambio que debe rechazarse',
        }))
        change(snapshot)
        return { snapshot, result: undefined }
      }),
    ).rejects.toBeInstanceOf(ZodError)
    store.repository.close()
    const reopened = connect()
    expect(await reopened.repository.readSnapshot()).toEqual(before)
    expect(reopened.createId).not.toHaveBeenCalled()
  })

  test('quota al reemplazar una nota conserva notas, relaciones e identidad', async () => {
    const store = await seeded()
    const before = await store.repository.readSnapshot()
    const fail = vi
      .spyOn(store.database.albumRatings, 'bulkPut')
      .mockRejectedValue(
        new DOMException('Quota ficticia', 'QuotaExceededError'),
      )
    await expect(
      store.service.rateAlbum(libraryIds.entry, 10),
    ).rejects.toMatchObject({ code: 'quota_exceeded' })
    fail.mockRestore()
    store.repository.close()
    expect(await connect().repository.readSnapshot()).toEqual(before)
  })

  test('abortar después de escribir un álbum revierte todas las tablas', async () => {
    const store = await seeded()
    const before = await store.repository.readSnapshot()
    const bulkPut = store.database.albums.bulkPut.bind(store.database.albums)
    const fail = vi
      .spyOn(store.database.albums, 'bulkPut')
      .mockImplementation((rows) =>
        bulkPut(rows).then((result) => {
          const transaction = Dexie.currentTransaction
          if (!transaction) throw new Error('Falta transacción de prueba.')
          transaction.abort()
          return result
        }),
      )
    await expect(
      store.repository.mutate((snapshot) => {
        snapshot.catalog.albums = snapshot.catalog.albums.map((album) => ({
          ...album,
          title: 'Título que debe revertirse',
        }))
        snapshot.library.albumRatings = []
        return { snapshot, result: 'No debe resolverse' }
      }),
    ).rejects.toMatchObject({ code: 'aborted' })
    fail.mockRestore()
    store.repository.close()
    expect(await connect().repository.readSnapshot()).toEqual(before)
  })
})

describe('aislamiento y cambios de posiciones', () => {
  test('dos conexiones conservan altas y calificaciones distintas', async () => {
    const first = await seeded()
    const second = connect()
    await second.repository.open()
    const created = await Promise.all([
      first.service.createAlbum({
        title: 'Órbita azul',
        artists: [{ name: 'Norte ficticio' }],
      }),
      second.service.createAlbum({
        title: 'Órbita roja',
        artists: [{ name: 'Sur ficticio' }],
      }),
    ])
    await Promise.all([
      first.service.rateAlbum(libraryIds.entry, 10),
      second.service.rateTrack(libraryIds.entry, ids.demo, 6.5),
    ])
    first.repository.close()
    second.repository.close()
    const final = await connect().repository.readSnapshot()
    for (const item of created) {
      expect(final.catalog.albums).toContainEqual(item.album)
      expect(final.library.userAlbums).toContainEqual(item.userAlbum)
      expect(final.catalog.albumArtists).toEqual(
        expect.arrayContaining(item.credits),
      )
    }
    expect(final.catalog.albums).toHaveLength(4)
    expect(final.library.albumRatings).toContainEqual({
      userAlbumId: libraryIds.entry,
      scoreUnits: 20,
      updatedAt: times.later,
    })
    expect(final.library.trackRatings).toContainEqual({
      userAlbumId: libraryIds.entry,
      trackId: ids.demo,
      scoreUnits: 13,
      updatedAt: times.later,
    })
  })

  test('lectores concurrentes solo observan un grafo completo antes o después del alta', async () => {
    const writer = connect()
    const reader = connect()
    const before = await writer.repository.readSnapshot()
    await reader.repository.open()
    const [created, snapshots] = await Promise.all([
      writer.service.createAlbum({
        title: 'Eclipse',
        artists: [{ name: 'Umbral ficticio' }],
      }),
      Promise.all(
        Array.from({ length: 8 }, () => reader.repository.readSnapshot()),
      ),
    ])
    const after = await reader.repository.readSnapshot()
    expect(after.catalog.albums).toEqual([created.album])
    expect(after.catalog.artists).toEqual(created.artists)
    expect(after.catalog.albumArtists).toEqual(created.credits)
    expect(after.library.userAlbums).toEqual([created.userAlbum])
    for (const snapshot of snapshots)
      expect([before, after]).toContainEqual(snapshot)
  })

  test('intercambiar posiciones de Deluxe conserva IDs, notas y lista original', async () => {
    const store = await seeded()
    const before = await store.repository.readSnapshot()
    await store.repository.mutate((snapshot) => {
      snapshot.catalog.releaseTracks = snapshot.catalog.releaseTracks.map(
        (row) =>
          row.releaseId === ids.deluxe && row.trackNumber <= 2
            ? { ...row, trackNumber: 3 - row.trackNumber }
            : row,
      )
      return { snapshot, result: undefined }
    })
    store.repository.close()
    const after = await connect().repository.readSnapshot()
    expect(
      after.catalog.releaseTracks.find((row) => row.id === fixtureId(200)),
    ).toMatchObject({ trackId: ids.overture, trackNumber: 2 })
    expect(
      after.catalog.releaseTracks.find((row) => row.id === fixtureId(201)),
    ).toMatchObject({ trackId: ids.eclipse, trackNumber: 1 })
    expect(after.library).toEqual(before.library)
    expect(after.catalog.coreTracks).toEqual(before.catalog.coreTracks)
    expect(after.catalog.tracks).toEqual(before.catalog.tracks)
    expect(
      after.catalog.releaseTracks.filter(
        (row) => row.releaseId === ids.original,
      ),
    ).toEqual(
      before.catalog.releaseTracks.filter(
        (row) => row.releaseId === ids.original,
      ),
    )
  })
})

const corruptRows: [
  string,
  (database: AuditoriumDatabase) => Promise<unknown>,
][] = [
  [
    'ciclo',
    (db) => db.tracks.update(ids.eclipse, { variantOfTrackId: ids.demo }),
  ],
  [
    'referencia cruzada',
    (db) =>
      db.releaseTracks.update(fixtureId(100), {
        trackId: libraryIds.otherTrack,
      }),
  ],
  [
    'índice activo alterado',
    (db) => db.userAlbums.update(libraryIds.entry, { activeAlbumKey: null }),
  ],
  [
    'rating inválido',
    (db) => db.albumRatings.update(libraryIds.entry, { scoreUnits: 0 }),
  ],
]

async function rawRows(database: AuditoriumDatabase) {
  return database.transaction('r', database.tables, () =>
    Promise.all(database.tables.map((table) => table.toArray())),
  )
}

function nativeSchema(database: IDBDatabase) {
  const names = Array.from(database.objectStoreNames).sort()
  const transaction = database.transaction(names, 'readonly')
  return names.map((name) => {
    const store = transaction.objectStore(name)
    return {
      name,
      keyPath: store.keyPath,
      autoIncrement: store.autoIncrement,
      indices: Array.from(store.indexNames).map((indexName) => {
        const index = store.index(indexName)
        return {
          name: index.name,
          keyPath: index.keyPath,
          unique: index.unique,
          multiEntry: index.multiEntry,
        }
      }),
    }
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(
        request.error ?? new Error('Falló la inspección nativa de prueba.'),
      )
  })
}

describe('datos corruptos se conservan para recuperación explícita', () => {
  test.each(corruptRows)(
    '%s bloquea lectura y escritura sin modificar filas',
    async (_, corrupt) => {
      const store = await seeded()
      await corrupt(store.database)
      const before = await rawRows(store.database)
      store.repository.close()
      const reopened = connect()
      const change = vi.fn((snapshot: LocalSnapshot) => ({
        snapshot,
        result: undefined,
      }))
      await expect(reopened.repository.readSnapshot()).rejects.toMatchObject({
        code: 'corrupt_data',
      })
      await expect(reopened.repository.mutate(change)).rejects.toMatchObject({
        code: 'corrupt_data',
      })
      expect(change).not.toHaveBeenCalled()
      expect(await rawRows(reopened.database)).toEqual(before)
      expect(reopened.createId).not.toHaveBeenCalled()
    },
  )
})

describe('esquema v1 alterado no se repara implícitamente', () => {
  test.each([
    [
      'índice ausente',
      'id, [userId+albumId], albumId, listeningStatus, addedAt',
    ],
    [
      'nombre de índice distinto',
      'id, &wrongActiveKey, [userId+albumId], albumId, listeningStatus, addedAt',
    ],
    [
      'índice único convertido en no único',
      'id, activeAlbumKey, [userId+albumId], albumId, listeningStatus, addedAt',
    ],
  ])('%s conserva esquema e identidad', async (_, userAlbums) => {
    const altered = new Dexie('altered-schema', { indexedDB, IDBKeyRange })
    databases.push(altered)
    altered.version(1).stores({ ...SCHEMA_V1, userAlbums })
    await altered.open()
    const identity = {
      key: IDENTITY_KEY,
      userId: libraryIds.user,
      createdAt: times.added,
    }
    await altered.table('metadata').add(identity)
    const schemaBefore = nativeSchema(altered.backendDB())
    altered.close()
    const store = connect('altered-schema')
    await expect(store.repository.open()).rejects.toMatchObject({
      code: 'corrupt_data',
    })
    expect(store.createId).not.toHaveBeenCalled()
    // Inspeccionar directamente evita que otra apertura con Dexie repare índices.
    const native = await requestResult(indexedDB.open('altered-schema'))
    try {
      expect(native.version).toBe(10)
      expect(nativeSchema(native)).toEqual(schemaBefore)
      expect(
        await requestResult(
          native
            .transaction('metadata')
            .objectStore('metadata')
            .get(IDENTITY_KEY),
        ),
      ).toEqual(identity)
    } finally {
      native.close()
    }
  })
})
