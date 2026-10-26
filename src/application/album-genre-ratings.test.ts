// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, test, vi } from 'vitest'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { fixtureId } from '../domain/catalog/catalog.fixture'
import { MusicLibrary } from './music-library'
import { genreRenameExpected } from './album-genre-ratings'
import { buildAlbumEditExpected } from './album-edit'
import { releaseRemovalToken } from './track-lists'

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
  let sequence = 1000
  const database = new AuditoriumDatabase('genre-service', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => fixtureId(900),
    now: () => new Date('2026-10-25T12:00:00.000Z'),
  })
  const service = new MusicLibrary(repository, {
    createId: () => fixtureId(sequence++),
    now: () => new Date('2026-10-25T13:00:00.000Z'),
  })
  const created = await service.createAlbum({
    title: 'Disco Ficticio',
    artists: [{ name: 'Banda Ficticia' }],
    genres: ['Death Metal', 'Power Metal'],
  })
  return {
    database,
    repository,
    service,
    created,
    entryId: created.userAlbum!.id,
  }
}

test('las notas de género son independientes y sus referencias no requieren una nota general', async () => {
  const { repository, service, created, entryId } = await setup()
  const edition = await service.addRelease({
    albumId: created.album.id,
    format: 'digital',
    editionLabel: 'Deluxe',
  })
  await service.rateAlbumGenre({
    userAlbumId: entryId,
    genre: 'Death Metal',
    score: 1,
    expected: null,
    referenceReleaseId: edition.id,
  })
  let snapshot = await repository.readSnapshot()
  expect(snapshot.library.albumRatings).toEqual([])
  const death = snapshot.library.albumGenreRatings[0]!
  await service.rateAlbumGenre({
    userAlbumId: entryId,
    genre: 'Power Metal',
    score: 4,
    expected: null,
  })
  await service.rateAlbum(entryId, 8)
  snapshot = await repository.readSnapshot()
  expect(
    snapshot.library.albumGenreRatings.find(
      (row) => row.genreKey === 'death metal',
    ),
  ).toEqual(death)
  expect(
    snapshot.library.albumGenreRatings.find(
      (row) => row.genreKey === 'power metal',
    ),
  ).not.toHaveProperty('referenceReleaseId')
  await service.removeAlbumRating(entryId, 8)
  expect((await repository.readSnapshot()).library.albumGenreRatings).toEqual(
    snapshot.library.albumGenreRatings,
  )
  await expect(
    service.removeRelease(
      edition.id,
      releaseRemovalToken(snapshot.catalog, edition.id),
    ),
  ).rejects.toMatchObject({ code: 'referenced_release' })
})

test('set/remove comparan la fila completa y rechazan género ajeno sin escrituras', async () => {
  const { repository, service, entryId } = await setup()
  const before = await repository.readSnapshot()
  await expect(
    service.rateAlbumGenre({
      userAlbumId: entryId,
      genre: 'Jazz',
      score: 7,
      expected: null,
    }),
  ).rejects.toMatchObject({
    issues: [
      expect.objectContaining({ params: { rule: 'genre_not_assigned' } }),
    ],
  })
  expect(await repository.readSnapshot()).toEqual(before)
  await service.rateAlbumGenre({
    userAlbumId: entryId,
    genre: 'DEATH  MÉTAL',
    score: 9,
    expected: null,
  })
  const note = (await repository.readSnapshot()).library.albumGenreRatings[0]!
  await service.rateAlbumGenre({
    userAlbumId: entryId,
    genre: 'Death Metal',
    score: 8,
    expected: note,
  })
  await expect(
    service.removeAlbumGenreRating({
      userAlbumId: entryId,
      genre: 'Death Metal',
      expected: note,
    }),
  ).rejects.toMatchObject({ rule: 'outdated_change' })
  expect(
    (await repository.readSnapshot()).library.albumGenreRatings[0]!.scoreUnits,
  ).toBe(16)
})

test('renombrado explícito conserva notas retiradas, referencias y fechas; colisiones no fusionan', async () => {
  const { repository, service, created, entryId } = await setup()
  await service.rateAlbumGenre({
    userAlbumId: entryId,
    genre: 'Death Metal',
    score: 9,
    expected: null,
  })
  await repository.mutate((snapshot) => {
    snapshot.library.userAlbums.push({
      ...snapshot.library.userAlbums[0]!,
      id: fixtureId(8000),
      deletedAt: '2026-10-25T13:00:00.000Z',
      updatedAt: '2026-10-25T13:00:00.000Z',
    })
    snapshot.library.albumGenreRatings.push({
      ...snapshot.library.albumGenreRatings[0]!,
      userAlbumId: fixtureId(8000),
      scoreUnits: 12,
    })
    return { snapshot, result: undefined }
  })
  const before = await repository.readSnapshot(),
    expected = genreRenameExpected(before, created.album.id, 'death metal')
  await expect(
    service.renameAlbumGenre({
      albumId: created.album.id,
      fromGenre: 'Death Metal',
      toGenre: 'Power Metal',
      expected,
    }),
  ).rejects.toMatchObject({ code: 'genre_conflict' })
  expect(await repository.readSnapshot()).toEqual(before)
  await service.renameAlbumGenre({
    albumId: created.album.id,
    fromGenre: 'Death Metal',
    toGenre: 'death melódico',
    expected,
  })
  const after = await repository.readSnapshot()
  expect(after.catalog.albums[0]!.genres).toEqual([
    'Death Melódico',
    'Power Metal',
  ])
  expect(after.library.albumGenreRatings).toEqual(
    before.library.albumGenreRatings.map((row) => ({
      ...row,
      genreKey: 'death melodico',
    })),
  )
  expect(after.library.userAlbums).toEqual(before.library.userAlbums)
})

test('editar etiquetas no retira notas, y un cambio concurrente bloquea renombrado', async () => {
  const { repository, service, created, entryId } = await setup()
  await service.rateAlbumGenre({
    userAlbumId: entryId,
    genre: 'Death Metal',
    score: 9,
    expected: null,
  })
  const before = await repository.readSnapshot(),
    expected = genreRenameExpected(before, created.album.id, 'Death Metal')
  const album = before.catalog.albums[0]!,
    artist = before.catalog.artists[0]!
  const fields = Object.fromEntries(
    Object.entries(album).filter(
      ([key]) => !['id', 'createdBy', 'catalogScope'].includes(key),
    ),
  )
  await expect(
    service.updateAlbum({
      ...fields,
      albumId: album.id,
      genres: ['Power Metal'],
      expected: buildAlbumEditExpected(before, album.id),
      artists: [{ artistId: artist.id, name: artist.name }],
    }),
  ).rejects.toMatchObject({ code: 'referenced_genre' })
  expect(await repository.readSnapshot()).toEqual(before)
  await service.rateAlbumGenre({
    userAlbumId: entryId,
    genre: 'Death Metal',
    score: 8,
    expected: before.library.albumGenreRatings[0],
  })
  const current = await repository.readSnapshot()
  await expect(
    service.renameAlbumGenre({
      albumId: created.album.id,
      fromGenre: 'Death Metal',
      toGenre: 'Death Técnico',
      expected,
    }),
  ).rejects.toMatchObject({ code: 'outdated_genre' })
  expect(await repository.readSnapshot()).toEqual(current)
})

test('la cuota durante el traslado revierte catálogo y filas de notas juntos', async () => {
  const { database, repository, service, created, entryId } = await setup()
  await service.rateAlbumGenre({
    userAlbumId: entryId,
    genre: 'Death Metal',
    score: 9,
    expected: null,
  })
  const before = await repository.readSnapshot()
  vi.spyOn(database.albumGenreRatings, 'bulkPut').mockRejectedValueOnce(
    new DOMException('cuota ficticia', 'QuotaExceededError'),
  )
  await expect(
    service.renameAlbumGenre({
      albumId: created.album.id,
      fromGenre: 'Death Metal',
      toGenre: 'Death Técnico',
      expected: genreRenameExpected(before, created.album.id, 'Death Metal'),
    }),
  ).rejects.toMatchObject({ code: 'quota_exceeded' })
  expect(await repository.readSnapshot()).toEqual(before)
})
