// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  DiscographyImports,
  emptyDiscographyChoices,
} from './discography-imports'
import type { DiscographyAlbum, DiscographyArtist } from './discography-catalog'
import { makeBackup } from '../domain/backup.fixture'
import {
  BACKUP_SCHEMA_VERSION,
  legacySnapshotV7Schema,
  parseBackupText,
  serializeBackup,
  parseBackupDocument,
} from '../domain/backup'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { MusicLibrary } from './music-library'
import { buildAlbumEditExpected } from './album-edit'

const artist: DiscographyArtist = {
  id: fixtureId(9000),
  name: 'Umbral Eléctrico',
  country: 'CL',
}
const album: DiscographyAlbum = {
  id: fixtureId(9001),
  title: 'Eclipse',
  primaryType: 'Album',
  secondaryTypes: [],
  firstReleaseDate: '1998',
  artists: [artist],
}
let database: AuditoriumDatabase
beforeEach(() => {
  database = new AuditoriumDatabase('discography-test', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  database.close()
  await database.delete()
})
async function setup() {
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  await repository.mutate(() => ({
    snapshot: makeBackup().data,
    result: undefined,
  }))
  let id = 10000
  return {
    repository,
    imports: new DiscographyImports(
      repository,
      () => new Date(times.later),
      () => fixtureId(id++),
    ),
  }
}
const newAlbum = (id: number, title: string): DiscographyAlbum => ({
  ...album,
  id: fixtureId(id),
  title,
})
const reuseArtist = { artists: { [artist.id]: ids.artist }, albums: {} }

test('la vista previa no escribe y una sola confirmación incorpora varias obras sin alterar experiencia ni catálogo previo', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  const prepared = await imports.prepare(
    artist,
    [newAlbum(9002, 'Nuevo Sol'), newAlbum(9003, 'Nueva Luna')],
    reuseArtist,
  )
  expect(await repository.readSnapshot()).toEqual(before)
  await imports.confirm(prepared)
  const after = await repository.readSnapshot()
  expect(after.identity).toEqual(before.identity)
  expect(after.catalog.albums.slice(0, before.catalog.albums.length)).toEqual(
    before.catalog.albums,
  )
  expect(
    after.library.userAlbums.slice(0, before.library.userAlbums.length),
  ).toEqual(before.library.userAlbums)
  expect(
    after.library.userAlbums.slice(-2).map((row) => row.listeningStatus),
  ).toEqual(['untracked', 'untracked'])
  for (const table of [
    'albumRatings',
    'albumGenreRatings',
    'trackRatings',
    'ownedItems',
    'purchaseWishes',
  ] as const)
    expect(after.library[table]).toEqual(before.library[table])
  expect(after.catalog.tracks).toEqual(before.catalog.tracks)
  expect(after.catalog.albums.at(-1)?.id).not.toBe(fixtureId(9003))
})
test('repetir la importación reconoce los vínculos sin cambiar IDs, fechas o notas', async () => {
  const { repository, imports } = await setup()
  const source = newAlbum(9002, 'Nuevo Sol')
  await imports.confirm(await imports.prepare(artist, [source], reuseArtist))
  const before = await repository.readSnapshot()
  const second = await imports.prepare(
    artist,
    [source],
    emptyDiscographyChoices,
  )
  expect(second.added).toBe(0)
  expect(second.linked).toBe(0)
  await imports.confirm(second)
  expect(await repository.readSnapshot()).toEqual(before)
})
test('homónimos requieren decisiones explícitas y vincular conserva el UUID y todos los datos personales', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  await expect(
    imports.prepare(artist, [album], emptyDiscographyChoices),
  ).rejects.toThrow('coincidencias')
  await expect(imports.prepare(artist, [album], reuseArtist)).rejects.toThrow(
    'coincidencias',
  )
  await imports.confirm(
    await imports.prepare(artist, [album], {
      ...reuseArtist,
      albums: { [album.id]: ids.album },
    }),
  )
  const after = await repository.readSnapshot()
  expect(after.catalog.albums).toHaveLength(before.catalog.albums.length)
  expect(after.catalog.albums[0]).toEqual({
    ...before.catalog.albums[0],
    musicBrainz: { id: album.id, retrievedAt: times.later },
  })
  expect(after.library).toEqual(before.library)
})
test('vincular una obra retirada no crea una nueva entrada ni reactiva la anterior', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  const retired = { ...album, title: before.catalog.albums[1]!.title }
  await imports.confirm(
    await imports.prepare(artist, [retired], {
      ...reuseArtist,
      albums: { [retired.id]: ids.otherAlbum },
    }),
  )
  expect((await repository.readSnapshot()).library).toEqual(before.library)
})
test('un homónimo distinto no puede vincularse a una obra de otro artista', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  await expect(
    imports.prepare(artist, [album], {
      artists: { [artist.id]: 'new' },
      albums: { [album.id]: ids.album },
    }),
  ).rejects.toThrow('créditos')
  expect(await repository.readSnapshot()).toEqual(before)
})
test('omitir todas las coincidencias no añade artistas huérfanos ni cambia la biblioteca', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  await imports.confirm(
    await imports.prepare(artist, [album], {
      artists: {},
      albums: { [album.id]: 'skip' },
    }),
  )
  expect(await repository.readSnapshot()).toEqual(before)
})
test('rechaza un plan obsoleto y preserva el cambio concurrente', async () => {
  const { repository, imports } = await setup()
  const prepared = await imports.prepare(
    artist,
    [newAlbum(9002, 'Nuevo Sol')],
    reuseArtist,
  )
  await repository.mutate((snapshot) => {
    snapshot.library.userAlbums[0]!.personalNotes = 'Cambio concurrente'
    return { snapshot, result: undefined }
  })
  const concurrent = await repository.readSnapshot()
  await expect(imports.confirm(prepared)).rejects.toThrow('biblioteca cambió')
  expect(await repository.readSnapshot()).toEqual(concurrent)
})
test('un fallo de escritura revierte artistas, referencias y todos los álbumes del lote', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  const prepared = await imports.prepare(
    artist,
    [newAlbum(9002, 'Nuevo Sol'), newAlbum(9003, 'Nueva Luna')],
    reuseArtist,
  )
  const failure = vi
    .spyOn(database.userAlbums, 'bulkPut')
    .mockRejectedValue(
      new DOMException('Quota de prueba', 'QuotaExceededError'),
    )
  await expect(imports.confirm(prepared)).rejects.toMatchObject({
    code: 'quota_exceeded',
  })
  failure.mockRestore()
  expect(await repository.readSnapshot()).toEqual(before)
})
test('JSON8 conserva las referencias y JSON7 queda congelado sin aceptar esos campos', async () => {
  const { repository, imports } = await setup()
  const old = { ...makeBackup(), schemaVersion: 7 }
  expect(parseBackupDocument(old).schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
  await imports.confirm(
    await imports.prepare(artist, [album], {
      ...reuseArtist,
      albums: { [album.id]: ids.album },
    }),
  )
  const current = { ...makeBackup(), data: await repository.readSnapshot() }
  expect(parseBackupText(serializeBackup(current))).toEqual(current)
  expect(legacySnapshotV7Schema.safeParse(current.data).success).toBe(false)
  expect(() => parseBackupDocument({ ...current, schemaVersion: 7 })).toThrow()
})
test('los mismos identificadores de origen no pueden asignarse a dos obras locales', async () => {
  const { repository } = await setup()
  await expect(
    repository.mutate((snapshot) => {
      snapshot.catalog.albums.forEach((row) => {
        row.musicBrainz = { id: album.id, retrievedAt: times.later }
      })
      return { snapshot, result: undefined }
    }),
  ).rejects.toThrow()
})

test('editar un año conserva la referencia; cambiar la identidad de la obra la desvincula', async () => {
  const { repository, imports } = await setup()
  await imports.confirm(
    await imports.prepare(artist, [album], {
      ...reuseArtist,
      albums: { [album.id]: ids.album },
    }),
  )
  const library = new MusicLibrary(repository)
  const input = async (title: string) => {
    const expected = buildAlbumEditExpected(
      await repository.readSnapshot(),
      ids.album,
    )
    return {
      albumId: ids.album,
      expected,
      title,
      originalYear: 2000,
      artists: expected.credits.map((row) => ({
        artistId: row.artistId,
        name: expected.artists.find((artist) => artist.id === row.artistId)!
          .name,
        role: row.role,
      })),
    }
  }
  await library.updateAlbum(await input('Eclipse'))
  expect(
    (await repository.readSnapshot()).catalog.albums.find(
      (row) => row.id === ids.album,
    )?.musicBrainz?.id,
  ).toBe(album.id)
  await library.updateAlbum(await input('Una obra distinta'))
  expect(
    (await repository.readSnapshot()).catalog.albums.find(
      (row) => row.id === ids.album,
    )?.musicBrainz,
  ).toBeUndefined()
})

test('dos artistas de origen no pueden sobrescribir sus referencias al elegir el mismo homónimo local', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  const collaborator = { ...artist, id: fixtureId(9090) }
  await expect(
    imports.prepare(
      artist,
      [{ ...newAlbum(9002, 'Colaboración'), artists: [artist, collaborator] }],
      {
        artists: { [artist.id]: ids.artist, [collaborator.id]: ids.artist },
        albums: {},
      },
    ),
  ).rejects.toThrow('identidades externas')
  expect(await repository.readSnapshot()).toEqual(before)
})
test('rechaza obras no acreditadas al artista y selecciones repetidas antes de escribir', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  await expect(
    imports.prepare({ ...artist, id: fixtureId(9900) }, [album], reuseArtist),
  ).rejects.toThrow('acreditadas')
  await expect(
    imports.prepare(artist, [album, album], reuseArtist),
  ).rejects.toThrow('sin repetirlas')
  expect(await repository.readSnapshot()).toEqual(before)
  expect(before.identity.userId).toBe(libraryIds.user)
})
