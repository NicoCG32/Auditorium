import { expect, test } from 'vitest'
import { makeBackup } from './backup.fixture'
import {
  BackupError,
  MAX_BACKUP_BYTES,
  checkBackupSize,
  parseBackupDocument,
  parseBackupText,
  serializeBackup,
  isEmptySnapshot,
} from './backup'
import { fixtureId, ids } from './catalog/catalog.fixture'

test('JSON versionado completo conserva IDs, relaciones, identidad, retirados y notas literales; no incluye índices técnicos', () => {
  const backup = makeBackup(),
    before = structuredClone(backup),
    text = serializeBackup(backup)
  expect(parseBackupText(text)).toEqual(backup)
  expect(backup).toEqual(before)
  expect(text).not.toContain('activeAlbumKey')
  expect(text).not.toContain('local_identity')
  expect(
    parseBackupText(text).data.library.userAlbums[1]?.deletedAt,
  ).toBeDefined()
  expect(parseBackupText(text).data.library.ownedItems[0]?.notes).toBe(
    '  Copia ficticia.\nSegunda línea.  ',
  )
})
test.each(['', '{', 'null', '[]', '   '])(
  'archivo vacío o JSON inválido/ajeno %# se rechaza',
  (text) => {
    expect(() => parseBackupText(text)).toThrow(BackupError)
  },
)
test.each([0, 2, 3, '1', null])(
  'versión no compatible %s se rechaza antes de interpretar sus datos',
  (schemaVersion) => {
    expect(() =>
      parseBackupDocument({ ...makeBackup(), schemaVersion, data: {} }),
    ).toThrow('versión')
  },
)
test('tamaño se mide en bytes UTF-8, incluido BOM; el límite exacto es permitido', () => {
  expect(() => checkBackupSize(MAX_BACKUP_BYTES)).not.toThrow()
  expect(() => checkBackupSize(MAX_BACKUP_BYTES + 1)).toThrow('20 MiB')
  const oversized = 'é'.repeat(MAX_BACKUP_BYTES / 2 + 1)
  expect(oversized.length).toBeLessThan(MAX_BACKUP_BYTES)
  expect(() => parseBackupText(oversized)).toThrow('20 MiB')
  const text = serializeBackup(makeBackup())
  expect(parseBackupText('\uFEFF' + text)).toEqual(makeBackup())
})
test.each(['identity', 'catalog', 'library'])(
  'snapshot sin %s o con campos ajenos no se acepta',
  (field) => {
    const input: Record<string, unknown> = { ...makeBackup().data }
    delete input[field]
    expect(() =>
      parseBackupDocument({ ...makeBackup(), data: input }),
    ).toThrow()
    expect(() =>
      parseBackupDocument({
        ...makeBackup(),
        credentials: 'Campo ficticio ajeno',
      }),
    ).toThrow()
  },
)
test.each(['ownedItems', 'purchaseWishes'])(
  'colección %s ausente no se inventa en un respaldo v1',
  (field) => {
    const backup = makeBackup(),
      library: Record<string, unknown> = { ...backup.data.library }
    delete library[field]
    expect(() =>
      parseBackupDocument({ ...backup, data: { ...backup.data, library } }),
    ).toThrow()
  },
)
test.each(['owner', 'duplicate', 'edition', 'track', 'date'])(
  'datos incoherentes %s se rechazan antes de restaurar',
  (kind) => {
    const backup = makeBackup()
    if (kind === 'owner')
      backup.data.library.userAlbums[0]!.userId = fixtureId(999)
    if (kind === 'duplicate')
      backup.data.catalog.albums.push(backup.data.catalog.albums[0]!)
    if (kind === 'edition')
      backup.data.library.ownedItems[0]!.releaseId = ids.missing
    if (kind === 'track')
      backup.data.catalog.releaseTracks[0]!.trackId = ids.missing
    if (kind === 'date')
      backup.data.library.userAlbums[0]!.updatedAt = '2026-02-30T00:00:00.000Z'
    expect(() => parseBackupDocument(backup)).toThrow(BackupError)
  },
)
test('vacía significa todas las colecciones sin filas; retirados y catálogo sin entradas también cuentan', () => {
  const snapshot = makeBackup().data
  expect(isEmptySnapshot(snapshot)).toBe(false)
  const empty = structuredClone(snapshot)
  for (const rows of Object.values(empty.catalog)) rows.splice(0)
  for (const rows of Object.values(empty.library)) rows.splice(0)
  expect(isEmptySnapshot(empty)).toBe(true)
  empty.catalog.artists = snapshot.catalog.artists
  expect(isEmptySnapshot(empty)).toBe(false)
  empty.catalog.artists = []
  empty.library.userAlbums = [snapshot.library.userAlbums[1]!]
  expect(isEmptySnapshot(empty)).toBe(false)
})
