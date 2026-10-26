// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, test, vi } from 'vitest'
import { makeBackup } from '../domain/backup.fixture'
import { ids } from '../domain/catalog/catalog.fixture'
import { libraryIds } from '../domain/library/library.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { MusicLibrary } from './music-library'
import { experienceExpected } from './album-experience'
import type { LocalSnapshot } from '../domain/repositories/local-repository'
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
  const db = new AuditoriumDatabase('genre-experience', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
  databases.push(db)
  const repository = new IndexedDbRepository({
    database: db,
    createId: () => makeBackup().data.identity.userId,
    now: () => new Date(makeBackup().data.identity.createdAt),
  })
  const snapshot = makeBackup().data
  snapshot.catalog.albums.find((row) => row.id === ids.album)!.genres = [
    'Death Metal',
    'Power Metal',
  ]
  await repository.mutate(() => ({ snapshot, result: undefined }))
  let time = '2026-10-26T12:00:00.000Z'
  const service = new MusicLibrary(repository, { now: () => new Date(time) })
  return {
    db,
    repository,
    service,
    advance: () => {
      time = '2026-10-26T13:00:00.000Z'
    },
  }
}
function request(snapshot: LocalSnapshot) {
  return {
    listeningStatus: 'completed',
    personalNotes: 'Experiencia ficticia.',
    rating: { score: 6.5, referenceReleaseId: ids.original },
    genreRatings: [
      { genreKey: 'death metal', score: 9, referenceReleaseId: ids.deluxe },
      { genreKey: 'power metal', score: 3 },
    ],
    expected: experienceExpected(snapshot, libraryIds.entry, true),
  }
}
test('guarda general, géneros y referencias propias juntos, sin inferir adquisiciones ni pistas', async () => {
  const { repository, service } = await setup(),
    before = await repository.readSnapshot()
  await service.saveAlbumExperience(libraryIds.entry, request(before))
  const after = await repository.readSnapshot()
  expect(
    after.library.albumRatings.find(
      (row) => row.userAlbumId === libraryIds.entry,
    ),
  ).toMatchObject({ scoreUnits: 13, referenceReleaseId: ids.original })
  expect(after.library.albumGenreRatings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        genreKey: 'death metal',
        scoreUnits: 18,
        referenceReleaseId: ids.deluxe,
      }),
      expect.objectContaining({ genreKey: 'power metal', scoreUnits: 6 }),
    ]),
  )
  expect(
    after.library.albumGenreRatings.find(
      (row) => row.genreKey === 'power metal',
    ),
  ).not.toHaveProperty('referenceReleaseId')
  expect(after.library.ownedItems).toEqual(before.library.ownedItems)
  expect(after.library.trackRatings).toEqual(before.library.trackRatings)
  expect(after.catalog).toEqual(before.catalog)
})
test('quitar general no quita géneros; omitir un género retira sólo su nota y una nota intacta conserva su fecha', async () => {
  const { repository, service, advance } = await setup()
  await service.saveAlbumExperience(
    libraryIds.entry,
    request(await repository.readSnapshot()),
  )
  const before = await repository.readSnapshot()
  advance()
  const { rating: _rating, ...rest } = request(before)
  expect(_rating.score).toBe(6.5)
  await service.saveAlbumExperience(libraryIds.entry, {
    ...rest,
    genreRatings: [rest.genreRatings[0]],
  })
  const after = await repository.readSnapshot()
  expect(
    after.library.albumRatings.filter(
      (row) => row.userAlbumId === libraryIds.entry,
    ),
  ).toEqual([])
  expect(after.library.albumGenreRatings).toEqual(
    before.library.albumGenreRatings.filter(
      (row) => row.genreKey === 'death metal',
    ),
  )
})
test.each(['rating', 'label'])(
  'CAS detecta cambio de %s sin guardar parte de la experiencia',
  async (kind) => {
    const { repository, service } = await setup(),
      draft = request(await repository.readSnapshot())
    if (kind === 'rating')
      await service.rateAlbumGenre({
        userAlbumId: libraryIds.entry,
        genre: 'Death Metal',
        score: 1,
        expected: null,
      })
    else
      await repository.mutate((snapshot) => {
        snapshot.catalog.albums.find((row) => row.id === ids.album)!.genres = [
          'Death Metal',
          'Heavy Metal',
        ]
        return { snapshot, result: undefined }
      })
    const current = await repository.readSnapshot()
    await expect(
      service.saveAlbumExperience(libraryIds.entry, draft),
    ).rejects.toMatchObject({ code: 'outdated_experience' })
    expect(await repository.readSnapshot()).toEqual(current)
  },
)
test('referencia ajena o género no asignado abortan el guardado completo', async () => {
  const { repository, service } = await setup(),
    before = await repository.readSnapshot()
  for (const genreRatings of [
    [{ genreKey: 'death metal', score: 8, referenceReleaseId: ids.missing }],
    [{ genreKey: 'jazz', score: 8 }],
  ]) {
    await expect(
      service.saveAlbumExperience(libraryIds.entry, {
        ...request(before),
        genreRatings,
      }),
    ).rejects.toThrow()
    expect(await repository.readSnapshot()).toEqual(before)
  }
})
test('cuota en notas por género revierte escucha, comentario, general y notas', async () => {
  const { db, repository, service } = await setup(),
    before = await repository.readSnapshot()
  vi.spyOn(db.albumGenreRatings, 'bulkPut').mockRejectedValueOnce(
    new DOMException('Fictitious quota', 'QuotaExceededError'),
  )
  await expect(
    service.saveAlbumExperience(libraryIds.entry, request(before)),
  ).rejects.toMatchObject({ code: 'quota_exceeded' })
  expect(await repository.readSnapshot()).toEqual(before)
})
test('llamada general histórica conserva notas contextuales y no permite cambiarlas sin CAS propio', async () => {
  const { repository, service } = await setup()
  await service.saveAlbumExperience(
    libraryIds.entry,
    request(await repository.readSnapshot()),
  )
  const before = await repository.readSnapshot(),
    expected = experienceExpected(before, libraryIds.entry)
  await expect(
    service.saveAlbumExperience(libraryIds.entry, {
      ...request(before),
      expected,
    }),
  ).rejects.toThrow()
  await service.saveAlbumExperience(libraryIds.entry, {
    listeningStatus: 'queued',
    expected,
  })
  expect((await repository.readSnapshot()).library.albumGenreRatings).toEqual(
    before.library.albumGenreRatings,
  )
})
