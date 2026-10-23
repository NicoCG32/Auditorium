// @vitest-environment node
import Dexie from 'dexie'
import {
  legacyBackupFixture,
  legacySnapshotFixture,
} from '../test/legacy-backup.fixture'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, test } from 'vitest'
import { MusicLibrary } from './music-library'
import { buildAlbumEditExpected } from './album-edit'
import { personalLinksFrom } from './personal-links'
import { mergeSnapshots, SyncConflict } from '../domain/sync'
import {
  personalLinksInputSchema,
  linkProvider,
  type PersonalLinksInput,
} from '../domain/library/personal-links'
import {
  parseBackupDocument,
  serializeBackup,
  parseBackupText,
} from '../domain/backup'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId } from '../domain/catalog/catalog.fixture'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { AuditoriumDatabase, SCHEMA_V6 } from '../infrastructure/db/database'
import { toStoredUserAlbum } from '../infrastructure/db/records'
import { personalEntryToken } from '../domain/library/personal-entry'

const databases: Dexie[] = []
afterEach(async () => {
  for (const db of databases) db.close()
  for (const db of databases) await db.delete()
  databases.length = 0
})
function setup(factory = new IDBFactory(), name = 'personal-links') {
  const database = new AuditoriumDatabase(name, {
    indexedDB: factory,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => fixtureId(9900),
    now: () => new Date('2026-01-01T00:00:00Z'),
  })
  let next = 10000
  const service = new MusicLibrary(repository, {
    createId: () => fixtureId(next++),
    now: () => new Date('2026-10-20T00:00:00Z'),
  })
  return { database, repository, service }
}
const first = {
  id: fixtureId(30001),
  purpose: 'playback' as const,
  url: 'https://open.spotify.com/album/' + 'a'.repeat(22),
  label: 'Versión original',
}
const second = {
  id: fixtureId(30002),
  purpose: 'playback' as const,
  url: 'https://www.youtube.com/watch?v=ficticio_01',
}
const shop = {
  id: fixtureId(30003),
  purpose: 'purchase' as const,
  url: 'https://tienda.example/album/umbral',
}
const input = {
  links: [first, second, shop],
  preferredPlaybackLinkId: first.id,
}
const album = {
  title: 'Álbum Ficticio',
  artists: [{ name: 'Banda Ficticia' }],
  personalLinks: input,
}

test.each([
  'javascript:alert(1)',
  'data:text/html,<script>1</script>',
  'http://example.com',
  'https://user:password@example.com',
  'https://example.com/<script>',
  'https://example.com/a b',
  '<iframe src="https://example.com"></iframe>',
])('rechaza URL insegura o ajena a HTTPS: %s', (url) => {
  expect(
    personalLinksInputSchema.safeParse({ links: [{ ...first, url }] }).success,
  ).toBe(false)
})
test('proveedor se deriva del host exacto; etiquetas y dominios parecidos no autorizan integraciones', () => {
  expect(linkProvider(first.url)).toBe('Spotify')
  expect(linkProvider(second.url)).toBe('YouTube')
  expect(linkProvider('https://banda.bandcamp.com/album/ficticio')).toBe(
    'Bandcamp',
  )
  expect(linkProvider('https://open.spotify.com.example/album/a')).toBe(
    'open.spotify.com.example',
  )
  expect(
    personalLinksInputSchema.parse({
      links: [
        { ...shop, url: 'https://TIENDA.example:443/album?edition=1#tracks' },
      ],
    }).links[0]!.url,
  ).toBe('https://tienda.example/album?edition=1#tracks')
})
test('contrato rechaza duplicados, exceso, ID repetido y favoritos ajenos o de compra', () => {
  for (const invalid of [
    { links: [first, { ...first, id: second.id }] },
    { links: [first, { ...second, id: first.id }] },
    { links: [shop], preferredPlaybackLinkId: shop.id },
    { links: [first], preferredPlaybackLinkId: second.id },
    {
      links: Array.from({ length: 21 }, (_, i) => ({
        ...first,
        id: fixtureId(31000 + i),
        url: `https://example.com/${i}`,
      })),
    },
  ])
    expect(personalLinksInputSchema.safeParse(invalid).success).toBe(false)
})
test('alta atómica persiste enlaces, favorito e identidad sin inferir nota, escucha o propiedad', async () => {
  const factory = new IDBFactory(),
    { repository, service } = setup(factory)
  const created = await service.registerAlbum(album)
  expect(created.status).toBe('created')
  const before = await repository.readSnapshot(),
    entry = before.library.userAlbums[0]!
  expect(entry.links).toHaveLength(3)
  expect(entry.preferredPlaybackLinkId).toBe(first.id)
  expect(entry.listeningStatus).toBe('untracked')
  expect(before.library.albumRatings).toEqual([])
  expect(before.library.ownedItems).toEqual([])
  repository.close()
  expect(await setup(factory).repository.readSnapshot()).toEqual(before)
  const backup = parseBackupText(
    serializeBackup({
      format: 'auditorium-backup',
      schemaVersion: 6,
      exportedAt: '2026-10-20T00:00:00.000Z',
      data: before,
    }),
  )
  const destination = setup(new IDBFactory(), 'restored-links').repository
  await destination.restoreEmpty(backup.data, await destination.open())
  expect(await destination.readSnapshot()).toEqual(before)
})
function editInput(
  snapshot: Awaited<ReturnType<IndexedDbRepository['readSnapshot']>>,
  personalLinks: PersonalLinksInput,
) {
  const expected = buildAlbumEditExpected(
    snapshot,
    snapshot.catalog.albums[0]!.id,
  )
  const fields = Object.fromEntries(
    Object.entries(expected.album).filter(
      ([key]) => !['id', 'createdBy', 'catalogScope'].includes(key),
    ),
  )
  return {
    ...fields,
    albumId: expected.album.id,
    expected,
    expectedLinks: personalLinksFrom(snapshot.library.userAlbums[0]!),
    personalLinks,
    artists: expected.credits.map((credit) => {
      const artist = expected.artists.find((row) => row.id === credit.artistId)!
      return { artistId: artist.id, name: artist.name, role: credit.role }
    }),
  }
}
test('cambiar favorito, editar y quitar enlaces conserva alternativas, nota y datos independientes', async () => {
  const { repository, service } = setup()
  await service.registerAlbum(album)
  const initial = await repository.readSnapshot(),
    entry = initial.library.userAlbums[0]!
  await service.rateAlbum(entry.id, 8.5)
  const before = await repository.readSnapshot()
  await service.updateAlbum(
    editInput(before, { ...input, preferredPlaybackLinkId: second.id }),
  )
  const changed = await repository.readSnapshot()
  expect(changed.library.userAlbums[0]!.links).toEqual(entry.links)
  expect(changed.library.userAlbums[0]!.preferredPlaybackLinkId).toBe(second.id)
  expect(changed.library.albumRatings).toEqual(before.library.albumRatings)
  await service.updateAlbum(
    editInput(changed, { links: [{ ...first, label: 'Otro nombre' }, shop] }),
  )
  const after = await repository.readSnapshot()
  expect(after.library.userAlbums[0]!.preferredPlaybackLinkId).toBeUndefined()
  expect(after.library.userAlbums[0]!.links?.map((row) => row.id)).toEqual([
    first.id,
    shop.id,
  ])
  expect(after.library.ownedItems).toEqual([])
})
test('un cambio concurrente de enlaces bloquea metadatos y enlaces como una unidad', async () => {
  const { repository, service } = setup()
  await service.registerAlbum(album)
  const original = await repository.readSnapshot()
  const stale = {
    ...editInput(original, input),
    title: 'Título que no debe escribirse',
  }
  await service.updatePersonalExperience(original.library.userAlbums[0]!.id, {
    listeningStatus: 'completed',
    personalNotes: 'Experiencia ficticia concurrente',
  })
  await service.updateAlbum(
    editInput(original, { ...input, preferredPlaybackLinkId: second.id }),
  )
  const before = await repository.readSnapshot()
  expect(before.library.userAlbums[0]!.personalNotes).toBe(
    'Experiencia ficticia concurrente',
  )
  expect(before.library.userAlbums[0]!.listeningStatus).toBe('completed')
  await expect(service.updateAlbum(stale)).rejects.toMatchObject({
    code: 'outdated_links',
  })
  expect(await repository.readSnapshot()).toEqual(before)
  await expect(
    service.registerAlbum({
      ...album,
      title: 'Alta inválida',
      personalLinks: { links: [{ ...first, url: 'javascript:alert(1)' }] },
    }),
  ).rejects.toThrow()
  expect(await repository.readSnapshot()).toEqual(before)
})
test('reutilizar un álbum añade enlaces atómicamente, deduplica y preserva alternativas', async () => {
  const { repository, service } = setup()
  await service.registerAlbum(album)
  const before = await repository.readSnapshot(),
    entry = before.library.userAlbums[0]!
  const existing = await service.addAlbumToLibrary(
    entry.albumId,
    {
      links: [
        { ...first, id: fixtureId(32000) },
        { ...second, id: fixtureId(32001), url: 'https://otro.example/album' },
      ],
      preferredPlaybackLinkId: fixtureId(32000),
    },
    personalLinksFrom(entry),
  )
  expect(existing.id).toBe(entry.id)
  expect(existing.links).toHaveLength(4)
  expect(existing.preferredPlaybackLinkId).toBe(first.id)
  await expect(
    service.addAlbumToLibrary(entry.albumId, input, personalLinksFrom(entry)),
  ).rejects.toMatchObject({ code: 'outdated_links' })
})
test('retirar y restaurar conserva enlaces y favorito; mezcla entre dispositivos los transporta sin adivinar conflictos', async () => {
  const { repository, service } = setup()
  await service.registerAlbum(album)
  const before = await repository.readSnapshot(),
    entry = before.library.userAlbums[0]!
  await service.removePersonalAlbum(
    entry.id,
    personalEntryToken(before.library, entry.id),
  )
  const removed = await repository.readSnapshot()
  expect(removed.library.userAlbums[0]!.links).toEqual(entry.links)
  await service.restorePersonalAlbum(
    entry.id,
    personalEntryToken(removed.library, entry.id),
  )
  const restored = await repository.readSnapshot()
  expect(restored.library.userAlbums[0]!.preferredPlaybackLinkId).toBe(first.id)
  expect(mergeSnapshots(before, restored, before)).toEqual(restored)
  const other = structuredClone(before)
  other.library.userAlbums[0]!.preferredPlaybackLinkId = second.id
  expect(() => mergeSnapshots(before, removed, other)).toThrow(SyncConflict)
})
test('v1/v2/v3 estrictos se convierten a v4 sin inventar enlaces ni aceptar campos futuros', () => {
  const backup = makeBackup()
  for (const schemaVersion of [1, 2, 3]) {
    expect(
      parseBackupDocument(legacyBackupFixture(backup, schemaVersion)),
    ).toEqual(backup)
    const withLinks = structuredClone(backup)
    withLinks.data.library.userAlbums[0]!.links = []
    expect(() =>
      parseBackupDocument(legacyBackupFixture(withLinks, schemaVersion)),
    ).toThrow()
  }
})
test('migrar DB6 a DB7 conserva todos los datos y el checkpoint sin cambiar la identidad', async () => {
  const factory = new IDBFactory(),
    snapshot = makeBackup().data
  const historical = new Dexie('links-migration', {
    indexedDB: factory,
    IDBKeyRange,
  })
  databases.push(historical)
  historical.version(6).stores(SCHEMA_V6)
  await historical.open()
  await historical.transaction('rw', historical.tables, async () => {
    await historical
      .table('metadata')
      .put({ key: 'local_identity', ...snapshot.identity })
    for (const [name, rows] of Object.entries(
      legacySnapshotFixture(snapshot).catalog,
    ))
      await historical.table(name).bulkPut(rows)
    for (const [name, rows] of Object.entries(snapshot.library))
      await historical
        .table(name)
        .bulkPut(name === 'userAlbums' ? rows.map(toStoredUserAlbum) : rows)
    await historical
      .table('syncCheckpoint')
      .put({ key: 'cloud', revision: 2, base: legacySnapshotFixture(snapshot) })
  })
  historical.close()
  const current = setup(factory, 'links-migration')
  expect(await current.repository.readSnapshot()).toEqual(snapshot)
  expect((await current.repository.readSyncFrame()).checkpoint).toEqual({
    key: 'cloud',
    revision: 2,
    base: snapshot,
  })
  expect(current.database.verno).toBe(9)
})
