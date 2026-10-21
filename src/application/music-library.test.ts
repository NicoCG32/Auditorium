// @vitest-environment node
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ZodError } from 'zod'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { MusicLibrary, MusicUseCaseError } from './music-library'
import { trackListToken, TrackListConflictError } from './track-lists'

let indexedDB: IDBFactory
let databases: AuditoriumDatabase[]
let nextId: number

beforeEach(() => {
  indexedDB = new IDBFactory()
  databases = []
  nextId = 10000
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of databases) database.close()
  for (const database of new Map(
    databases.map((db) => [db.name, db] as const),
  ).values())
    await database.delete()
})

function setup() {
  const database = new AuditoriumDatabase('music-use-cases', {
    indexedDB,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  const createId = vi.fn(() => fixtureId(nextId++))
  const service = new MusicLibrary(repository, {
    createId,
    now: () => new Date(times.later),
  })
  return { database, repository, createId, service }
}

const albumInput = { title: 'Eclipse', artists: [{ name: 'Umbral Eléctrico' }] }

describe('ejemplares físicos y compras digitales', () => {
  test('dos copias iguales persisten con IDs propios y remoción conserva catálogo/experiencia/ratings', async () => {
    const { service, repository } = setup(),
      created = await originalAlbum(service)
    const before = await repository.readSnapshot()
    const input = {
      medium: 'physical',
      format: 'cd',
      releaseId: created.release.id,
      notes: '  Copia ficticia.\nSegunda línea.  ',
      acquiredAt: '1998-01-01',
    }
    const first = await service.addOwnedItem(created.userAlbum!.id, input)
    const second = await service.addOwnedItem(created.userAlbum!.id, input)
    expect(first.id).not.toBe(second.id)
    expect(second.notes).toBe(input.notes)
    repository.close()
    const reopened = setup()
    expect(
      (await reopened.repository.readSnapshot()).library.ownedItems,
    ).toHaveLength(2)
    await reopened.service.removeOwnedItem(created.userAlbum!.id, first.id)
    const after = await reopened.repository.readSnapshot()
    expect(after.library.ownedItems).toEqual([second])
    expect(after.catalog).toEqual(before.catalog)
    expect(after.library.userAlbums).toEqual(before.library.userAlbums)
    expect(after.library.albumRatings).toEqual(before.library.albumRatings)
    expect(after.library.trackRatings).toEqual(before.library.trackRatings)
  })
  test('compra digital exige edición digital; no transforma streaming en propiedad', async () => {
    const { service, repository } = setup(),
      created = await originalAlbum(service)
    const digital = await service.addRelease({
      albumId: created.album.id,
      format: 'digital',
      editionLabel: 'Deluxe',
    })
    const before = await repository.readSnapshot()
    expect(before.library.ownedItems).toEqual([])
    expect(before.catalog.albums).toHaveLength(1)
    expect(
      before.catalog.releases.find((release) => release.id === digital.id),
    ).toMatchObject({ format: 'digital', editionLabel: 'Deluxe' })
    await expect(
      service.addOwnedItem(created.userAlbum!.id, {
        medium: 'purchased_digital',
        format: 'digital_download',
        releaseId: created.release.id,
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      service.addOwnedItem(created.userAlbum!.id, {
        medium: 'streaming',
        format: 'digital_download',
      }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await repository.readSnapshot()).toEqual(before)
    const item = await service.addOwnedItem(created.userAlbum!.id, {
      medium: 'purchased_digital',
      format: 'digital_download',
      releaseId: digital.id,
    })
    expect(item).not.toHaveProperty('mediaCondition')
    expect((await repository.readSnapshot()).library.userAlbums).toEqual(
      before.library.userAlbums,
    )
  })
  test('referencia de otro álbum y campos ajenos se rechazan', async () => {
    const { service, repository } = setup(),
      first = await originalAlbum(service),
      other = await originalAlbum(service)
    const before = await repository.readSnapshot()
    await expect(
      service.addOwnedItem(first.userAlbum!.id, {
        medium: 'physical',
        format: 'cd',
        releaseId: other.release.id,
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      service.addOwnedItem(first.userAlbum!.id, {
        medium: 'physical',
        format: 'cd',
        listeningStatus: 'completed',
      }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await repository.readSnapshot()).toEqual(before)
  })
  test('alta fallida y remoción fallida revierten y permiten reintentar', async () => {
    const { service, repository, database } = setup(),
      created = await originalAlbum(service)
    const input = { medium: 'physical', format: 'cd' }
    const before = await repository.readSnapshot()
    const write = vi
      .spyOn(database.ownedItems, 'bulkPut')
      .mockRejectedValue(
        new DOMException('Quota ficticia', 'QuotaExceededError'),
      )
    await expect(
      service.addOwnedItem(created.userAlbum!.id, input),
    ).rejects.toMatchObject({ code: 'quota_exceeded' })
    expect(await repository.readSnapshot()).toEqual(before)
    write.mockRestore()
    const item = await service.addOwnedItem(created.userAlbum!.id, input),
      saved = await repository.readSnapshot()
    const remove = vi
      .spyOn(database.ownedItems, 'bulkDelete')
      .mockRejectedValue(new DOMException('Aborto ficticio', 'AbortError'))
    await expect(
      service.removeOwnedItem(created.userAlbum!.id, item.id),
    ).rejects.toMatchObject({ code: 'aborted' })
    expect(await repository.readSnapshot()).toEqual(saved)
    remove.mockRestore()
    await service.removeOwnedItem(created.userAlbum!.id, item.id)
    expect((await repository.readSnapshot()).library.ownedItems).toEqual([])
  })
  test('dos conexiones registran copias iguales sin deduplicar ni perder una', async () => {
    const first = setup(),
      created = await originalAlbum(first.service),
      second = setup()
    const idsCreated = await Promise.all([
      first.service.addOwnedItem(created.userAlbum!.id, {
        medium: 'physical',
        format: 'cd',
      }),
      second.service.addOwnedItem(created.userAlbum!.id, {
        medium: 'physical',
        format: 'cd',
      }),
    ])
    expect(new Set(idsCreated.map((item) => item.id)).size).toBe(2)
    expect(
      (await first.repository.readSnapshot()).library.ownedItems,
    ).toHaveLength(2)
  })
  test('nota en blanco y edición ausente se omiten', async () => {
    const { service, repository } = setup(),
      created = await service.createAlbum(albumInput)
    const item = await service.addOwnedItem(created.userAlbum!.id, {
      medium: 'physical',
      format: 'other',
      notes: ' \n ',
    })
    expect(item).not.toHaveProperty('notes')
    expect(item).not.toHaveProperty('releaseId')
    expect(
      (await repository.readSnapshot()).library.ownedItems[0],
    ).not.toHaveProperty('notes')
  })
})

describe('listas originales y ediciones', () => {
  test('lista original sin edición, copia compartida, bonus y variante persisten sin alterar datos personales', async () => {
    const { service, repository } = setup()
    const created = await service.createAlbum(albumInput)
    const before = await repository.readSnapshot()
    await service.saveTrackList({
      albumId: created.album.id,
      expected: trackListToken(before.catalog, created.album.id),
      rows: [
        { track: { title: 'Overture' }, discNumber: 1, trackNumber: 1 },
        { track: { title: 'Eclipse' }, discNumber: 1, trackNumber: 2 },
      ],
    })
    const original = await repository.readSnapshot()
    const track = original.catalog.tracks[0]!
    const release = await service.addRelease({
      albumId: created.album.id,
      format: 'cd',
      editionLabel: 'Deluxe',
    })
    const copied = await repository.readSnapshot()
    const appearances = copied.catalog.releaseTracks
    expect(appearances.map((row) => row.trackId)).toEqual(
      original.catalog.coreTracks.map((row) => row.trackId),
    )
    await service.saveTrackList({
      albumId: created.album.id,
      releaseId: release.id,
      expected: trackListToken(copied.catalog, created.album.id, release.id),
      rows: [
        ...appearances.map((row, index) => ({
          trackId: row.trackId,
          occurrenceId: row.id,
          discNumber: 1,
          trackNumber: 2 - index,
        })),
        {
          track: {
            title: 'Eclipse',
            versionLabel: 'Demo',
            variantOfTrackId: track.id,
          },
          discNumber: 2,
          trackNumber: 1,
          contentRole: 'alternate',
          displayTitleOverride: 'Ensayo ficticio',
          durationMs: 123456,
        },
        {
          track: { title: 'Umbral extra' },
          discNumber: 2,
          trackNumber: 2,
          contentRole: 'bonus',
        },
      ],
    })
    const after = await repository.readSnapshot()
    expect(after.catalog.coreTracks).toEqual(original.catalog.coreTracks)
    expect(after.catalog.tracks.slice(0, 2)).toEqual(original.catalog.tracks)
    expect(
      after.catalog.releaseTracks.slice(0, 2).map((row) => row.id),
    ).toEqual(appearances.map((row) => row.id))
    expect(after.catalog.tracks[2]).toMatchObject({
      variantOfTrackId: track.id,
      versionLabel: 'Demo',
    })
    expect(after.library).toEqual(before.library)
    repository.close()
    expect(await setup().repository.readSnapshot()).toEqual(after)
  })
  test('editar original no modifica ninguna edición; quitar aparición conserva pista y rating', async () => {
    const { service, repository } = setup()
    const created = await originalAlbum(service)
    await service.rateTrack(created.userAlbum!.id, created.first.track.id, 8)
    const before = await repository.readSnapshot()
    await service.saveTrackList({
      albumId: created.album.id,
      expected: trackListToken(before.catalog, created.album.id),
      rows: [],
    })
    const after = await repository.readSnapshot()
    expect(after.catalog.coreTracks).toEqual([])
    expect(after.catalog.releaseTracks).toEqual(before.catalog.releaseTracks)
    expect(after.catalog.tracks).toEqual(before.catalog.tracks)
    expect(after.library).toEqual(before.library)
  })
  test.each(
    [
      [
        { track: { title: 'Uno' }, discNumber: 1, trackNumber: 1 },
        { track: { title: 'Dos' }, discNumber: 1, trackNumber: 1 },
      ],
      [{ track: { title: 'Inválida' }, discNumber: 0, trackNumber: 1 }],
      [{ track: { title: 'Inválida' }, discNumber: 1, trackNumber: 1.5 }],
      [{ trackId: ids.missing, discNumber: 1, trackNumber: 1 }],
      [
        {
          track: { title: 'Variante', variantOfTrackId: ids.missing },
          discNumber: 1,
          trackNumber: 1,
        },
      ],
    ].map((rows) => ({ rows })),
  )('lista inválida %# no escribe parcialmente', async ({ rows }) => {
    const { service, repository } = setup()
    const created = await originalAlbum(service)
    const before = await repository.readSnapshot()
    await expect(
      service.saveTrackList({
        albumId: created.album.id,
        releaseId: created.release.id,
        expected: trackListToken(
          before.catalog,
          created.album.id,
          created.release.id,
        ),
        rows,
      }),
    ).rejects.toBeInstanceOf(Error)
    expect(await repository.readSnapshot()).toEqual(before)
  })
  test('rechaza pista, variante, edición y aparición de otro álbum', async () => {
    const { service, repository } = setup()
    const first = await originalAlbum(service),
      other = await originalAlbum(service)
    const before = await repository.readSnapshot()
    for (const fields of [
      { trackId: other.first.track.id },
      { track: { title: 'Demo', variantOfTrackId: other.first.track.id } },
      {
        trackId: first.first.track.id,
        occurrenceId: other.first.releaseTrack.id,
      },
    ]) {
      await expect(
        service.saveTrackList({
          albumId: first.album.id,
          releaseId: first.release.id,
          expected: trackListToken(
            before.catalog,
            first.album.id,
            first.release.id,
          ),
          rows: [{ ...fields, discNumber: 1, trackNumber: 1 }],
        }),
      ).rejects.toBeInstanceOf(Error)
    }
    await expect(
      service.saveTrackList({
        albumId: first.album.id,
        releaseId: other.release.id,
        expected: trackListToken(
          before.catalog,
          first.album.id,
          other.release.id,
        ),
        rows: [],
      }),
    ).rejects.toBeInstanceOf(Error)
    expect(await repository.readSnapshot()).toEqual(before)
  })
  test('transacción fallida al reemplazar posiciones revierte lista y pistas nuevas', async () => {
    const { service, repository, database } = setup()
    const created = await originalAlbum(service)
    const before = await repository.readSnapshot()
    const failure = vi
      .spyOn(database.releaseTracks, 'bulkPut')
      .mockRejectedValue(
        new DOMException('Quota ficticia', 'QuotaExceededError'),
      )
    const request = {
      albumId: created.album.id,
      releaseId: created.release.id,
      expected: trackListToken(
        before.catalog,
        created.album.id,
        created.release.id,
      ),
      rows: [
        {
          track: { title: 'Bonus ficticio' },
          discNumber: 1,
          trackNumber: 1,
          contentRole: 'bonus',
        },
      ],
    }
    await expect(service.saveTrackList(request)).rejects.toMatchObject({
      code: 'quota_exceeded',
    })
    expect(await repository.readSnapshot()).toEqual(before)
    failure.mockRestore()
    await service.saveTrackList(request)
    expect(
      (await repository.readSnapshot()).catalog.releaseTracks,
    ).toHaveLength(1)
  })
  test('otra conexión invalida el borrador de la misma lista, sin bloquear listas independientes', async () => {
    const first = setup()
    const created = await originalAlbum(first.service)
    const before = await first.repository.readSnapshot()
    const second = setup()
    await second.service.saveTrackList({
      albumId: created.album.id,
      expected: trackListToken(before.catalog, created.album.id),
      rows: [],
    })
    await first.service.saveTrackList({
      albumId: created.album.id,
      releaseId: created.release.id,
      expected: trackListToken(
        before.catalog,
        created.album.id,
        created.release.id,
      ),
      rows: [],
    })
    const current = await first.repository.readSnapshot()
    await expect(
      first.service.saveTrackList({
        albumId: created.album.id,
        expected: trackListToken(before.catalog, created.album.id),
        rows: [
          {
            track: { title: 'Borrador anterior' },
            discNumber: 1,
            trackNumber: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(TrackListConflictError)
    expect(await first.repository.readSnapshot()).toEqual(current)
  })
  test('rechaza IDs repetidos de aparición y atributos de edición en lista original', async () => {
    const { service, repository } = setup()
    const created = await originalAlbum(service)
    const before = await repository.readSnapshot()
    const row = {
      trackId: created.first.track.id,
      occurrenceId: created.first.releaseTrack.id,
      discNumber: 1,
      trackNumber: 1,
    }
    await expect(
      service.saveTrackList({
        albumId: created.album.id,
        releaseId: created.release.id,
        expected: trackListToken(
          before.catalog,
          created.album.id,
          created.release.id,
        ),
        rows: [row, { ...row, trackNumber: 2 }],
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      service.saveTrackList({
        albumId: created.album.id,
        expected: trackListToken(before.catalog, created.album.id),
        rows: [
          {
            trackId: created.first.track.id,
            discNumber: 1,
            trackNumber: 1,
            contentRole: 'bonus',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(Error)
    expect(await repository.readSnapshot()).toEqual(before)
  })
})

describe('guardar escucha y notas personales', () => {
  test('guarda texto literal y estado juntos, conserva catálogo/notas y persiste al reabrir', async () => {
    const { service, repository } = setup()
    const album = await originalAlbum(service)
    if (!album.userAlbum) throw new Error('Falta entrada ficticia.')
    await service.rateAlbum(album.userAlbum.id, 9.5)
    await service.rateTrack(album.userAlbum.id, album.first.track.id, 8)
    const before = await repository.readSnapshot()
    const updated = await service.updatePersonalExperience(album.userAlbum.id, {
      listeningStatus: 'completed',
      personalNotes: '  Recuerdo ficticio.\nSegunda línea.  ',
    })
    expect(updated).toMatchObject({
      listeningStatus: 'completed',
      personalNotes: '  Recuerdo ficticio.\nSegunda línea.  ',
    })
    const after = await repository.readSnapshot()
    expect(after.catalog).toEqual(before.catalog)
    expect(after.library.albumRatings).toEqual(before.library.albumRatings)
    expect(after.library.trackRatings).toEqual(before.library.trackRatings)
    repository.close()
    expect(await setup().repository.readSnapshot()).toEqual(after)
  })
  test.each(['', ' \n\t '])(
    'nota vacía %s se omite sin alterar ratings',
    async (personalNotes) => {
      const { service, repository } = setup()
      const created = await service.createAlbum(albumInput)
      if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
      await service.updatePersonalExperience(created.userAlbum.id, {
        listeningStatus: 'queued',
        personalNotes: 'Comentario ficticio',
      })
      await service.updatePersonalExperience(created.userAlbum.id, {
        listeningStatus: 'queued',
        personalNotes,
      })
      expect(
        (await repository.readSnapshot()).library.userAlbums[0],
      ).not.toHaveProperty('personalNotes')
    },
  )
  test('rechaza estado inválido y campos de propiedad antes de escribir', async () => {
    const { service, repository } = setup()
    const created = await service.createAlbum(albumInput)
    if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
    const before = await repository.readSnapshot()
    await expect(
      service.updatePersonalExperience(created.userAlbum.id, {
        listeningStatus: 'owned',
        personalNotes: 'Ficticio',
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      service.updatePersonalExperience(created.userAlbum.id, {
        listeningStatus: 'completed',
        owned: true,
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      service.updatePersonalExperience(ids.missing, {
        listeningStatus: 'completed',
      }),
    ).rejects.toMatchObject({ rule: 'missing_reference' })
    expect(await repository.readSnapshot()).toEqual(before)
  })
  test('un fallo al guardar revierte ambas partes y la nota anterior', async () => {
    const { service, repository, database } = setup()
    const created = await service.createAlbum(albumInput)
    if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
    await service.updatePersonalExperience(created.userAlbum.id, {
      listeningStatus: 'queued',
      personalNotes: 'Comentario anterior ficticio',
    })
    const before = await repository.readSnapshot()
    const failure = vi
      .spyOn(database.userAlbums, 'bulkPut')
      .mockRejectedValue(
        new DOMException('Quota ficticia', 'QuotaExceededError'),
      )
    await expect(
      service.updatePersonalExperience(created.userAlbum.id, {
        listeningStatus: 'completed',
        personalNotes: 'No debe quedar',
      }),
    ).rejects.toMatchObject({ code: 'quota_exceeded' })
    failure.mockRestore()
    repository.close()
    expect(await setup().repository.readSnapshot()).toEqual(before)
  })
  test('otra conexión no puede perder notas con el mismo timestamp usando un borrador anterior', async () => {
    const first = setup(),
      second = setup()
    const created = await first.service.createAlbum(albumInput)
    if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
    const expected = {
      listeningStatus: created.userAlbum.listeningStatus,
      updatedAt: created.userAlbum.updatedAt,
    }
    await first.service.updatePersonalExperience(created.userAlbum.id, {
      listeningStatus: 'completed',
      personalNotes: 'Actualización desde otra conexión',
    })
    const before = await first.repository.readSnapshot()
    await expect(
      second.service.updatePersonalExperience(created.userAlbum.id, {
        listeningStatus: 'queued',
        personalNotes: 'Borrador anterior',
        expected,
      }),
    ).rejects.toMatchObject({ code: 'outdated_experience' })
    expect(await second.repository.readSnapshot()).toEqual(before)
  })
})

describe('registro manual con revisión de coincidencias', () => {
  test('artista y título crean una entrada con tipo álbum y sin metadatos inventados', async () => {
    const { service, repository } = setup()
    const result = await service.registerAlbum(albumInput)
    expect(result.status).toBe('created')
    if (result.status !== 'created') throw new Error('Falta alta ficticia.')
    expect(result.album.primaryType).toBe('unspecified')
    expect(result.album).not.toHaveProperty('originalYear')
    expect((await repository.readSnapshot()).library.userAlbums).toEqual([
      result.userAlbum,
    ])
  })
  test('coincidencias normalizadas no escriben ni generan identificadores', async () => {
    const { service, repository, createId } = setup()
    const existing = await service.createAlbum(albumInput)
    if (!existing.userAlbum) throw new Error('Falta entrada ficticia.')
    await service.rateAlbum(existing.userAlbum.id, 9.5)
    const before = await repository.readSnapshot()
    createId.mockClear()
    const result = await service.registerAlbum({
      title: ' ECLIPSE ',
      artists: [{ name: 'umbral   electrico' }],
    })
    expect(result).toMatchObject({
      status: 'review',
      candidates: [
        { album: existing.album, activeEntryId: existing.userAlbum.id },
      ],
    })
    expect(createId).not.toHaveBeenCalled()
    expect(await repository.readSnapshot()).toEqual(before)
  })
  test('confirmar otra obra conserva homónimos y valoraciones existentes', async () => {
    const { service, repository } = setup()
    const existing = await service.createAlbum(albumInput)
    if (!existing.userAlbum) throw new Error('Falta entrada ficticia.')
    await service.rateAlbum(existing.userAlbum.id, 9.5)
    const before = await repository.readSnapshot()
    const result = await service.registerAlbum(albumInput, [existing.album.id])
    expect(result.status).toBe('created')
    const after = await repository.readSnapshot()
    expect(after.catalog.albums).toHaveLength(2)
    expect(after.catalog.artists).toHaveLength(2)
    expect(after.library.albumRatings).toEqual(before.library.albumRatings)
  })
  test('reutilizar artista exige referencia y no fusiona por nombre', async () => {
    const { service, repository } = setup()
    const original = await service.createAlbum(albumInput)
    const artist = original.artists[0]
    if (!artist) throw new Error('Falta artista ficticio.')
    await service.registerAlbum({
      title: 'Otra órbita',
      artists: [{ artistId: artist.id }],
    })
    expect((await repository.readSnapshot()).catalog.artists).toHaveLength(1)
  })
  test('dos altas concurrentes equivalentes producen una alta y una revisión', async () => {
    const first = setup(),
      second = setup()
    const results = await Promise.all([
      first.service.registerAlbum(albumInput),
      second.service.registerAlbum(albumInput),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([
      'created',
      'review',
    ])
    expect(
      (await first.repository.readSnapshot()).library.userAlbums,
    ).toHaveLength(1)
  })
  test('una coincidencia nueva entre revisión y confirmación exige revisarla', async () => {
    const first = setup()
    const existing = await first.service.createAlbum(albumInput)
    const second = setup()
    await second.service.createAlbum({ ...albumInput, originalYear: 2003 })
    const before = await first.repository.readSnapshot()
    const result = await first.service.registerAlbum(albumInput, [
      existing.album.id,
    ])
    expect(result.status).toBe('review')
    if (result.status !== 'review') throw new Error('Falta revisión ficticia.')
    expect(result.candidates).toHaveLength(2)
    expect(await first.repository.readSnapshot()).toEqual(before)
  })
  test('catálogo sin relación activa se propone y se añade sin recrear música', async () => {
    const { service, repository } = setup()
    const catalog = await service.createAlbum({
      ...albumInput,
      addToLibrary: false,
    })
    const before = await repository.readSnapshot()
    const result = await service.registerAlbum(albumInput)
    expect(result).toMatchObject({
      status: 'review',
      candidates: [{ album: catalog.album }],
    })
    if (result.status !== 'review') throw new Error('Falta candidato ficticio.')
    expect(result.candidates[0]).not.toHaveProperty('activeEntryId')
    await service.addAlbumToLibrary(catalog.album.id)
    const after = await repository.readSnapshot()
    expect(after.catalog).toEqual(before.catalog)
    expect(after.library.userAlbums).toHaveLength(1)
  })
  test('entradas inválidas y confirmaciones inválidas se rechazan antes de escribir', async () => {
    const { service, repository } = setup()
    const before = await repository.readSnapshot()
    await expect(
      service.registerAlbum({ ...albumInput, addToLibrary: false }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      service.registerAlbum(albumInput, ['invalido']),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await repository.readSnapshot()).toEqual(before)
  })
})

async function originalAlbum(service: MusicLibrary) {
  const created = await service.createAlbum(albumInput)
  const release = await service.addRelease({
    albumId: created.album.id,
    format: 'cd',
    editionLabel: 'Original',
  })
  const first = await service.addTrackToRelease({
    releaseId: release.id,
    track: { title: 'Overture' },
    discNumber: 1,
    trackNumber: 1,
    corePosition: { discNumber: 1, trackNumber: 1 },
  })
  const second = await service.addTrackToRelease({
    releaseId: release.id,
    track: { title: 'Eclipse' },
    discNumber: 1,
    trackNumber: 2,
    corePosition: { discNumber: 1, trackNumber: 2 },
  })
  return { ...created, release, first, second }
}

describe('altas consistentes', () => {
  test('crea artista, álbum, crédito y biblioteca en una sola operación', async () => {
    const { service, repository } = setup()
    const created = await service.createAlbum(albumInput)
    const snapshot = await repository.readSnapshot()
    expect(snapshot.catalog.artists).toHaveLength(1)
    expect(snapshot.catalog.albums).toEqual([created.album])
    expect(snapshot.catalog.albumArtists).toEqual(created.credits)
    expect(snapshot.library.userAlbums).toEqual([created.userAlbum])
    expect(created.userAlbum).toMatchObject({
      userId: snapshot.identity.userId,
      albumId: created.album.id,
      listeningStatus: 'untracked',
    })
    expect(created.album.createdBy).toBe(snapshot.identity.userId)
    expect(snapshot.library.albumRatings).toEqual([])
  })

  test('reutiliza artistas solo por referencia explícita, con varios créditos', async () => {
    const { service, repository } = setup()
    const first = await service.createAlbum(albumInput)
    const artist = first.artists[0]
    if (!artist) throw new Error('Falta artista ficticio.')
    const second = await service.createAlbum({
      title: 'Otra órbita',
      artists: [
        { artistId: artist.id },
        { name: 'Luz del Umbral', role: 'featured', creditedAs: 'Luz' },
      ],
    })
    const snapshot = await repository.readSnapshot()
    expect(snapshot.catalog.artists).toHaveLength(2)
    expect(second.credits.map((credit) => credit.position)).toEqual([1, 2])
    expect(second.credits[1]).toMatchObject({
      role: 'featured',
      creditedAs: 'Luz',
    })
  })

  test('homónimos no se fusionan y se puede crear solo catálogo', async () => {
    const { service, repository } = setup()
    await service.createAlbum(albumInput)
    const created = await service.createAlbum({
      ...albumInput,
      addToLibrary: false,
    })
    const snapshot = await repository.readSnapshot()
    expect(snapshot.catalog.albums).toHaveLength(2)
    expect(snapshot.catalog.artists).toHaveLength(2)
    expect(snapshot.library.userAlbums).toHaveLength(1)
    expect(created).not.toHaveProperty('userAlbum')
    const entry = await service.addAlbumToLibrary(created.album.id)
    expect(entry.albumId).toBe(created.album.id)
  })

  test('añadir a biblioteca es idempotente y no cambia datos personales', async () => {
    const { service, repository, createId } = setup()
    const created = await service.createAlbum(albumInput)
    if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
    await service.rateAlbum(created.userAlbum.id, 9.5)
    const before = await repository.readSnapshot()
    createId.mockClear()
    expect(
      await service.addAlbumToLibrary(created.album.id.toUpperCase()),
    ).toEqual(created.userAlbum)
    expect(await repository.readSnapshot()).toEqual(before)
    expect(createId).not.toHaveBeenCalled()
  })

  test('añade nueva entrada activa conservando un histórico', async () => {
    const { service, repository } = setup()
    const created = await service.createAlbum(albumInput)
    if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
    await repository.mutate((snapshot) => {
      snapshot.library.userAlbums = snapshot.library.userAlbums.map(
        (entry) => ({
          ...entry,
          deletedAt: times.later,
          updatedAt: times.later,
        }),
      )
      return { snapshot, result: undefined }
    })
    const active = await service.addAlbumToLibrary(created.album.id)
    expect(active.id).not.toBe(created.userAlbum.id)
    const snapshot = await repository.readSnapshot()
    expect(snapshot.library.userAlbums).toHaveLength(2)
    expect(
      snapshot.library.userAlbums.filter(
        (entry) => entry.deletedAt === undefined,
      ),
    ).toHaveLength(1)
  })

  test('dos conexiones concurrentes no crean entradas activas duplicadas', async () => {
    const first = setup()
    const created = await first.service.createAlbum({
      ...albumInput,
      addToLibrary: false,
    })
    const second = setup()
    const [a, b] = await Promise.all([
      first.service.addAlbumToLibrary(created.album.id),
      second.service.addAlbumToLibrary(created.album.id),
    ])
    expect(a.id).toBe(b.id)
    expect(
      (await first.repository.readSnapshot()).library.userAlbums,
    ).toHaveLength(1)
  })
})

describe('ediciones, pistas y calificaciones', () => {
  test('original y Deluxe reutilizan pistas, conservan lista original y tienen bonus propio', async () => {
    const { service, repository } = setup()
    const original = await originalAlbum(service)
    const before = await repository.readSnapshot()
    const deluxe = await service.addRelease({
      albumId: original.album.id,
      format: 'vinyl',
      editionLabel: 'Deluxe',
    })
    const demo = await service.addTrackToRelease({
      releaseId: deluxe.id,
      track: {
        title: 'Eclipse (Demo)',
        variantOfTrackId: original.second.track.id,
      },
      discNumber: 1,
      trackNumber: 3,
      contentRole: 'bonus',
    })
    const snapshot = await repository.readSnapshot()
    expect(snapshot.catalog.albums).toHaveLength(1)
    expect(snapshot.catalog.coreTracks).toEqual(before.catalog.coreTracks)
    expect(
      snapshot.catalog.releaseTracks.filter(
        (row) => row.releaseId === original.release.id,
      ),
    ).toEqual(before.catalog.releaseTracks)
    const deluxeTracks = snapshot.catalog.releaseTracks.filter(
      (row) => row.releaseId === deluxe.id,
    )
    expect(deluxeTracks.map((row) => row.trackId)).toEqual([
      original.first.track.id,
      original.second.track.id,
      demo.track.id,
    ])
    expect(demo.track.variantOfTrackId).toBe(original.second.track.id)
    expect(demo.releaseTrack.contentRole).toBe('bonus')
  })

  test('edición vacía y reutilización explícita de una pista en varias posiciones', async () => {
    const { service, repository } = setup()
    const original = await originalAlbum(service)
    const release = await service.addRelease({
      albumId: original.album.id,
      format: 'digital',
      copyCoreTracks: false,
    })
    await service.addTrackToRelease({
      releaseId: release.id,
      trackId: original.first.track.id,
      discNumber: 1,
      trackNumber: 1,
    })
    await service.addTrackToRelease({
      releaseId: release.id,
      trackId: original.first.track.id,
      discNumber: 2,
      trackNumber: 1,
    })
    const snapshot = await repository.readSnapshot()
    expect(snapshot.catalog.tracks).toHaveLength(2)
    expect(
      snapshot.catalog.releaseTracks.filter(
        (row) => row.releaseId === release.id,
      ),
    ).toHaveLength(2)
  })

  test('notas independientes, compartidas entre ediciones y removibles sin otros cambios', async () => {
    const { service, repository } = setup()
    const original = await originalAlbum(service)
    if (!original.userAlbum) throw new Error('Falta entrada ficticia.')
    const deluxe = await service.addRelease({
      albumId: original.album.id,
      format: 'vinyl',
    })
    const demo = await service.addTrackToRelease({
      releaseId: deluxe.id,
      track: { title: 'Demo', variantOfTrackId: original.second.track.id },
      discNumber: 1,
      trackNumber: 3,
    })
    await service.rateAlbum(original.userAlbum.id, 9.5)
    await service.rateTrack(original.userAlbum.id, original.second.track.id, 8)
    await service.rateTrack(original.userAlbum.id, demo.track.id, 6.5)
    const before = await repository.readSnapshot()
    expect(before.library.albumRatings[0]?.scoreUnits).toBe(19)
    expect(before.library.trackRatings).toHaveLength(2)
    await service.rateTrack(original.userAlbum.id, original.second.track.id, 10)
    expect((await repository.readSnapshot()).library.albumRatings).toEqual(
      before.library.albumRatings,
    )
    await service.removeTrackRating(
      original.userAlbum.id,
      original.second.track.id,
    )
    const removed = await repository.readSnapshot()
    expect(removed.library.trackRatings).toHaveLength(1)
    expect(removed.library.trackRatings[0]?.trackId).toBe(demo.track.id)
    expect(removed.library.userAlbums).toEqual(before.library.userAlbums)
    await service.removeAlbumRating(original.userAlbum.id)
    await service.removeAlbumRating(original.userAlbum.id)
    const final = await repository.readSnapshot()
    expect(final.library.albumRatings).toEqual([])
    expect(final.library.trackRatings).toEqual(removed.library.trackRatings)
    expect(final.library.userAlbums).toEqual(before.library.userAlbums)
  })

  test('reabre conservando altas, ediciones y notas', async () => {
    const first = setup()
    const original = await originalAlbum(first.service)
    if (!original.userAlbum) throw new Error('Falta entrada ficticia.')
    await first.service.rateAlbum(original.userAlbum.id, 9.5)
    const before = await first.repository.readSnapshot()
    first.repository.close()
    const second = setup()
    expect(await second.repository.readSnapshot()).toEqual(before)
  })
})

describe('fallos y rollback', () => {
  test('rechaza un resultado asíncrono antes de persistir cambios', async () => {
    const { repository } = setup()
    const before = await repository.readSnapshot()
    await expect(
      repository.mutate((snapshot) => {
        snapshot.catalog.artists.push({
          id: ids.artist,
          name: 'Umbral ficticio',
          catalogScope: 'personal',
        })
        return { snapshot, result: Promise.resolve('Resultado externo') }
      }),
    ).rejects.toBeInstanceOf(TypeError)
    expect(await repository.readSnapshot()).toEqual(before)
  })
  test('valida entradas antes de escribir y conserva el estado previo', async () => {
    const { service, repository } = setup()
    const before = await repository.readSnapshot()
    await expect(
      service.createAlbum({ title: ' ', artists: [{ name: 'Umbral' }] }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      service.createAlbum({
        title: 'Eclipse',
        artists: [{ name: 'Umbral', role: 'featured' }],
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      service.createAlbum({
        title: 'Eclipse',
        artists: [{ artistId: ids.missing }],
      }),
    ).rejects.toBeInstanceOf(MusicUseCaseError)
    await expect(service.addAlbumToLibrary(ids.missing)).rejects.toMatchObject({
      code: 'missing_reference',
    })
    await expect(
      service.addRelease({ albumId: ids.missing, format: 'cd' }),
    ).rejects.toMatchObject({ code: 'missing_reference' })
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('posición ocupada rechaza pista y aparición nuevas juntas', async () => {
    const { service, repository } = setup()
    const original = await originalAlbum(service)
    const before = await repository.readSnapshot()
    await expect(
      service.addTrackToRelease({
        releaseId: original.release.id,
        track: { title: 'No debe quedar' },
        discNumber: 1,
        trackNumber: 1,
      }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('referencias cruzadas y ratings inválidos no alteran datos', async () => {
    const { service, repository } = setup()
    const a = await originalAlbum(service)
    const b = await service.createAlbum({
      title: 'Otra órbita',
      artists: [{ name: 'Otra formación' }],
    })
    const otherRelease = await service.addRelease({
      albumId: b.album.id,
      format: 'cd',
    })
    const before = await repository.readSnapshot()
    await expect(
      service.addTrackToRelease({
        releaseId: otherRelease.id,
        trackId: a.first.track.id,
        discNumber: 1,
        trackNumber: 1,
      }),
    ).rejects.toMatchObject({ code: 'wrong_album' })
    await expect(
      service.addTrackToRelease({
        releaseId: otherRelease.id,
        track: { title: 'Demo inválida', variantOfTrackId: a.first.track.id },
        discNumber: 1,
        trackNumber: 1,
      }),
    ).rejects.toBeInstanceOf(ZodError)
    if (!b.userAlbum) throw new Error('Falta entrada ficticia.')
    await expect(
      service.rateTrack(b.userAlbum.id, a.first.track.id, 8),
    ).rejects.toMatchObject({ rule: 'wrong_album' })
    await expect(service.rateAlbum(b.userAlbum.id, 9.3)).rejects.toBeInstanceOf(
      ZodError,
    )
    await expect(
      service.addTrackToRelease({
        releaseId: ids.missing,
        trackId: a.first.track.id,
        discNumber: 1,
        trackNumber: 1,
      }),
    ).rejects.toMatchObject({ code: 'missing_reference' })
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('un ID generado duplicado no reemplaza entidades existentes', async () => {
    const { service, repository } = setup()
    const original = await service.createAlbum(albumInput)
    const before = await repository.readSnapshot()
    const bad = new MusicLibrary(repository, {
      createId: () => original.artists[0]?.id ?? ids.missing,
      now: () => new Date(times.later),
    })
    await expect(bad.createAlbum(albumInput)).rejects.toBeInstanceOf(ZodError)
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('un fallo de escritura revierte artista, álbum, créditos y biblioteca', async () => {
    const { service, repository, database } = setup()
    const before = await repository.readSnapshot()
    const failure = vi
      .spyOn(database.userAlbums, 'bulkPut')
      .mockRejectedValue(
        new DOMException('Quota ficticia', 'QuotaExceededError'),
      )
    await expect(service.createAlbum(albumInput)).rejects.toMatchObject({
      code: 'quota_exceeded',
    })
    failure.mockRestore()
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('un BulkError con quota conserva causa y revierte otras tablas', async () => {
    const { service, repository, database } = setup()
    const before = await repository.readSnapshot()
    const cause = new Dexie.BulkError('Quota ficticia', [
      new DOMException('Quota', 'QuotaExceededError'),
    ])
    const failure = vi
      .spyOn(database.albumArtists, 'bulkPut')
      .mockRejectedValue(cause)
    await expect(service.createAlbum(albumInput)).rejects.toMatchObject({
      code: 'quota_exceeded',
      cause,
    })
    failure.mockRestore()
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('un fallo al copiar pistas revierte también la edición', async () => {
    const { service, repository, database } = setup()
    const original = await originalAlbum(service)
    const before = await repository.readSnapshot()
    const failure = vi
      .spyOn(database.releaseTracks, 'bulkPut')
      .mockRejectedValue(new DOMException('Abort ficticio', 'AbortError'))
    await expect(
      service.addRelease({ albumId: original.album.id, format: 'vinyl' }),
    ).rejects.toMatchObject({ code: 'aborted' })
    failure.mockRestore()
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('fallo después de quitar nota restaura el registro anterior', async () => {
    const { service, repository, database } = setup()
    const created = await service.createAlbum(albumInput)
    if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
    await service.rateAlbum(created.userAlbum.id, 9.5)
    const before = await repository.readSnapshot()
    const failure = vi
      .spyOn(database.albumRatings, 'bulkPut')
      .mockRejectedValue(
        new DOMException('Quota ficticia', 'QuotaExceededError'),
      )
    await expect(
      service.rateAlbum(created.userAlbum.id, 10),
    ).rejects.toMatchObject({ code: 'quota_exceeded' })
    failure.mockRestore()
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('la mutación no puede cambiar identidad ni guardar referencias inválidas', async () => {
    const { repository } = setup()
    const before = await repository.readSnapshot()
    await expect(
      repository.mutate((snapshot) => {
        snapshot.identity.userId = libraryIds.otherUser
        return { snapshot, result: undefined }
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      repository.mutate((snapshot) => {
        snapshot.catalog.tracks.push({
          id: ids.eclipse,
          albumId: ids.missing,
          title: 'Sin álbum',
        })
        return { snapshot, result: undefined }
      }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('valida antes del primer I/O y solo escribe filas modificadas', async () => {
    const { service, repository, database } = setup()
    const created = await service.createAlbum(albumInput)
    if (!created.userAlbum) throw new Error('Falta entrada ficticia.')
    const artists = vi.spyOn(database.artists, 'bulkPut')
    const userAlbums = vi.spyOn(database.userAlbums, 'bulkPut')
    await service.rateAlbum(created.userAlbum.id, 9.5)
    expect(artists).not.toHaveBeenCalled()
    expect(userAlbums).not.toHaveBeenCalled()
    const before = await repository.readSnapshot()
    const ratings = vi.spyOn(database.albumRatings, 'bulkDelete')
    await expect(
      repository.mutate((snapshot) => {
        snapshot.library.albumRatings.push({
          userAlbumId: libraryIds.otherEntry,
          scoreUnits: 0,
          updatedAt: times.later,
        })
        return { snapshot, result: undefined }
      }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(ratings).not.toHaveBeenCalled()
    expect(await repository.readSnapshot()).toEqual(before)
  })
})
