// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AuditoriumDatabase, SCHEMA_V13 } from '../infrastructure/db/database'
import Dexie from 'dexie'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import {
  coverTarget,
  verifyCoverFile,
  checkCoverBudget,
  MAX_LOCAL_COVER_BYTES,
} from '../domain/covers'
import { syntheticCover } from '../test/cover.fixture'
import { AlbumCovers } from './album-covers'
import type {
  DiscographyAlbum,
  DiscographyCatalog,
} from './discography-catalog'
import { CompleteAudioBackups } from './complete-audio-backups'
import { z } from 'zod'
import {
  readStoredZip,
  createStoredZip,
} from '../infrastructure/browser/stored-zip'

let factory: IDBFactory
const databases: Dexie[] = []
beforeEach(() => {
  factory = new IDBFactory()
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases) db.close()
  for (const db of new Map(databases.map((db) => [db.name, db])).values())
    await db.delete()
  databases.length = 0
})
async function setup(name = 'covers', seed = true) {
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
  if (seed)
    await repository.mutate(() => ({
      snapshot: makeBackup().data,
      result: undefined,
    }))
  const cover = await syntheticCover()
  const download = vi.fn(() => {
    const { bytes, attachment } = cover
    const { size, width, height, sha256 } = attachment
    return Promise.resolve({ bytes, size, width, height, sha256 })
  })
  const candidate: DiscographyAlbum = {
    id: fixtureId(99000),
    title: 'Eclipse',
    primaryType: 'Album',
    secondaryTypes: [],
    firstReleaseDate: '1998',
    artists: [
      { id: fixtureId(99001), name: 'Umbral Electrico', country: 'CL' },
    ],
  }
  const catalog = {
    available: true,
    searchArtists: vi.fn(() => Promise.resolve(candidate.artists)),
    browseAlbums: vi.fn(() =>
      Promise.resolve({ total: 1, albums: [candidate] }),
    ),
  } satisfies DiscographyCatalog
  const service = new AlbumCovers(repository, catalog, { download })
  return { repository, database, cover, download, catalog, candidate, service }
}
const signal = () => new AbortController().signal
const progress = vi.fn()

test('la coincidencia única exacta ignora acentos y guarda bytes sin vincular ni cambiar datos personales', async () => {
  const origin = await setup()
  const before = await origin.repository.readSnapshot()
  const result = await origin.service.complete([ids.album], signal(), progress)
  expect(result).toMatchObject({ saved: 1, missing: 0, failed: 0, choices: [] })
  const after = await origin.repository.readSnapshot()
  expect(after.library).toEqual(before.library)
  expect(after.catalog.artists).toEqual(before.catalog.artists)
  expect(after.catalog.albums[0]).toEqual({
    ...before.catalog.albums[0],
    coverUrl: origin.cover.attachment.sourceUrl,
  })
  expect(
    (
      await origin.repository.readCoverFile(
        origin.cover.attachment.sourceUrl,
        after.identity,
      )
    )?.bytes,
  ).toEqual(origin.cover.bytes)
  await origin.service.complete([ids.album], signal(), progress)
  expect(origin.download).toHaveBeenCalledTimes(1)
})
test('los MBID precisos no buscan nombres y un archivo propio o URL ajena nunca se sustituyen', async () => {
  const origin = await setup()
  await origin.repository.mutate((snapshot) => {
    snapshot.catalog.albums[0]!.musicBrainz = {
      id: origin.candidate.id,
      retrievedAt: times.added,
    }
    return { snapshot, result: undefined }
  })
  await origin.service.complete([ids.album], signal(), progress)
  expect(origin.catalog.searchArtists).not.toHaveBeenCalled()
  for (const fields of [
    { coverUrl: 'https://example.com/custom.jpg' },
    { coverImage: 'data:image/png;base64,iVBORw0KGgo=' },
  ]) {
    await origin.repository.mutate((snapshot) => {
      const album = snapshot.catalog.albums[0]!
      delete album.coverUrl
      Object.assign(album, fields)
      return { snapshot, result: undefined }
    })
    await origin.service.complete([ids.album], signal(), progress)
  }
  expect(origin.download).toHaveBeenCalledTimes(1)
  expect(await origin.repository.readCoverAttachments()).toEqual([])
})
test('homónimos y obras ambiguas requieren revisar y elegir sin alterar el vínculo del catálogo', async () => {
  const origin = await setup()
  vi.mocked(origin.catalog.searchArtists).mockResolvedValue([
    origin.candidate.artists[0]!,
    {
      id: fixtureId(99002),
      name: 'Umbral Eléctrico',
      description: 'Otro grupo',
    },
  ])
  const result = await origin.service.complete([ids.album], signal(), progress)
  expect(result.choices).toHaveLength(1)
  expect(origin.download).not.toHaveBeenCalled()
  expect(
    await origin.service.choose(
      result.choices[0]!,
      origin.candidate.id,
      signal(),
    ),
  ).toBe('saved')
  expect(
    (await origin.repository.readSnapshot()).catalog.albums[0],
  ).not.toHaveProperty('musicBrainz')
})
test('un año diferente no se asigna y las discografías y búsquedas se reutilizan por artista', async () => {
  const origin = await setup()
  origin.candidate.firstReleaseDate = '2002'
  const result = await origin.service.complete(
    [ids.album, ids.album],
    signal(),
    progress,
  )
  expect(result).toMatchObject({ total: 1, missing: 1, saved: 0 })
  expect(origin.download).not.toHaveBeenCalled()
  expect(origin.catalog.browseAlbums).toHaveBeenCalledTimes(1)
})
test('cambiar la portada o el álbum durante la descarga impide sobreescribir la edición reciente', async () => {
  const origin = await setup()
  const original = origin.download.getMockImplementation()!
  origin.download.mockImplementation(async () => {
    await origin.repository.mutate((snapshot) => {
      snapshot.catalog.albums[0]!.coverUrl = 'https://example.com/chosen.jpg'
      return { snapshot, result: undefined }
    })
    return original()
  })
  expect(
    await origin.service.complete([ids.album], signal(), progress),
  ).toMatchObject({ skipped: 1, saved: 0 })
  expect(await origin.repository.readCoverAttachments()).toEqual([])
})
test('404 y fallos de red se distinguen, no bloquean datos y permiten reintentar', async () => {
  const origin = await setup()
  origin.download.mockRejectedValueOnce(new Error('Network'))
  expect(
    await origin.service.complete([ids.album], signal(), progress),
  ).toMatchObject({ failed: 1, saved: 0 })
  expect(
    await origin.service.complete([ids.album], signal(), progress),
  ).toMatchObject({ saved: 1 })
})

test('distingue una portada ausente de una búsqueda no disponible', async () => {
  const origin = await setup()
  const missing = new AlbumCovers(origin.repository, origin.catalog, {
    download: () => Promise.resolve(undefined),
  })
  expect(await missing.complete([ids.album], signal(), progress)).toMatchObject(
    { missing: 1, failed: 0 },
  )
  const unavailable = new AlbumCovers(
    origin.repository,
    { ...origin.catalog, available: false },
    { download: origin.download },
  )
  expect(
    await unavailable.complete([ids.album], signal(), progress),
  ).toMatchObject({ missing: 0, failed: 1 })
  expect(await origin.repository.readCoverAttachments()).toEqual([])
})

test.each(['quota', 'abort'] as const)(
  'restaurar ZIP2 con %s revierte portada, álbum e identidad',
  async (kind) => {
    const origin = await setup()
    await origin.service.complete([ids.album], signal(), progress)
    const backup = await new CompleteAudioBackups(origin.repository).export()
    const destination = await setup('rollback', false)
    const before = await destination.repository.readSnapshot()
    const service = new CompleteAudioBackups(destination.repository)
    const prepared = await service.readFile({
      size: backup.bytes.length,
      arrayBuffer: () => Promise.resolve(new Uint8Array(backup.bytes).buffer),
    })
    const controller = new AbortController()
    if (kind === 'quota')
      vi.spyOn(destination.database.coverFiles, 'bulkAdd').mockRejectedValue(
        new DOMException('Quota', 'QuotaExceededError'),
      )
    else
      destination.database.coverFiles.hook('creating', () => {
        controller.abort()
      })
    await expect(
      service.restore(prepared, before.identity, controller.signal),
    ).rejects.toThrow()
    expect(await destination.repository.readSnapshot()).toEqual(before)
    expect(await destination.database.coverAttachments.count()).toBe(0)
    expect(await destination.database.coverFiles.count()).toBe(0)
  },
)
test('cancelar antes de guardar no escribe y el presupuesto limita el conjunto', async () => {
  const origin = await setup()
  const controller = new AbortController()
  controller.abort()
  await expect(
    origin.service.complete([ids.album], controller.signal, progress),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(origin.download).not.toHaveBeenCalled()
  expect(() => checkCoverBudget([{ size: MAX_LOCAL_COVER_BYTES + 1 }])).toThrow(
    'espacio',
  )
})
test('cuota y cancelación revierten imagen y URL en una sola transacción', async () => {
  const origin = await setup()
  const before = await origin.repository.readSnapshot()
  vi.spyOn(origin.database.coverFiles, 'put').mockRejectedValue(
    new DOMException('Quota', 'QuotaExceededError'),
  )
  await expect(
    origin.repository.saveCover(
      origin.cover,
      coverTarget(before, ids.album),
      signal(),
    ),
  ).rejects.toMatchObject({ code: 'quota_exceeded' })
  expect(await origin.repository.readSnapshot()).toEqual(before)
  expect(await origin.repository.readCoverAttachments()).toEqual([])
})
test('ZIP2 conserva bytes fuera de library.json, restaura atómicamente y sobrevive a reapertura', async () => {
  const origin = await setup()
  await origin.service.complete([ids.album], signal(), progress)
  const backup = await new CompleteAudioBackups(origin.repository).export()
  const entries = await readStoredZip(backup.bytes)
  expect(
    JSON.parse(new TextDecoder().decode(entries.get('audio-manifest.json'))),
  ).toMatchObject({ version: 2 })
  expect(entries.get(`covers/${ids.album}.jpg`)).toEqual(origin.cover.bytes)
  expect(new TextDecoder().decode(entries.get('library.json'))).not.toContain(
    'base64',
  )
  const destination = await setup('destination', false)
  const service = new CompleteAudioBackups(destination.repository)
  const prepared = await service.readFile({
    size: backup.bytes.length,
    arrayBuffer: () => Promise.resolve(new Uint8Array(backup.bytes).buffer),
  })
  await service.restore(prepared, await destination.repository.open())
  destination.repository.close()
  expect(await destination.repository.readSnapshot()).toEqual(
    await origin.repository.readSnapshot(),
  )
  expect((await destination.repository.readCompleteAudio()).covers).toEqual(
    (await origin.repository.readCompleteAudio()).covers,
  )
})
test.each(['bytes', 'scope', 'association', 'undeclared'] as const)(
  'rechaza ZIP2 alterado en %s sin escribir el destino',
  async (kind) => {
    const origin = await setup()
    await origin.service.complete([ids.album], signal(), progress)
    const entries = await readStoredZip(
      (await new CompleteAudioBackups(origin.repository).export()).bytes,
    )
    const manifest = z
      .object({
        identity: z.object({ userId: z.string() }).passthrough(),
        covers: z.array(z.object({ albumId: z.string() }).passthrough()),
      })
      .passthrough()
      .parse(
        JSON.parse(
          new TextDecoder().decode(entries.get('audio-manifest.json')),
        ),
      )
    if (kind === 'bytes') entries.get(`covers/${ids.album}.jpg`)![8] = 9
    if (kind === 'scope') manifest.identity.userId = fixtureId(99800)
    if (kind === 'association') manifest.covers[0]!.albumId = fixtureId(99801)
    if (kind === 'undeclared')
      entries.set(`covers/${fixtureId(99802)}.jpg`, origin.cover.bytes)
    entries.set(
      'audio-manifest.json',
      new TextEncoder().encode(JSON.stringify(manifest)),
    )
    const bytes = await createStoredZip(
      [...entries].map(([name, data]) => ({ name, data })),
    )
    const destination = await setup('destination', false)
    const before = await destination.repository.readSnapshot()
    await expect(
      new CompleteAudioBackups(destination.repository).readFile({
        size: bytes.length,
        arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
      }),
    ).rejects.toThrow()
    expect(await destination.repository.readSnapshot()).toEqual(before)
  },
)
test('valida hash y dimensiones, y no expone portadas de otra identidad', async () => {
  const origin = await setup()
  await origin.service.complete([ids.album], signal(), progress)
  await expect(
    verifyCoverFile({
      ...origin.cover,
      attachment: { ...origin.cover.attachment, width: 3 },
    }),
  ).rejects.toThrow('no coincide')
  expect(
    await origin.repository.readCoverFile(origin.cover.attachment.sourceUrl, {
      ...makeBackup().data.identity,
      userId: fixtureId(99803),
    }),
  ).toBeUndefined()
})
test('DB13 se amplía sin modificar datos ni checkpoint y crea almacenes de portadas vacíos', async () => {
  const previous = new Dexie('upgrade', { indexedDB: factory, IDBKeyRange })
  databases.push(previous)
  previous.version(13).stores(SCHEMA_V13)
  await previous.open()
  await previous.table('metadata').put({
    key: 'local_identity',
    userId: libraryIds.user,
    createdAt: times.added,
  })
  const before = await previous.table('metadata').toArray()
  previous.close()
  const current = await setup('upgrade', false)
  await current.repository.open()
  expect(current.database.backendDB().version).toBe(140)
  expect(await current.database.metadata.toArray()).toEqual(before)
  expect(await current.repository.readCoverAttachments()).toEqual([])
  expect(await current.database.syncCheckpoint.toArray()).toEqual([])
})

test('un archivo ausente se vuelve a descargar sin duplicar sus metadatos', async () => {
  const origin = await setup()
  await origin.service.complete([ids.album], signal(), progress)
  await origin.database.coverFiles.clear()
  expect(
    await origin.service.complete([ids.album], signal(), progress),
  ).toMatchObject({ saved: 1 })
  expect(await origin.database.coverAttachments.count()).toBe(1)
  expect(await origin.database.coverFiles.count()).toBe(1)
})

test('DB14 revierte su migración si DB13 contiene campos futuros', async () => {
  const previous = new Dexie('invalid-upgrade', {
    indexedDB: factory,
    IDBKeyRange,
  })
  databases.push(previous)
  previous.version(13).stores(SCHEMA_V13)
  await previous.open()
  await previous.table('metadata').put({
    key: 'local_identity',
    userId: libraryIds.user,
    createdAt: times.added,
  })
  await previous
    .table('artists')
    .put({ id: ids.artist, name: 'Artista ficticio', unknownField: true })
  previous.close()
  const current = await setup('invalid-upgrade', false)
  await expect(current.repository.open()).rejects.toThrow()
  current.repository.close()
  await previous.open()
  expect(previous.backendDB().version).toBe(130)
  expect(previous.tables.some((table) => table.name === 'coverFiles')).toBe(
    false,
  )
  expect(await previous.table('artists').get(ids.artist)).toHaveProperty(
    'unknownField',
    true,
  )
})

test('un respaldo de portadas mayor de 20 MiB conserva JSON9 pequeño y permite seguir editando al restaurar', async () => {
  const origin = await setup()
  const snapshot = await origin.repository.readSnapshot()
  const padded = new Uint8Array(128 * 1024)
  padded.set(origin.cover.bytes)
  const { audioDigest } = await import('../domain/audio')
  const sha256 = await audioDigest(padded)
  const covers = Array.from({ length: 180 }, (_, index) => {
    const albumId = fixtureId(100000 + index)
    snapshot.catalog.albums.push({
      id: albumId,
      title: `Disco ficticio ${index}`,
      primaryType: 'full_length',
      categories: [],
      publicationStatus: 'unknown',
      catalogScope: 'personal',
      coverUrl: origin.cover.attachment.sourceUrl,
    })
    snapshot.catalog.albumArtists.push({
      albumId,
      artistId: ids.artist,
      role: 'primary',
      position: 1,
    })
    return {
      bytes: padded,
      attachment: {
        ...origin.cover.attachment,
        albumId,
        size: padded.length,
        sha256,
      },
    }
  })
  const destination = await setup('large-library', false)
  await destination.repository.restoreCompleteAudio(
    { snapshot, files: [], covers },
    await destination.repository.open(),
  )
  const exported = await new CompleteAudioBackups(
    destination.repository,
  ).export()
  expect(exported.bytes.length).toBeGreaterThan(20 * 1024 * 1024)
  const entries = await readStoredZip(exported.bytes)
  expect(entries.get('library.json')!.length).toBeLessThan(1024 * 1024)
  const target = await setup('large-restored', false)
  const service = new CompleteAudioBackups(target.repository)
  const prepared = await service.readFile({
    size: exported.bytes.length,
    arrayBuffer: () => Promise.resolve(new Uint8Array(exported.bytes).buffer),
  })
  await service.restore(prepared, await target.repository.open())
  await target.repository.mutate((current) => {
    current.catalog.albums[0]!.description =
      'Detalle opcional después de restaurar'
    return { snapshot: current, result: undefined }
  })
  expect(await target.repository.readCoverAttachments()).toHaveLength(180)
  expect(
    (await target.repository.readSnapshot()).catalog.albums[0]!.description,
  ).toBe('Detalle opcional después de restaurar')
}, 15000)
