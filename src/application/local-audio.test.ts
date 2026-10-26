// @vitest-environment node
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  AudioError,
  audioDraftDirty,
  audioItem,
  audioScope,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_FILE_BYTES,
  validateAudioBudget,
  type AudioDraft,
} from '../domain/audio'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import { AuditoriumDatabase, SCHEMA_V9 } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { toStoredUserAlbum } from '../infrastructure/db/records'
import { syntheticAudio } from '../test/audio.fixture'
import { legacySnapshotV6Fixture } from '../test/legacy-backup.fixture'
import { MusicLibrary } from './music-library'
import { LocalAudio } from './local-audio'
import { LibraryBackups } from './library-backups'
import { buildAlbumEditExpected } from './album-edit'

let factory: IDBFactory, databases: Dexie[]
beforeEach(() => {
  factory = new IDBFactory()
  databases = []
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases) db.close()
  for (const db of new Map(databases.map((db) => [db.name, db])).values())
    await db.delete()
})
function connect(name = 'audio-test') {
  const database = new AuditoriumDatabase(name, {
    indexedDB: factory,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  return {
    database,
    repository,
    audio: new LocalAudio(repository),
    music: new MusicLibrary(repository),
  }
}
async function seed(name?: string) {
  const result = connect(name),
    snapshot = makeBackup().data
  await result.repository.mutate(() => ({ snapshot, result: undefined }))
  return { ...result, snapshot }
}
async function draft(
  scope = audioScope(makeBackup().data.identity),
): Promise<AudioDraft> {
  return { scope, base: [], items: [await syntheticAudio()] }
}

test('persisted bytes survive reopening, stay out of JSON/checkpoint and do not change music, rating or acquisition', async () => {
  const source = await seed(),
    before = await source.repository.readSnapshot()
  await source.audio.save(libraryIds.entry, await draft())
  source.repository.close()
  const reopened = connect()
  const [row] = await reopened.audio.list()
  const file = await reopened.audio.read(row!.id)
  expect(file.bytes).toEqual((await syntheticAudio()).bytes)
  expect(await reopened.repository.readSnapshot()).toEqual(before)
  const exported = await new LibraryBackups(reopened.repository).export()
  expect(exported.text).not.toContain('Tono Sintético')
  expect(
    JSON.stringify(await reopened.repository.readSyncFrame()),
  ).not.toContain('sha256')
  await reopened.audio.save(libraryIds.entry, {
    scope: row!.scope,
    base: [row!],
    items: [],
  })
  expect(await reopened.database.audioFiles.count()).toBe(0)
  expect(await reopened.repository.readSnapshot()).toEqual(before)
})
test('a quota error rolls back album edits and both audio tables, while the previous file remains readable', async () => {
  const source = await seed()
  await source.audio.save(libraryIds.entry, await draft())
  const before = await source.repository.readSnapshot(),
    base = await source.audio.list()
  const candidate = await syntheticAudio(base[0]!.id)
  candidate.name = 'Reemplazo.wav'
  vi.spyOn(source.database.audioFiles, 'bulkPut').mockRejectedValueOnce(
    new DOMException('Injected quota', 'QuotaExceededError'),
  )
  const expected = buildAlbumEditExpected(before, ids.album)
  const fields = Object.fromEntries(
    Object.entries(expected.album).filter(
      ([key]) => !['id', 'catalogScope', 'createdBy'].includes(key),
    ),
  )
  await expect(
    source.music.updateAlbum(
      {
        ...fields,
        albumId: ids.album,
        expected,
        title: 'Título Nuevo',
        artists: expected.credits.map((credit) => ({
          artistId: credit.artistId,
          name: expected.artists.find((row) => row.id === credit.artistId)!
            .name,
          role: credit.role,
        })),
      },
      { scope: base[0]!.scope, base, items: [candidate] },
    ),
  ).rejects.toMatchObject({ code: 'quota_exceeded' })
  expect(await source.repository.readSnapshot()).toEqual(before)
  expect(await source.audio.list()).toEqual(base)
  expect((await source.audio.read(base[0]!.id)).attachment.name).toBe(
    'Tono Sintético.wav',
  )
})
test('concurrent audio replacement rejects stale drafts without discarding the newer file', async () => {
  const source = await seed()
  await source.audio.save(libraryIds.entry, await draft())
  const base = await source.audio.list(),
    scope = base[0]!.scope
  const replacement = {
    ...(await syntheticAudio(base[0]!.id)),
    name: 'Nuevo.wav',
  }
  await source.audio.save(libraryIds.entry, {
    scope,
    base,
    items: [replacement],
  })
  await expect(
    source.audio.save(libraryIds.entry, { scope, base, items: [] }),
  ).rejects.toMatchObject({ code: 'conflict' })
  expect((await source.audio.list())[0]!.name).toBe('Nuevo.wav')
})
test('foreign scope/track and missing new bytes reject without changing either table', async () => {
  const source = await seed(),
    valid = await draft()
  await expect(
    source.audio.save(libraryIds.entry, { ...valid, scope: 'another-library' }),
  ).rejects.toBeInstanceOf(AudioError)
  await expect(
    source.audio.save(libraryIds.entry, {
      ...valid,
      items: [{ ...valid.items[0]!, trackId: fixtureId(123456) }],
    }),
  ).rejects.toMatchObject({ code: 'reference' })
  const metadata = audioItem(valid.items[0]!)
  await expect(
    source.audio.save(libraryIds.entry, { ...valid, items: [metadata] }),
  ).rejects.toMatchObject({ code: 'missing' })
  expect(await source.database.audioFiles.count()).toBe(0)
})
test('missing or corrupted bytes do not hide the album and cannot be exported or played as valid audio', async () => {
  const source = await seed()
  await source.audio.save(libraryIds.entry, await draft())
  const [row] = await source.audio.list()
  await source.database.audioFiles.delete([row!.scope, row!.id])
  expect((await source.repository.readSnapshot()).library.userAlbums).toEqual(
    source.snapshot.library.userAlbums,
  )
  await expect(source.audio.read(row!.id)).rejects.toMatchObject({
    code: 'missing',
  })
  await source.database.audioFiles.put({
    scope: row!.scope,
    id: row!.id,
    bytes: new Uint8Array(row!.size),
  })
  await expect(source.audio.read(row!.id)).rejects.toMatchObject({
    code: 'integrity',
  })
})
test('retirement retains audio and removing a referenced track requires explicit reassociation', async () => {
  const source = await seed(),
    value = await draft()
  value.items[0]!.trackId = ids.demo
  await source.audio.save(libraryIds.entry, value)
  await source.repository.mutate((snapshot) => {
    snapshot.library.userAlbums[0]!.deletedAt = times.later
    snapshot.library.userAlbums[0]!.updatedAt = times.later
    return { snapshot, result: undefined }
  })
  expect(await source.audio.list()).toHaveLength(1)
  const removeTrack = (snapshot: typeof source.snapshot) => {
    snapshot.catalog.tracks = snapshot.catalog.tracks.filter(
      (row) => row.id !== ids.demo,
    )
    snapshot.catalog.coreTracks = snapshot.catalog.coreTracks.filter(
      (row) => row.trackId !== ids.demo,
    )
    snapshot.catalog.releaseTracks = snapshot.catalog.releaseTracks.filter(
      (row) => row.trackId !== ids.demo,
    )
    snapshot.library.trackRatings = snapshot.library.trackRatings.filter(
      (row) => row.trackId !== ids.demo,
    )
    return { snapshot, result: undefined }
  }
  await expect(source.repository.mutate(removeTrack)).rejects.toMatchObject({
    code: 'reference',
  })
  const rows = await source.audio.list()
  await source.audio.save(libraryIds.entry, {
    scope: rows[0]!.scope,
    base: rows,
    items: rows.map((row) => ({ ...audioItem(row), trackId: undefined })),
  })
  expect((await source.audio.list())[0]!.trackId).toBeUndefined()
  await source.repository.mutate(removeTrack)
})
test('exact byte/count limits and replacement dirty state avoid serializing byte arrays', async () => {
  expect(() =>
    validateAudioBudget(
      Array.from({ length: 8 }, () => ({ size: MAX_AUDIO_FILE_BYTES })),
    ),
  ).not.toThrow()
  expect(() =>
    validateAudioBudget([{ size: MAX_AUDIO_FILE_BYTES + 1 }]),
  ).toThrow('16 MiB')
  expect(() =>
    validateAudioBudget([
      ...Array.from({ length: 8 }, () => ({ size: MAX_AUDIO_FILE_BYTES })),
      { size: 1 },
    ]),
  ).toThrow('128 MiB')
  expect(() =>
    validateAudioBudget(Array.from({ length: 129 }, () => ({ size: 1 }))),
  ).toThrow('128 adjuntos')
  expect(MAX_AUDIO_BYTES).toBe(MAX_AUDIO_FILE_BYTES * 8)
  const source = await seed()
  await source.audio.save(libraryIds.entry, await draft())
  const base = await source.audio.list(),
    value = { scope: base[0]!.scope, base, items: base.map(audioItem) }
  expect(audioDraftDirty(value)).toBe(false)
  expect(audioDraftDirty({ ...value, items: [] })).toBe(true)
})
test('DB9 upgrades preserve reference rating/checkpoint and create empty local-only audio stores', async () => {
  const snapshot = makeBackup().data
  snapshot.library.albumRatings[0]!.referenceReleaseId = ids.deluxe
  const historical = legacySnapshotV6Fixture(snapshot)
  const previous = new Dexie('upgrade-audio', {
    indexedDB: factory,
    IDBKeyRange,
  })
  databases.push(previous)
  previous.version(9).stores(SCHEMA_V9)
  await previous.open()
  await previous.transaction('rw', previous.tables, async () => {
    for (const [table, rows] of Object.entries({
      ...historical.catalog,
      ...historical.library,
      metadata: [{ key: 'local_identity', ...historical.identity }],
      userAlbums: historical.library.userAlbums.map(toStoredUserAlbum),
      syncCheckpoint: [{ key: 'cloud', revision: 1, base: historical }],
    }))
      await previous.table(table).bulkPut(rows)
  })
  previous.close()
  const current = connect('upgrade-audio')
  expect(await current.repository.readSnapshot()).toEqual(snapshot)
  expect(current.database.backendDB().version).toBe(110)
  expect(await current.database.albumGenreRatings.count()).toBe(0)
  expect(await current.audio.list()).toEqual([])
  expect((await current.repository.readSyncFrame()).checkpoint.base).toEqual(
    snapshot,
  )
})

test('playback rejects a stale filename, different album association or foreign scope', async () => {
  const source = await seed()
  await source.audio.save(libraryIds.entry, await draft())
  const row = (await source.audio.list())[0]!
  for (const expected of [
    { ...row, name: 'Otro Archivo.wav' },
    { ...row, userAlbumId: libraryIds.otherEntry },
    { ...row, scope: 'foreign-scope' },
  ])
    await expect(
      source.audio.read(row.id, undefined, expected),
    ).rejects.toBeInstanceOf(AudioError)
  expect((await source.audio.read(row.id, undefined, row)).attachment).toEqual(
    row,
  )
})

test('DB9 → DB10 rejects an invalid reference inside its v6 checkpoint without rewriting the database', async () => {
  const snapshot = legacySnapshotV6Fixture(makeBackup().data),
    bad = structuredClone(snapshot)
  bad.library.albumRatings[0]!.referenceReleaseId = ids.missing
  const checkpoint = { key: 'cloud', revision: 1, base: bad }
  const previous = new Dexie('invalid-upgrade-audio', {
    indexedDB: factory,
    IDBKeyRange,
  })
  databases.push(previous)
  previous.version(9).stores(SCHEMA_V9)
  await previous.open()
  await previous.transaction('rw', previous.tables, async () => {
    for (const [table, rows] of Object.entries({
      ...snapshot.catalog,
      ...snapshot.library,
      metadata: [{ key: 'local_identity', ...snapshot.identity }],
      userAlbums: snapshot.library.userAlbums.map(toStoredUserAlbum),
      syncCheckpoint: [checkpoint],
    }))
      await previous.table(table).bulkPut(rows)
  })
  const before = await previous.table('syncCheckpoint').toArray()
  previous.close()
  const current = connect('invalid-upgrade-audio')
  await expect(current.repository.readSnapshot()).rejects.toThrow()
  current.database.close()
  await previous.open()
  expect(previous.backendDB().version).toBe(90)
  expect(await previous.table('syncCheckpoint').toArray()).toEqual(before)
  expect(previous.tables.some((table) => table.name === 'audioFiles')).toBe(
    false,
  )
})
