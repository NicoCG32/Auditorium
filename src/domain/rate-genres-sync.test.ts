import { expect, test } from 'vitest'
import { makeBackup } from './backup.fixture'
import { libraryIds, times } from './library/library.fixture'
import { mergeSnapshots, sameSnapshot, SyncConflict } from './sync'

function baseSnapshot() {
  const snapshot = makeBackup().data
  snapshot.catalog.albums[0]!.genres = ['Metal', 'Rock']
  snapshot.catalog.albums[1]!.genres = ['Metal']
  return snapshot
}

test('sync merges separate genre keys and personal entries without collapsing contextual records', () => {
  const base = baseSnapshot()
  const local = structuredClone(base)
  const remote = structuredClone(base)
  local.library.albumGenreRatings = [
    {
      userAlbumId: libraryIds.entry,
      genreKey: 'metal',
      scoreUnits: 18,
      updatedAt: times.updated,
    },
    {
      userAlbumId: libraryIds.otherEntry,
      genreKey: 'metal',
      scoreUnits: 10,
      updatedAt: times.updated,
    },
  ]
  remote.library.albumGenreRatings = [
    {
      userAlbumId: libraryIds.entry,
      genreKey: 'rock',
      scoreUnits: 12,
      updatedAt: times.updated,
    },
  ]
  const merged = mergeSnapshots(base, local, remote)
  expect(merged.library.albumGenreRatings).toHaveLength(3)
  expect(merged.library.albumGenreRatings).toEqual(
    expect.arrayContaining([
      ...local.library.albumGenreRatings,
      ...remote.library.albumGenreRatings,
    ]),
  )
  const reordered = structuredClone(merged)
  reordered.library.albumGenreRatings.reverse()
  expect(sameSnapshot(merged, reordered)).toBe(true)
})

test('different edits to the same entry and genre remain a sync conflict', () => {
  const base = baseSnapshot()
  base.library.albumGenreRatings = [
    {
      userAlbumId: libraryIds.entry,
      genreKey: 'metal',
      scoreUnits: 16,
      updatedAt: times.updated,
    },
  ]
  const local = structuredClone(base)
  const remote = structuredClone(base)
  local.library.albumGenreRatings[0]!.scoreUnits = 18
  remote.library.albumGenreRatings[0]!.scoreUnits = 20
  expect(() => mergeSnapshots(base, local, remote)).toThrow(SyncConflict)
})
