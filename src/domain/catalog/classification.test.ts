import { expect, test } from 'vitest'
import { albumSchema } from './schemas'
import { ids } from './catalog.fixture'
import {
  classificationFromLegacy,
  legacyReleaseTypeSchema,
} from './legacy-classification'
import { parseBackupDocument } from '../backup'
import { makeBackup } from '../backup.fixture'
import { legacyBackupFixture } from '../../test/legacy-backup.fixture'

test('EP, Demo e Inédito son independientes de géneros, ediciones y adquisiciones', () => {
  expect(
    albumSchema.parse({
      id: ids.album,
      title: 'Demo Ficticia',
      primaryType: 'ep',
      categories: ['demo', 'split'],
      publicationStatus: 'unreleased',
      genres: ['Metal'],
    }),
  ).toMatchObject({
    primaryType: 'ep',
    categories: ['demo', 'split'],
    publicationStatus: 'unreleased',
    genres: ['Metal'],
  })
  expect(
    albumSchema.parse({ id: ids.album, title: 'Sin clasificar' }),
  ).toMatchObject({
    primaryType: 'unspecified',
    categories: [],
    publicationStatus: 'unknown',
  })
})
test.each([
  { primaryType: 'demo' },
  { primaryType: 'deluxe' },
  { categories: ['metal'] },
  { categories: ['demo', 'demo'] },
  { publicationStatus: 'live' },
  { releaseType: 'album' },
])('clasificación inválida %j se rechaza', (fields) => {
  expect(
    albumSchema.safeParse({
      id: ids.album,
      title: 'Prueba Ficticia',
      ...fields,
    }).success,
  ).toBe(false)
})
test.each(legacyReleaseTypeSchema.options)(
  'respaldo histórico %s conserva identidad, relaciones, metadatos y enlaces',
  (type) => {
    const current = makeBackup()
    const entryDate = current.data.library.userAlbums[0]!.updatedAt
    current.data.library.userAlbums[0]!.links = [
      {
        id: ids.missing,
        purpose: 'playback',
        url: 'https://music.example/album',
        createdAt: entryDate,
        updatedAt: entryDate,
      },
    ]
    current.data.library.userAlbums[0]!.preferredPlaybackLinkId = ids.missing
    const old = legacyBackupFixture(current, 4)
    old.data.catalog.albums[0]!.releaseType = type
    const before = structuredClone(old)
    const migrated = parseBackupDocument(old)
    expect(migrated.schemaVersion).toBe(5)
    expect(migrated.data).toEqual({
      ...current.data,
      catalog: {
        ...current.data.catalog,
        albums: current.data.catalog.albums.map((album, index) =>
          index === 0 ? { ...album, ...classificationFromLegacy(type) } : album,
        ),
      },
    })
    expect(old).toEqual(before)
    for (const schemaVersion of [1, 2, 3, 4])
      expect(() =>
        parseBackupDocument({ ...migrated, schemaVersion }),
      ).toThrow()
  },
)
