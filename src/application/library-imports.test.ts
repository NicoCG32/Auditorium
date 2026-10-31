// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  LibraryImports,
  reviewImport,
  type ImportChoices,
} from './library-imports'
import { makeBackup } from '../domain/backup.fixture'
import { MAX_BACKUP_BYTES, localSnapshotSchema } from '../domain/backup'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import { catalogImportSchema, parseImportText } from '../domain/catalog-import'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { LocalAudio } from './local-audio'
import { audioScope } from '../domain/audio'
import { syntheticAudio } from '../test/audio.fixture'
import { legacySnapshotV6Fixture } from '../test/legacy-backup.fixture'

let factory: IDBFactory, databases: AuditoriumDatabase[]
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
async function connect(
  populated = true,
  user = libraryIds.user,
  name = 'json-import',
) {
  const database = new AuditoriumDatabase(name, {
    indexedDB: factory,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => user,
    now: () => new Date(times.added),
  })
  if (populated)
    await repository.mutate(() => ({
      snapshot: makeBackup().data,
      result: undefined,
    }))
  let id = 2000
  return {
    database,
    repository,
    imports: new LibraryImports(
      repository,
      () => new Date(times.later),
      () => fixtureId(id++),
    ),
  }
}
function file(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return {
    size: new TextEncoder().encode(text).byteLength,
    text: () => Promise.resolve(text),
  }
}
function catalog(
  albumId = fixtureId(1500),
  artistId = ids.artist,
  title = 'nuevo horizonte',
) {
  return {
    format: 'auditorium-catalog',
    schemaVersion: 1,
    artists: [{ id: artistId, name: 'Umbral Eléctrico' }],
    albums: [
      {
        id: albumId,
        title,
        artistIds: [artistId],
        primaryType: 'full_length',
        categories: [],
        publicationStatus: 'published',
        originalYear: 2026,
        genres: ['death metal'],
      },
    ],
  }
}
function allCurrent(
  conflicts: ReturnType<typeof reviewImport>['conflicts'],
): ImportChoices {
  return Object.fromEntries(
    conflicts.filter((c) => c.kind === 'record').map((c) => [c.key, 'current']),
  )
}

test('catálogo nuevo sin experiencia inferida; normaliza nombres y reimporta sin duplicar', async () => {
  const { imports, repository } = await connect(false)
  const before = await repository.readSnapshot(),
    input = catalog()
  input.artists[0]!.name = 'system of a down'
  const prepared = await imports.prepare(file(input)),
    review = reviewImport(prepared)
  expect(await repository.readSnapshot()).toEqual(before)
  expect(review.unresolved).toBe(0)
  await imports.confirm(prepared, {})
  const after = await repository.readSnapshot()
  expect(after.identity).toEqual(before.identity)
  expect(after.catalog.artists[0]?.name).toBe('System Of A Down')
  expect(after.catalog.albums[0]).toMatchObject({
    title: 'Nuevo Horizonte',
    genres: ['Death Metal'],
  })
  expect(after.library.userAlbums[0]?.listeningStatus).toBe('untracked')
  expect(after.library.albumRatings).toEqual([])
  expect(after.library.albumGenreRatings).toEqual([])
  expect(after.library.ownedItems).toEqual([])
  expect(after.library.purchaseWishes).toEqual([])
  const again = await imports.prepare(file(input))
  expect(reviewImport(again).conflicts).toEqual([])
  await imports.confirm(again, {})
  expect(await repository.readSnapshot()).toEqual(after)
})

test('importación aditiva conserva notas, pistas, copias, deseo, retirados y bytes de audio', async () => {
  const { imports, repository, database } = await connect(),
    before = await repository.readSnapshot()
  const audio = new LocalAudio(repository),
    item = await syntheticAudio()
  await audio.save(libraryIds.entry, {
    scope: audioScope(before.identity),
    base: [],
    items: [item],
  })
  const stored = await database.audioFiles.toArray(),
    descriptors = await database.audioAttachments.toArray()
  const prepared = await imports.prepare(file(catalog()))
  await imports.confirm(prepared, {})
  const after = await repository.readSnapshot()
  expect(after.identity).toEqual(before.identity)
  for (const table of [
    'albumRatings',
    'albumGenreRatings',
    'trackRatings',
    'ownedItems',
    'purchaseWishes',
  ] as const)
    expect(after.library[table]).toEqual(before.library[table])
  expect(after.library.userAlbums).toEqual([
    ...before.library.userAlbums,
    expect.objectContaining({ albumId: fixtureId(1500) }),
  ])
  expect(after.catalog.tracks).toEqual(before.catalog.tracks)
  expect(await database.audioFiles.toArray()).toEqual(stored)
  expect(await database.audioAttachments.toArray()).toEqual(descriptors)
  repository.close()
  expect((await repository.readSnapshot()).catalog.albums).toHaveLength(3)
})

test('respaldo externo conserva identidad destino y reasigna propietario sin perder relaciones', async () => {
  const { imports, repository } = await connect(false, libraryIds.otherUser)
  const before = await repository.readSnapshot(),
    backup = makeBackup()
  const prepared = await imports.prepare(file(backup))
  await imports.confirm(prepared, {})
  const after = await repository.readSnapshot()
  expect(after.identity).toEqual(before.identity)
  expect(
    after.library.userAlbums.every(
      (row) => row.userId === before.identity.userId,
    ),
  ).toBe(true)
  expect(after.library.albumRatings).toEqual(backup.data.library.albumRatings)
  expect(after.library.ownedItems).toEqual(backup.data.library.ownedItems)
  expect(after.catalog).toEqual(backup.data.catalog)
})

test('diferencias no usan la fecha como autoridad: exigen elección explícita de nota', async () => {
  const { imports, repository } = await connect(),
    before = await repository.readSnapshot(),
    backup = makeBackup()
  backup.data.library.albumRatings[0] = {
    ...backup.data.library.albumRatings[0]!,
    scoreUnits: 2,
    updatedAt: times.added,
  }
  const prepared = await imports.prepare(file(backup)),
    review = reviewImport(prepared)
  expect(review.conflicts).toHaveLength(1)
  expect(review.unresolved).toBe(1)
  await expect(imports.confirm(prepared, {})).rejects.toThrow('conflictos')
  expect(await repository.readSnapshot()).toEqual(before)
  await imports.confirm(prepared, { [review.conflicts[0]!.key]: 'incoming' })
  expect(
    (await repository.readSnapshot()).library.albumRatings[0]?.scoreUnits,
  ).toBe(2)
})

test('conservar dato actual y omitir filas del respaldo nunca elimina datos existentes', async () => {
  const { imports, repository } = await connect(),
    before = await repository.readSnapshot(),
    backup = makeBackup()
  backup.data.library.albumRatings[0]!.scoreUnits = 2
  backup.data.library.trackRatings = []
  backup.data.library.ownedItems = []
  backup.data.library.purchaseWishes = []
  const prepared = await imports.prepare(file(backup)),
    review = reviewImport(prepared)
  await imports.confirm(prepared, allCurrent(review.conflicts))
  expect(await repository.readSnapshot()).toEqual(before)
})

test('reutilizar artista homónimo es explícito y remapea créditos sin duplicarlo', async () => {
  const { imports, repository } = await connect()
  const prepared = await imports.prepare(
    file(catalog(fixtureId(1500), fixtureId(1600))),
  )
  const initial = reviewImport(prepared)
  expect(initial.conflicts[0]?.kind).toBe('artist')
  expect(initial.snapshot).toBeUndefined()
  const choices = { [initial.conflicts[0]!.key]: ids.artist }
  expect(reviewImport(prepared, choices).unresolved).toBe(0)
  await imports.confirm(prepared, choices)
  const after = await repository.readSnapshot()
  expect(after.catalog.artists).toHaveLength(1)
  expect(
    after.catalog.albumArtists.find((row) => row.albumId === fixtureId(1500))
      ?.artistId,
  ).toBe(ids.artist)
})

test.each(['skip', 'distinct'])(
  'posible álbum duplicado requiere decisión %s, no deduplicación silenciosa',
  async (choice) => {
    const { imports, repository } = await connect(),
      before = await repository.readSnapshot()
    const prepared = await imports.prepare(
      file(catalog(fixtureId(1500), ids.artist, 'Eclipse')),
    )
    const review = reviewImport(prepared),
      duplicate = review.conflicts.find((row) => row.kind === 'duplicate')!
    expect(duplicate).toBeDefined()
    await expect(imports.confirm(prepared, {})).rejects.toThrow()
    await imports.confirm(prepared, { [duplicate.key]: choice })
    const after = await repository.readSnapshot()
    if (choice === 'skip') expect(after).toEqual(before)
    else expect(after.catalog.albums).toHaveLength(3)
  },
)

test('mismo álbum con entrada ajena usa la entrada existente y remapea notas y copias', async () => {
  const { imports, repository } = await connect(),
    before = await repository.readSnapshot(),
    backup = makeBackup()
  const old = backup.data.library.userAlbums[0]!.id,
    next = fixtureId(1800)
  backup.data.library.userAlbums[0]!.id = next
  for (const table of [
    'albumRatings',
    'albumGenreRatings',
    'trackRatings',
    'ownedItems',
    'purchaseWishes',
  ] as const)
    for (const row of backup.data.library[table])
      if (row.userAlbumId === old) row.userAlbumId = next
  backup.data.identity.userId = libraryIds.otherUser
  backup.data.library.userAlbums.forEach(
    (row) => (row.userId = libraryIds.otherUser),
  )
  const prepared = await imports.prepare(file(backup))
  expect(reviewImport(prepared).conflicts).toEqual([])
  await imports.confirm(prepared, {})
  expect(await repository.readSnapshot()).toEqual(before)
})

test('omitir álbum duplicado excluye también el artista que sólo lo acompaña', async () => {
  const { imports, repository } = await connect(),
    before = await repository.readSnapshot()
  const prepared = await imports.prepare(
    file(catalog(fixtureId(1500), fixtureId(1600), 'Eclipse')),
  )
  const duplicate = reviewImport(prepared).conflicts.find(
    (row) => row.kind === 'duplicate',
  )!
  const choices = { [duplicate.key]: 'skip' }
  expect(reviewImport(prepared, choices).unresolved).toBe(0)
  await imports.confirm(prepared, choices)
  expect(await repository.readSnapshot()).toEqual(before)
})

test('dos artistas distintos no convergen silenciosamente en una sola fila', async () => {
  const { imports, repository } = await connect(),
    before = await repository.readSnapshot(),
    input = catalog(fixtureId(1500), fixtureId(1600))
  input.artists.push({ id: fixtureId(1601), name: 'Umbral Eléctrico' })
  input.albums.push({
    ...input.albums[0]!,
    id: fixtureId(1501),
    title: 'Segundo Horizonte',
    artistIds: [fixtureId(1601)],
  })
  const prepared = await imports.prepare(file(input)),
    review = reviewImport(prepared)
  const choices = Object.fromEntries(
    review.conflicts
      .filter((row) => row.kind === 'artist')
      .map((row) => [row.key, ids.artist]),
  )
  expect(reviewImport(prepared, choices).problem).toBeDefined()
  await expect(imports.confirm(prepared, choices)).rejects.toThrow()
  expect(await repository.readSnapshot()).toEqual(before)
})

test('catálogo conocido conserva experiencia, portada local y metadatos no incluidos', async () => {
  const { imports, repository } = await connect()
  const before = await repository.readSnapshot(),
    input = catalog(ids.album)
  input.albums[0]!.title = 'Eclipse'
  input.albums[0]!.originalYear = 1998
  const prepared = await imports.prepare(file(input)),
    review = reviewImport(prepared)
  const choices = allCurrent(review.conflicts)
  await imports.confirm(prepared, choices)
  expect(await repository.readSnapshot()).toEqual(before)
})

test('un catálogo que contiene un álbum retirado no lo reactiva ni crea otra entrada', async () => {
  const { imports, repository } = await connect(),
    before = await repository.readSnapshot()
  const input = catalog(ids.otherAlbum)
  input.albums[0]!.title = 'Otra Órbita'
  const prepared = await imports.prepare(file(input)),
    review = reviewImport(prepared)
  await imports.confirm(prepared, allCurrent(review.conflicts))
  expect((await repository.readSnapshot()).library).toEqual(before.library)
})

test('otro escritor invalida vista previa sin perder su cambio ni aplicar filas nuevas', async () => {
  const { imports, repository } = await connect(),
    prepared = await imports.prepare(file(catalog()))
  await repository.mutate((snapshot) => {
    snapshot.library.userAlbums[0]!.personalNotes = 'Cambio en otra pestaña'
    return { snapshot, result: undefined }
  })
  const changed = await repository.readSnapshot()
  await expect(imports.confirm(prepared, {})).rejects.toThrow(
    'cambió desde la vista previa',
  )
  expect(await repository.readSnapshot()).toEqual(changed)
})

test.each(['QuotaExceededError', 'AbortError'])(
  'fallo tardío %s revierte altas y cambios; permite reintentar',
  async (name) => {
    const { imports, repository, database } = await connect(),
      before = await repository.readSnapshot(),
      prepared = await imports.prepare(file(catalog()))
    const failure = vi
      .spyOn(database.userAlbums, 'bulkPut')
      .mockRejectedValueOnce(new DOMException('Fallo ficticio', name))
    await expect(imports.confirm(prepared, {})).rejects.toMatchObject({
      code: name === 'AbortError' ? 'aborted' : 'quota_exceeded',
    })
    expect(await repository.readSnapshot()).toEqual(before)
    failure.mockRestore()
    await imports.confirm(prepared, {})
    expect((await repository.readSnapshot()).catalog.albums).toHaveLength(3)
  },
)

test('elecciones incompatibles con referencias de género bloquean escritura', async () => {
  const { imports, repository } = await connect(),
    before = await repository.readSnapshot(),
    backup = makeBackup()
  backup.data.catalog.albums[0]!.genres = ['Death Metal']
  backup.data.library.albumGenreRatings = [
    {
      userAlbumId: libraryIds.entry,
      genreKey: 'death metal',
      scoreUnits: 18,
      updatedAt: times.updated,
    },
  ]
  const prepared = await imports.prepare(file(backup)),
    review = reviewImport(prepared),
    choices = allCurrent(review.conflicts)
  expect(reviewImport(prepared, choices).problem).toContain('biblioteca válida')
  await expect(imports.confirm(prepared, choices)).rejects.toThrow(
    'biblioteca válida',
  )
  expect(await repository.readSnapshot()).toEqual(before)
  const album = review.conflicts.find((row) =>
    row.key.startsWith('catalog.albums:'),
  )!
  await imports.confirm(prepared, { ...choices, [album.key]: 'incoming' })
  expect(
    (await repository.readSnapshot()).library.albumGenreRatings[0]?.scoreUnits,
  ).toBe(18)
})

test('plantilla exporta sólo catálogo permitido, sin identidad, experiencia, adquisiciones o audio', async () => {
  const { imports, repository } = await connect(),
    before = await repository.readSnapshot(),
    text = await imports.exportCatalog()
  const result = catalogImportSchema.parse(JSON.parse(text))
  expect(result.albums.map((row) => row.id)).toEqual(
    before.catalog.albums.map((row) => row.id),
  )
  for (const forbidden of [
    'userId',
    'personalNotes',
    'scoreUnits',
    'ownedItems',
    'purchaseWishes',
    'audio',
    'createdBy',
  ])
    expect(text).not.toContain(forbidden)
  expect(await repository.readSnapshot()).toEqual(before)
})

test('formato histórico6 migra sin notas de género inventadas', async () => {
  const { imports } = await connect(false)
  const input = {
    format: 'auditorium-backup',
    schemaVersion: 6,
    exportedAt: times.later,
    data: legacySnapshotV6Fixture(makeBackup().data),
  }
  const prepared = await imports.prepare(file(input))
  expect(prepared.incoming.library.albumGenreRatings).toEqual([])
  expect(localSnapshotSchema.safeParse(prepared.incoming).success).toBe(true)
})

test('plantilla conserva créditos principales y secundarios existentes al reimportar', async () => {
  const { imports, repository } = await connect()
  await repository.mutate((snapshot) => {
    snapshot.catalog.artists.push({
      id: ids.collaborator,
      name: 'Invitado',
      catalogScope: 'personal',
    })
    snapshot.catalog.albumArtists[0]!.creditedAs = 'Nombre Acreditado'
    snapshot.catalog.albumArtists.push({
      albumId: ids.album,
      artistId: ids.collaborator,
      role: 'collaborator',
      position: 2,
    })
    snapshot.catalog.albums[0]!.coverImage =
      'data:image/png;base64,iVBORw0KGgo='
    snapshot.catalog.albums[0]!.description = 'Descripción previa'
    return { snapshot, result: undefined }
  })
  const before = await repository.readSnapshot(),
    text = await imports.exportCatalog()
  const template = catalogImportSchema.parse(JSON.parse(text))
  expect(template.albums[0]!.artistIds).toEqual([ids.artist])
  const prepared = await imports.prepare(file(text)),
    review = reviewImport(prepared)
  expect(review.additions).toBe(0)
  await imports.confirm(prepared, allCurrent(review.conflicts))
  expect(await repository.readSnapshot()).toEqual(before)
  const duplicate = await imports.prepare(
    file(catalog(fixtureId(1700), ids.artist, 'Eclipse')),
  )
  expect(
    reviewImport(duplicate).conflicts.some((row) => row.kind === 'duplicate'),
  ).toBe(true)
})

test('tamaño se comprueba antes de leer y texto/BOM también cuentan', async () => {
  const { imports } = await connect(false),
    text = vi.fn(() => Promise.resolve('{}'))
  await expect(
    imports.prepare({ size: MAX_BACKUP_BYTES + 1, text }),
  ).rejects.toMatchObject({ code: 'file_too_large' })
  expect(text).not.toHaveBeenCalled()
  expect(() =>
    parseImportText(' '.repeat(MAX_BACKUP_BYTES) + '\uFEFF'),
  ).toThrow()
})

test.each([
  () => '{',
  () => ({ ...catalog(), schemaVersion: 2 }),
  () => ({ ...catalog(), identity: { userId: libraryIds.user } }),
  () => ({
    ...catalog(),
    albums: [{ ...catalog().albums[0], scoreUnits: 20 }],
  }),
  () => ({ ...catalog(), artists: [] }),
  () => ({
    ...catalog(),
    albums: [{ ...catalog().albums[0], id: 'not-a-uuid' }],
  }),
  () => ({
    ...catalog(),
    albums: [{ ...catalog().albums[0], coverUrl: 'javascript:alert(1)' }],
  }),
  () => ({ ...catalog(), albums: [...catalog().albums, ...catalog().albums] }),
])('archivo inválido se rechaza antes de escribir %#', async (build) => {
  const { imports, repository } = await connect(),
    before = await repository.readSnapshot()
  await expect(imports.prepare(file(build()))).rejects.toThrow()
  expect(await repository.readSnapshot()).toEqual(before)
})
