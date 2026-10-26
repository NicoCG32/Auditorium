import { expect, test } from 'vitest'
import {
  legacySnapshotV6Schema,
  localSnapshotSchema,
  migrateSnapshotV6,
  parseBackupDocument,
  parseBackupText,
  serializeBackup,
} from './backup'
import { makeBackup } from './backup.fixture'
import { ids } from './catalog/catalog.fixture'
import { libraryIds, times } from './library/library.fixture'
import { legacySnapshotFixture } from '../test/legacy-backup.fixture'

function historicalBackup(version: number) {
  const current = makeBackup()
  const data = version < 5 ? legacySnapshotFixture(current.data) : current.data
  return {
    ...current,
    schemaVersion: version,
    data: {
      ...data,
      library: Object.fromEntries(
        Object.entries(data.library).filter(
          ([key]) => key !== 'albumGenreRatings',
        ),
      ),
    },
  }
}

test.each([1, 2, 3, 4, 5, 6])(
  'JSON v%s adds only an empty contextual collection and rejects future fields',
  (version) => {
    const legacy = historicalBackup(version)
    const before = structuredClone(legacy)
    expect(parseBackupDocument(legacy)).toEqual(makeBackup())
    expect(legacy).toEqual(before)
    expect(() =>
      parseBackupDocument({
        ...legacy,
        data: {
          ...legacy.data,
          library: { ...legacy.data.library, albumGenreRatings: [] },
        },
      }),
    ).toThrow()
  },
)

test('strict v6 preserves its reference rating, personal text and IDs while migrating to v7', () => {
  const legacy = historicalBackup(6)
  const snapshot = legacySnapshotV6Schema.parse(legacy.data)
  snapshot.library.albumRatings[0]!.referenceReleaseId = ids.deluxe
  const before = structuredClone(snapshot)
  const migrated = migrateSnapshotV6(snapshot)
  expect(migrated).toEqual({
    ...before,
    library: { ...before.library, albumGenreRatings: [] },
  })
  expect(snapshot).toEqual(before)
  expect(() =>
    legacySnapshotV6Schema.parse({
      ...snapshot,
      library: { ...snapshot.library, albumGenreRatings: [] },
    }),
  ).toThrow()
})

test('v7 requires its contextual array and preserves independent ratings in a JSON round trip', () => {
  const backup = makeBackup()
  backup.data.catalog.albums[0]!.genres = ['Métal Progresivo', 'Rock']
  backup.data.library.albumGenreRatings = [
    {
      userAlbumId: libraryIds.entry,
      genreKey: 'metal progresivo',
      scoreUnits: 2,
      updatedAt: times.updated,
      referenceReleaseId: ids.original,
    },
    {
      userAlbumId: libraryIds.entry,
      genreKey: 'rock',
      scoreUnits: 20,
      updatedAt: times.later,
    },
  ]
  expect(parseBackupText(serializeBackup(backup))).toEqual(backup)
  expect(backup.data.library.albumRatings[0]!.scoreUnits).toBe(19)
  expect(() => localSnapshotSchema.parse(historicalBackup(6).data)).toThrow()
  expect(() =>
    parseBackupDocument({ ...backup, data: historicalBackup(6).data }),
  ).toThrow()
})
