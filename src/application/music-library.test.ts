// @vitest-environment node
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ZodError } from 'zod'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { MusicLibrary, MusicUseCaseError } from './music-library'

let indexedDB: IDBFactory
let databases: AuditoriumDatabase[]
let nextId: number

beforeEach(() => {
  indexedDB = new IDBFactory()
  databases = []
  nextId = 10000
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of databases) database.close()
  for (const database of new Map(
    databases.map((db) => [db.name, db] as const),
  ).values())
    await database.delete()
})

function setup() {
  const database = new AuditoriumDatabase('music-use-cases', {
    indexedDB,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  const createId = vi.fn(() => fixtureId(nextId++))
  const service = new MusicLibrary(repository, {
    createId,
    now: () => new Date(times.later),
  })
  return { database, repository, createId, service }
}

const albumInput = { title: 'Eclipse', artists: [{ name: 'Umbral Eléctrico' }] }

async function originalAlbum(service: MusicLibrary) {
  const created = await service.createAlbum(albumInput)
  const release = await service.addRelease({
    albumId: created.album.id,
    format: 'cd',
    editionLabel: 'Original',
  })
  const first = await service.addTrackToRelease({
    releaseId: release.id,
    track: { title: 'Overture' },
    discNumber: 1,
    trackNumber: 1,
    corePosition: { discNumber: 1, trackNumber: 1 },
  })
  const second = await service.addTrackToRelease({
    releaseId: release.id,
    track: { title: 'Eclipse' },
    discNumber: 1,
    trackNumber: 2,
    corePosition: { discNumber: 1, trackNumber: 2 },
  })
  return { ...created, release, first, second }
}

describe('altas consistentes', () => {
  test('crea artista, álbum, crédito y biblioteca en una sola operación', async () => {
    const { service, repository } = setup()
    const created = await service.createAlbum(albumInput)
    const snapshot = await repository.readSnapshot()
    expect(snapshot.catalog.artists).toHaveLength(1)
    expect(snapshot.catalog.albums).toEqual([created.album])
    expect(snapshot.catalog.albumArtists).toEqual(created.credits)
    expect(snapshot.library.userAlbums).toEqual([created.userAlbum])
    expect(created.userAlbum).toMatchObject({
      userId: snapshot.identity.userId,
      albumId: created.album.id,
      listeningStatus: 'untracked',
    })
    expect(created.album.createdBy).toBe(snapshot.identity.userId)
    expect(snapshot.library.albumRatings).toEqual([])
  })

  test('reutiliza artistas solo por referencia explícita, con varios créditos', async () => {
    const { service, repository } = setup()
    const first = await service.createAlbum(albumInput)
    const artist = first.artists[0]
    if (!artist) throw new Error('Falta artista ficticio.')
    const second = await service.createAlbum({
      title: 'Otra órbita',
      artists: [
        { artistId: artist.id },
        { name: 'Luz del Umbral', role: 'featured', creditedAs: 'Luz' },
      ],
    })
    const snapshot = await repository.readSnapshot()
    expect(snapshot.catalog.artists).toHaveLength(2)
    expect(second.credits.map((credit) => credit.position)).toEqual([1, 2])
    expect(second.credits[1]).toMatchObject({
      role: 'featured',
      creditedAs: 'Luz',
    })
  })

  test('homónimos no se fusionan y se puede crear solo catálogo', async () => {
    const { service, repository } = setup()
    await service.createAlbum(albumInput)
    const created = await service.createAlbum({
      ...albumInput,
      addToLibrary: false,
    })
    const snapshot = await repository.readSnapshot()
    expect(snapshot.catalog.albums).toHaveLength(2)
    expect(snapshot.catalog.artists).toHaveLength(2)
    expect(snapshot.library.userAlbums).toHaveLength(1)
    expect(created).not.toHaveProperty('userAlbum')
    const entry = await service.addAlbumToLibrary(created.album.id)
    expect(entry.albumId).toBe(created.album.id)
  })

  test('añadir a biblioteca es idempotente y no cambia datos personales', async () => {
    const { service, repository, createId } = setup()
    const created = await service.createAlbum(albumInput)
    if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
    await service.rateAlbum(created.userAlbum.id, 9.5)
    const before = await repository.readSnapshot()
    createId.mockClear()
    expect(
      await service.addAlbumToLibrary(created.album.id.toUpperCase()),
    ).toEqual(created.userAlbum)
    expect(await repository.readSnapshot()).toEqual(before)
    expect(createId).not.toHaveBeenCalled()
  })

  test('añade nueva entrada activa conservando un histórico', async () => {
    const { service, repository } = setup()
    const created = await service.createAlbum(albumInput)
    if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
    await repository.mutate((snapshot) => {
      snapshot.library.userAlbums = snapshot.library.userAlbums.map(
        (entry) => ({
          ...entry,
          deletedAt: times.later,
          updatedAt: times.later,
        }),
      )
      return { snapshot, result: undefined }
    })
    const active = await service.addAlbumToLibrary(created.album.id)
    expect(active.id).not.toBe(created.userAlbum.id)
    const snapshot = await repository.readSnapshot()
    expect(snapshot.library.userAlbums).toHaveLength(2)
    expect(
      snapshot.library.userAlbums.filter(
        (entry) => entry.deletedAt === undefined,
      ),
    ).toHaveLength(1)
  })

  test('dos conexiones concurrentes no crean entradas activas duplicadas', async () => {
    const first = setup()
    const created = await first.service.createAlbum({
      ...albumInput,
      addToLibrary: false,
    })
    const second = setup()
    const [a, b] = await Promise.all([
      first.service.addAlbumToLibrary(created.album.id),
      second.service.addAlbumToLibrary(created.album.id),
    ])
    expect(a.id).toBe(b.id)
    expect(
      (await first.repository.readSnapshot()).library.userAlbums,
    ).toHaveLength(1)
  })
})

describe('ediciones, pistas y calificaciones', () => {
  test('original y Deluxe reutilizan pistas, conservan lista original y tienen bonus propio', async () => {
    const { service, repository } = setup()
    const original = await originalAlbum(service)
    const before = await repository.readSnapshot()
    const deluxe = await service.addRelease({
      albumId: original.album.id,
      format: 'vinyl',
      editionLabel: 'Deluxe',
    })
    const demo = await service.addTrackToRelease({
      releaseId: deluxe.id,
      track: {
        title: 'Eclipse (Demo)',
        variantOfTrackId: original.second.track.id,
      },
      discNumber: 1,
      trackNumber: 3,
      contentRole: 'bonus',
    })
    const snapshot = await repository.readSnapshot()
    expect(snapshot.catalog.albums).toHaveLength(1)
    expect(snapshot.catalog.coreTracks).toEqual(before.catalog.coreTracks)
    expect(
      snapshot.catalog.releaseTracks.filter(
        (row) => row.releaseId === original.release.id,
      ),
    ).toEqual(before.catalog.releaseTracks)
    const deluxeTracks = snapshot.catalog.releaseTracks.filter(
      (row) => row.releaseId === deluxe.id,
    )
    expect(deluxeTracks.map((row) => row.trackId)).toEqual([
      original.first.track.id,
      original.second.track.id,
      demo.track.id,
    ])
    expect(demo.track.variantOfTrackId).toBe(original.second.track.id)
    expect(demo.releaseTrack.contentRole).toBe('bonus')
  })

  test('edición vacía y reutilización explícita de una pista en varias posiciones', async () => {
    const { service, repository } = setup()
    const original = await originalAlbum(service)
    const release = await service.addRelease({
      albumId: original.album.id,
      format: 'digital',
      copyCoreTracks: false,
    })
    await service.addTrackToRelease({
      releaseId: release.id,
      trackId: original.first.track.id,
      discNumber: 1,
      trackNumber: 1,
    })
    await service.addTrackToRelease({
      releaseId: release.id,
      trackId: original.first.track.id,
      discNumber: 2,
      trackNumber: 1,
    })
    const snapshot = await repository.readSnapshot()
    expect(snapshot.catalog.tracks).toHaveLength(2)
    expect(
      snapshot.catalog.releaseTracks.filter(
        (row) => row.releaseId === release.id,
      ),
    ).toHaveLength(2)
  })

  test('notas independientes, compartidas entre ediciones y removibles sin otros cambios', async () => {
    const { service, repository } = setup()
    const original = await originalAlbum(service)
    if (!original.userAlbum) throw new Error('Falta entrada ficticia.')
    const deluxe = await service.addRelease({
      albumId: original.album.id,
      format: 'vinyl',
    })
    const demo = await service.addTrackToRelease({
      releaseId: deluxe.id,
      track: { title: 'Demo', variantOfTrackId: original.second.track.id },
      discNumber: 1,
      trackNumber: 3,
    })
    await service.rateAlbum(original.userAlbum.id, 9.5)
    await service.rateTrack(original.userAlbum.id, original.second.track.id, 8)
    await service.rateTrack(original.userAlbum.id, demo.track.id, 6.5)
    const before = await repository.readSnapshot()
    expect(before.library.albumRatings[0]?.scoreUnits).toBe(19)
    expect(before.library.trackRatings).toHaveLength(2)
    await service.rateTrack(original.userAlbum.id, original.second.track.id, 10)
    expect((await repository.readSnapshot()).library.albumRatings).toEqual(
      before.library.albumRatings,
    )
    await service.removeTrackRating(
      original.userAlbum.id,
      original.second.track.id,
    )
    const removed = await repository.readSnapshot()
    expect(removed.library.trackRatings).toHaveLength(1)
    expect(removed.library.trackRatings[0]?.trackId).toBe(demo.track.id)
    expect(removed.library.userAlbums).toEqual(before.library.userAlbums)
    await service.removeAlbumRating(original.userAlbum.id)
    await service.removeAlbumRating(original.userAlbum.id)
    const final = await repository.readSnapshot()
    expect(final.library.albumRatings).toEqual([])
    expect(final.library.trackRatings).toEqual(removed.library.trackRatings)
    expect(final.library.userAlbums).toEqual(before.library.userAlbums)
  })

  test('reabre conservando altas, ediciones y notas', async () => {
    const first = setup()
    const original = await originalAlbum(first.service)
    if (!original.userAlbum) throw new Error('Falta entrada ficticia.')
    await first.service.rateAlbum(original.userAlbum.id, 9.5)
    const before = await first.repository.readSnapshot()
    first.repository.close()
    const second = setup()
    expect(await second.repository.readSnapshot()).toEqual(before)
  })
})

describe('fallos y rollback', () => {
  test('rechaza un resultado asíncrono antes de persistir cambios', async () => {
    const { repository } = setup()
    const before = await repository.readSnapshot()
    await expect(
      repository.mutate((snapshot) => {
        snapshot.catalog.artists.push({
          id: ids.artist,
          name: 'Umbral ficticio',
          catalogScope: 'personal',
        })
        return { snapshot, result: Promise.resolve('Resultado externo') }
      }),
    ).rejects.toBeInstanceOf(TypeError)
    expect(await repository.readSnapshot()).toEqual(before)
  })
  test('valida entradas antes de escribir y conserva el estado previo', async () => {
    const { service, repository } = setup()
    const before = await repository.readSnapshot()
    await expect(
      service.createAlbum({ title: ' ', artists: [{ name: 'Umbral' }] }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      service.createAlbum({
        title: 'Eclipse',
        artists: [{ name: 'Umbral', role: 'featured' }],
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      service.createAlbum({
        title: 'Eclipse',
        artists: [{ artistId: ids.missing }],
      }),
    ).rejects.toBeInstanceOf(MusicUseCaseError)
    await expect(service.addAlbumToLibrary(ids.missing)).rejects.toMatchObject({
      code: 'missing_reference',
    })
    await expect(
      service.addRelease({ albumId: ids.missing, format: 'cd' }),
    ).rejects.toMatchObject({ code: 'missing_reference' })
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('posición ocupada rechaza pista y aparición nuevas juntas', async () => {
    const { service, repository } = setup()
    const original = await originalAlbum(service)
    const before = await repository.readSnapshot()
    await expect(
      service.addTrackToRelease({
        releaseId: original.release.id,
        track: { title: 'No debe quedar' },
        discNumber: 1,
        trackNumber: 1,
      }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('referencias cruzadas y ratings inválidos no alteran datos', async () => {
    const { service, repository } = setup()
    const a = await originalAlbum(service)
    const b = await service.createAlbum({
      title: 'Otra órbita',
      artists: [{ name: 'Otra formación' }],
    })
    const otherRelease = await service.addRelease({
      albumId: b.album.id,
      format: 'cd',
    })
    const before = await repository.readSnapshot()
    await expect(
      service.addTrackToRelease({
        releaseId: otherRelease.id,
        trackId: a.first.track.id,
        discNumber: 1,
        trackNumber: 1,
      }),
    ).rejects.toMatchObject({ code: 'wrong_album' })
    await expect(
      service.addTrackToRelease({
        releaseId: otherRelease.id,
        track: { title: 'Demo inválida', variantOfTrackId: a.first.track.id },
        discNumber: 1,
        trackNumber: 1,
      }),
    ).rejects.toBeInstanceOf(ZodError)
    if (!b.userAlbum) throw new Error('Falta entrada ficticia.')
    await expect(
      service.rateTrack(b.userAlbum.id, a.first.track.id, 8),
    ).rejects.toMatchObject({ rule: 'wrong_album' })
    await expect(service.rateAlbum(b.userAlbum.id, 9.3)).rejects.toBeInstanceOf(
      ZodError,
    )
    await expect(
      service.addTrackToRelease({
        releaseId: ids.missing,
        trackId: a.first.track.id,
        discNumber: 1,
        trackNumber: 1,
      }),
    ).rejects.toMatchObject({ code: 'missing_reference' })
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('un ID generado duplicado no reemplaza entidades existentes', async () => {
    const { service, repository } = setup()
    const original = await service.createAlbum(albumInput)
    const before = await repository.readSnapshot()
    const bad = new MusicLibrary(repository, {
      createId: () => original.artists[0]?.id ?? ids.missing,
      now: () => new Date(times.later),
    })
    await expect(bad.createAlbum(albumInput)).rejects.toBeInstanceOf(ZodError)
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('un fallo de escritura revierte artista, álbum, créditos y biblioteca', async () => {
    const { service, repository, database } = setup()
    const before = await repository.readSnapshot()
    const failure = vi
      .spyOn(database.userAlbums, 'bulkPut')
      .mockRejectedValue(
        new DOMException('Quota ficticia', 'QuotaExceededError'),
      )
    await expect(service.createAlbum(albumInput)).rejects.toMatchObject({
      code: 'quota_exceeded',
    })
    failure.mockRestore()
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('un BulkError con quota conserva causa y revierte otras tablas', async () => {
    const { service, repository, database } = setup()
    const before = await repository.readSnapshot()
    const cause = new Dexie.BulkError('Quota ficticia', [
      new DOMException('Quota', 'QuotaExceededError'),
    ])
    const failure = vi
      .spyOn(database.albumArtists, 'bulkPut')
      .mockRejectedValue(cause)
    await expect(service.createAlbum(albumInput)).rejects.toMatchObject({
      code: 'quota_exceeded',
      cause,
    })
    failure.mockRestore()
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('un fallo al copiar pistas revierte también la edición', async () => {
    const { service, repository, database } = setup()
    const original = await originalAlbum(service)
    const before = await repository.readSnapshot()
    const failure = vi
      .spyOn(database.releaseTracks, 'bulkPut')
      .mockRejectedValue(new DOMException('Abort ficticio', 'AbortError'))
    await expect(
      service.addRelease({ albumId: original.album.id, format: 'vinyl' }),
    ).rejects.toMatchObject({ code: 'aborted' })
    failure.mockRestore()
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('fallo después de quitar nota restaura el registro anterior', async () => {
    const { service, repository, database } = setup()
    const created = await service.createAlbum(albumInput)
    if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
    await service.rateAlbum(created.userAlbum.id, 9.5)
    const before = await repository.readSnapshot()
    const failure = vi
      .spyOn(database.albumRatings, 'bulkPut')
      .mockRejectedValue(
        new DOMException('Quota ficticia', 'QuotaExceededError'),
      )
    await expect(
      service.rateAlbum(created.userAlbum.id, 10),
    ).rejects.toMatchObject({ code: 'quota_exceeded' })
    failure.mockRestore()
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('la mutación no puede cambiar identidad ni guardar referencias inválidas', async () => {
    const { repository } = setup()
    const before = await repository.readSnapshot()
    await expect(
      repository.mutate((snapshot) => {
        snapshot.identity.userId = libraryIds.otherUser
        return { snapshot, result: undefined }
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      repository.mutate((snapshot) => {
        snapshot.catalog.tracks.push({
          id: ids.eclipse,
          albumId: ids.missing,
          title: 'Sin álbum',
        })
        return { snapshot, result: undefined }
      }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('valida antes del primer I/O y solo escribe filas modificadas', async () => {
    const { service, repository, database } = setup()
    const created = await service.createAlbum(albumInput)
    if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
    const artists = vi.spyOn(database.artists, 'bulkPut')
    const userAlbums = vi.spyOn(database.userAlbums, 'bulkPut')
    await service.rateAlbum(created.userAlbum.id, 9.5)
    expect(artists).not.toHaveBeenCalled()
    expect(userAlbums).not.toHaveBeenCalled()
    const before = await repository.readSnapshot()
    const ratings = vi.spyOn(database.albumRatings, 'bulkDelete')
    await expect(
      repository.mutate((snapshot) => {
        snapshot.library.albumRatings.push({
          userAlbumId: libraryIds.otherEntry,
          scoreUnits: 0,
          updatedAt: times.later,
        })
        return { snapshot, result: undefined }
      }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(ratings).not.toHaveBeenCalled()
    expect(await repository.readSnapshot()).toEqual(before)
  })
})
