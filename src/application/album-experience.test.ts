// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { MusicLibrary } from './music-library'
import { experienceExpected } from './album-experience'
import { releaseRemovalToken } from './track-lists'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { libraryIds } from '../domain/library/library.fixture'
import { localSnapshotSchema, parseBackupDocument } from '../domain/backup'
import { legacyBackupFixture } from '../test/legacy-backup.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'

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
  const database = new AuditoriumDatabase('experience', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => makeBackup().data.identity.userId,
    now: () => new Date(makeBackup().data.identity.createdAt),
  })
  await repository.mutate(() => ({
    snapshot: makeBackup().data,
    result: undefined,
  }))
  let next = 50000
  const service = new MusicLibrary(repository, {
    createId: () => fixtureId(next++),
    now: () => new Date('2026-10-21T12:00:00Z'),
  })
  return { database, repository, service }
}
test('una sola nota contextualizada por una edición digital no adquirida; pistas independientes', async () => {
  const { repository, service } = await setup()
  const digital = await service.addRelease({
    albumId: ids.album,
    format: 'digital',
    editionLabel: 'Aniversario',
    copyCoreTracks: false,
  })
  const before = await repository.readSnapshot()
  await service.saveAlbumExperience(libraryIds.entry, {
    listeningStatus: 'completed',
    personalNotes: '  Experiencia ficticia.\nSegunda línea.  ',
    rating: { score: 8.5, referenceReleaseId: digital.id },
    expected: experienceExpected(before, libraryIds.entry),
  })
  const after = await repository.readSnapshot()
  expect(
    after.library.albumRatings.filter(
      (r) => r.userAlbumId === libraryIds.entry,
    ),
  ).toEqual([
    expect.objectContaining({ scoreUnits: 17, referenceReleaseId: digital.id }),
  ])
  expect(after.library.trackRatings).toEqual(before.library.trackRatings)
  expect(after.library.ownedItems).toEqual(before.library.ownedItems)
  expect(after.catalog).toEqual(before.catalog)
  expect(after.library.userAlbums).toHaveLength(
    before.library.userAlbums.length,
  )
  expect(parseBackupDocument({ ...makeBackup(), data: after }).data).toEqual(
    after,
  )
})
test.each(['missing', 'foreign'])(
  'una referencia %s revierte también escucha y comentario',
  async (kind) => {
    const { repository, service } = await setup()
    const reference =
      kind === 'foreign'
        ? await service.addRelease({
            albumId: ids.otherAlbum,
            format: 'digital',
            copyCoreTracks: false,
          })
        : { id: fixtureId(99999) }
    const before = await repository.readSnapshot()
    await expect(
      service.saveAlbumExperience(libraryIds.entry, {
        listeningStatus: 'completed',
        personalNotes: 'No persistir',
        rating: { score: 10, referenceReleaseId: reference.id },
        expected: experienceExpected(before, libraryIds.entry),
      }),
    ).rejects.toThrow()
    expect(await repository.readSnapshot()).toEqual(before)
  },
)
test('recalificar conserva la referencia con la API de nota y quitarla explícitamente conserva la cifra', async () => {
  const { repository, service } = await setup()
  let snapshot = await repository.readSnapshot()
  await service.saveAlbumExperience(libraryIds.entry, {
    ...experienceExpected(snapshot, libraryIds.entry),
    rating: { score: 9.5, referenceReleaseId: ids.deluxe },
    expected: experienceExpected(snapshot, libraryIds.entry),
  })
  await service.rateAlbum(libraryIds.entry, 10)
  snapshot = await repository.readSnapshot()
  expect(snapshot.library.albumRatings[0]).toMatchObject({
    scoreUnits: 20,
    referenceReleaseId: ids.deluxe,
  })
  await service.saveAlbumExperience(libraryIds.entry, {
    ...experienceExpected(snapshot, libraryIds.entry),
    rating: { score: 10 },
    expected: experienceExpected(snapshot, libraryIds.entry),
  })
  const after = await repository.readSnapshot()
  expect(after.library.albumRatings[0]).toMatchObject({ scoreUnits: 20 })
  expect(after.library.albumRatings[0]).not.toHaveProperty('referenceReleaseId')
})
test('CAS compara experiencia y conserva cambios independientes en enlaces', async () => {
  const { repository, service } = await setup()
  const before = await repository.readSnapshot(),
    expected = experienceExpected(before, libraryIds.entry)
  await repository.mutate((snapshot) => {
    snapshot.library.userAlbums[0]!.updatedAt = '2026-10-21T11:00:00.000Z'
    snapshot.library.userAlbums[0]!.links = [
      {
        id: fixtureId(70000),
        purpose: 'playback',
        url: 'https://music.example/album',
        createdAt: '2026-10-21T11:00:00.000Z',
        updatedAt: '2026-10-21T11:00:00.000Z',
      },
    ]
    return { snapshot, result: undefined }
  })
  await service.saveAlbumExperience(libraryIds.entry, {
    listeningStatus: 'completed',
    rating: { score: 10 },
    expected,
  })
  expect(
    (await repository.readSnapshot()).library.userAlbums[0]!.links,
  ).toHaveLength(1)
  const saved = await repository.readSnapshot()
  await expect(
    service.saveAlbumExperience(libraryIds.entry, {
      listeningStatus: 'queued',
      expected,
    }),
  ).rejects.toMatchObject({ code: 'outdated_experience' })
  expect(await repository.readSnapshot()).toEqual(saved)
})
test('un fallo de escritura revierte la experiencia completa', async () => {
  const { repository, service, database } = await setup(),
    before = await repository.readSnapshot()
  vi.spyOn(database.albumRatings, 'bulkPut').mockRejectedValueOnce(
    new DOMException('Ficticio', 'QuotaExceededError'),
  )
  await expect(
    service.saveAlbumExperience(libraryIds.entry, {
      listeningStatus: 'completed',
      personalNotes: 'Ficticio',
      rating: { score: 10, referenceReleaseId: ids.deluxe },
      expected: experienceExpected(before, libraryIds.entry),
    }),
  ).rejects.toThrow()
  expect(await repository.readSnapshot()).toEqual(before)
})
test('un álbum sin ediciones permite guardar una nota sin referencia', async () => {
  const { repository, service } = await setup()
  const created = await service.createAlbum({
    title: 'Obra Ficticia Nueva',
    artists: [{ name: 'Banda Ficticia Nueva' }],
  })
  const entry = await service.addAlbumToLibrary(created.album.id)
  const before = await repository.readSnapshot()
  await service.saveAlbumExperience(entry.id, {
    listeningStatus: 'completed',
    rating: { score: 8 },
    expected: experienceExpected(before, entry.id),
  })
  expect(
    (await repository.readSnapshot()).library.albumRatings.find(
      (r) => r.userAlbumId === entry.id,
    ),
  ).toMatchObject({ scoreUnits: 16 })
})
test('eliminar una edición exige resolver la referencia, conserva nota y no borra pistas', async () => {
  const { repository, service } = await setup()
  const release = await service.addRelease({
    albumId: ids.album,
    format: 'digital',
    copyCoreTracks: true,
  })
  let snapshot = await repository.readSnapshot()
  await service.saveAlbumExperience(libraryIds.entry, {
    listeningStatus: 'completed',
    rating: { score: 10, referenceReleaseId: release.id },
    expected: experienceExpected(snapshot, libraryIds.entry),
  })
  snapshot = await repository.readSnapshot()
  await expect(
    service.removeRelease(
      release.id,
      releaseRemovalToken(snapshot.catalog, release.id),
    ),
  ).rejects.toMatchObject({ code: 'referenced_release' })
  expect(await repository.readSnapshot()).toEqual(snapshot)
  await service.saveAlbumExperience(libraryIds.entry, {
    listeningStatus: 'completed',
    rating: { score: 10 },
    expected: experienceExpected(snapshot, libraryIds.entry),
  })
  await service.removeRelease(
    release.id,
    releaseRemovalToken(snapshot.catalog, release.id),
  )
  const after = await repository.readSnapshot()
  expect(after.catalog.releases.some((r) => r.id === release.id)).toBe(false)
  expect(after.catalog.tracks).toEqual(snapshot.catalog.tracks)
  expect(after.library.albumRatings[0]?.scoreUnits).toBe(20)
  expect(after.library.trackRatings).toEqual(snapshot.library.trackRatings)
})
test('una edición eliminada concurrentemente no deja guardar una referencia huérfana', async () => {
  const { repository, service } = await setup()
  const release = await service.addRelease({
    albumId: ids.album,
    format: 'digital',
    copyCoreTracks: false,
  })
  const before = await repository.readSnapshot()
  await service.removeRelease(
    release.id,
    releaseRemovalToken(before.catalog, release.id),
  )
  const saved = await repository.readSnapshot()
  await expect(
    service.saveAlbumExperience(libraryIds.entry, {
      listeningStatus: 'completed',
      rating: { score: 10, referenceReleaseId: release.id },
      expected: experienceExpected(before, libraryIds.entry),
    }),
  ).rejects.toThrow()
  expect(await repository.readSnapshot()).toEqual(saved)
})
test('retirar una adquisición y añadir otra edición no cambia la referencia de la nota', async () => {
  const { repository, service } = await setup()
  const before = await repository.readSnapshot()
  await service.saveAlbumExperience(libraryIds.entry, {
    listeningStatus: 'queued',
    rating: { score: 9.5, referenceReleaseId: ids.original },
    expected: experienceExpected(before, libraryIds.entry),
  })
  const saved = await repository.readSnapshot()
  await service.removeOwnedItem(
    libraryIds.entry,
    before.library.ownedItems[0]!.id,
  )
  await service.addRelease({
    albumId: ids.album,
    format: 'digital',
    editionLabel: 'Aniversario',
    copyCoreTracks: false,
  })
  const after = await repository.readSnapshot()
  expect(after.library.albumRatings).toEqual(saved.library.albumRatings)
  expect(after.catalog.releases.some((r) => r.id === ids.original)).toBe(true)
})
test.each([1, 2, 3, 4, 5])(
  'respaldo histórico %s no inventa ni acepta referencia futura',
  (version) => {
    const backup =
      version === 5
        ? { ...makeBackup(), schemaVersion: 5 }
        : legacyBackupFixture(makeBackup(), version)
    if (version < 3) {
      for (const artist of backup.data.catalog.artists) delete artist.country
      for (const album of backup.data.catalog.albums) {
        Reflect.deleteProperty(album, 'genres')
        Reflect.deleteProperty(album, 'coverImage')
        if (version === 1) Reflect.deleteProperty(album, 'catalogReference')
      }
    }
    expect(
      parseBackupDocument(backup).data.library.albumRatings[0],
    ).not.toHaveProperty('referenceReleaseId')
    backup.data.library.albumRatings[0] = {
      ...backup.data.library.albumRatings[0]!,
      referenceReleaseId: ids.deluxe,
    }
    expect(() => parseBackupDocument(backup)).toThrow()
  },
)
test('integridad rechaza referencias de otro álbum, inexistentes y sin nota', () => {
  const snapshot = makeBackup().data
  snapshot.library.albumRatings[0]!.referenceReleaseId = fixtureId(99999)
  expect(() => localSnapshotSchema.parse(snapshot)).toThrow()
})
test('una entrada retirada no acepta guardar experiencia aunque no cambien los campos', async () => {
  const { repository, service } = await setup()
  const before = await repository.readSnapshot(),
    expected = experienceExpected(before, libraryIds.otherEntry)
  await expect(
    service.saveAlbumExperience(libraryIds.otherEntry, {
      ...expected,
      rating: { score: 8 },
      expected,
    }),
  ).rejects.toMatchObject({ code: 'missing_reference' })
  expect(await repository.readSnapshot()).toEqual(before)
})
