// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { EditionImports } from './edition-imports'
import type { EditionDetails } from './edition-catalog'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { times } from '../domain/library/library.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import {
  legacySnapshotV8Schema,
  parseBackupDocument,
  serializeBackup,
  parseBackupText,
} from '../domain/backup'

const source: EditionDetails = {
  id: fixtureId(7100),
  groupId: fixtureId(7000),
  title: 'Eclipse',
  description: 'Edición de prueba',
  date: '2001-03',
  country: 'CL',
  label: 'Sello de prueba',
  catalogNumber: 'TEST-01',
  formats: ['CD', 'CD'],
  trackCount: 2,
  completeTracks: true,
  tracks: [
    {
      recordingId: fixtureId(7200),
      title: 'Primera pista de prueba',
      discNumber: 1,
      trackNumber: 1,
      durationMs: 180000,
    },
    {
      recordingId: fixtureId(7201),
      title: 'Segunda pista de prueba',
      discNumber: 2,
      trackNumber: 1,
    },
  ],
}
const choices = {
  edition: 'new',
  format: 'cd',
  includeTracks: true,
  cover: false,
} as const
let database: AuditoriumDatabase
beforeEach(() => {
  database = new AuditoriumDatabase('edition-imports', {
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
  const fixture = makeBackup()
  const repository = new IndexedDbRepository({
    database,
    createId: () => fixture.data.identity.userId,
    now: () => new Date(fixture.data.identity.createdAt),
  })
  await repository.mutate(() => {
    const snapshot = fixture.data
    snapshot.catalog.albums.find((row) => row.id === ids.album)!.musicBrainz = {
      id: source.groupId,
      retrievedAt: times.later,
    }
    return { snapshot, result: undefined }
  })
  return {
    repository,
    imports: new EditionImports(repository, () => new Date(times.later)),
  }
}

test('preparar no escribe; importar una edición multidisco conserva biblioteca, listas anteriores e identidades locales', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  const prepared = await imports.prepare(ids.album, source, choices)
  expect(await repository.readSnapshot()).toEqual(before)
  expect(prepared.tracksAdded).toBe(2)
  await imports.confirm(prepared)
  const after = await repository.readSnapshot()
  expect(after.library).toEqual(before.library)
  expect(after.catalog.coreTracks).toEqual(before.catalog.coreTracks)
  expect(
    after.catalog.releases.filter((row) => row.id !== prepared.releaseId),
  ).toEqual(before.catalog.releases)
  expect(
    after.catalog.releases.find((row) => row.id === prepared.releaseId),
  ).toMatchObject({
    musicBrainz: { id: source.id },
    mediaDescription: 'CD · CD',
    countryCode: 'CL',
    releaseYear: 2001,
  })
  expect(prepared.releaseId).not.toBe(source.id)
  expect(
    after.catalog.releaseTracks
      .filter((row) => row.releaseId === prepared.releaseId)
      .toSorted(
        (a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber,
      )
      .map((row) => [row.discNumber, row.trackNumber]),
  ).toEqual([
    [1, 1],
    [2, 1],
  ])
})
test('repetir reconoce una edición y reutiliza grabaciones entre ediciones sin alterar sus pistas', async () => {
  const { repository, imports } = await setup()
  await imports.confirm(await imports.prepare(ids.album, source, choices))
  const first = await repository.readSnapshot()
  await imports.confirm(await imports.prepare(ids.album, source, choices))
  expect(await repository.readSnapshot()).toEqual(first)
  const other = await imports.prepare(
    ids.album,
    {
      ...source,
      id: fixtureId(7101),
      tracks: source.tracks.map((row) => ({
        ...row,
        title: row.title + ' (en esta edición)',
      })),
    },
    choices,
  )
  expect(other.tracksAdded).toBe(0)
  await imports.confirm(other)
  const after = await repository.readSnapshot()
  expect(after.catalog.tracks).toEqual(first.catalog.tracks)
  expect(after.library).toEqual(first.library)
  expect(
    after.catalog.releaseTracks
      .filter((row) => row.releaseId === other.releaseId)
      .every((row) => row.displayTitleOverride?.endsWith('(en esta edición)')),
  ).toBe(true)
})
test('vincular una edición manual conserva sus metadatos, UUID y lista', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  const prepared = await imports.prepare(ids.album, source, {
    ...choices,
    edition: ids.original,
  })
  expect(prepared.added).toBe(false)
  expect(prepared.preservedList).toBe(true)
  await imports.confirm(prepared)
  const after = await repository.readSnapshot()
  const edition = after.catalog.releases.find((row) => row.id === ids.original)!
  const { musicBrainz, ...fields } = edition
  expect(musicBrainz?.id).toBe(source.id)
  expect(fields).toEqual(
    before.catalog.releases.find((row) => row.id === ids.original),
  )
  expect(after.catalog.releaseTracks).toEqual(before.catalog.releaseTracks)
  expect(after.catalog.tracks).toEqual(before.catalog.tracks)
  expect(after.library).toEqual(before.library)
})
test('reutilizar una pista es explícito, conserva sus datos y valoraciones y vincula sólo esa grabación', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot(),
    track = before.catalog.tracks.find((row) => row.albumId === ids.album)!
  const prepared = await imports.prepare(ids.album, source, {
    ...choices,
    tracks: { '1:1': track.id },
  })
  await imports.confirm(prepared)
  const after = await repository.readSnapshot(),
    linked = after.catalog.tracks.find((row) => row.id === track.id)!
  expect(linked).toMatchObject({
    ...track,
    musicBrainz: { id: source.tracks[0]!.recordingId },
  })
  expect(after.library).toEqual(before.library)
  expect(prepared.tracksAdded).toBe(1)
})
test('una referencia de grabación puede estar en álbumes distintos pero no duplicarse dentro del mismo', async () => {
  const { repository, imports } = await setup()
  await imports.confirm(await imports.prepare(ids.album, source, choices))
  const snapshot = await repository.readSnapshot(),
    imported = snapshot.catalog.tracks.find((row) => row.musicBrainz)!
  expect(legacySnapshotV8Schema.safeParse(snapshot).success).toBe(false)
  const otherAlbum = snapshot.catalog.albums.find(
    (row) => row.id !== ids.album,
  )!
  await expect(
    repository.mutate((current) => {
      current.catalog.tracks.push({
        ...imported,
        id: fixtureId(7300),
        albumId: otherAlbum.id,
      })
      return { snapshot: current, result: undefined }
    }),
  ).resolves.toBeUndefined()
  await expect(
    repository.mutate((current) => {
      current.catalog.tracks.push({ ...imported, id: fixtureId(7301) })
      return { snapshot: current, result: undefined }
    }),
  ).rejects.toThrow()
})
test('rechaza una edición de otro grupo, pistas incompletas y reutilización ajena sin escribir', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  await expect(
    imports.prepare(
      ids.album,
      { ...source, groupId: fixtureId(7999) },
      choices,
    ),
  ).rejects.toThrow()
  await expect(
    imports.prepare(ids.album, { ...source, completeTracks: false }, choices),
  ).rejects.toThrow()
  await expect(
    imports.prepare(ids.album, source, {
      ...choices,
      tracks: { '1:1': fixtureId(7998) },
    }),
  ).rejects.toThrow()
  expect(await repository.readSnapshot()).toEqual(before)
  const onlyEdition = await imports.prepare(
    ids.album,
    { ...source, completeTracks: false },
    { ...choices, includeTracks: false },
  )
  expect(onlyEdition.tracksAdded).toBe(0)
})
test('el cambio concurrente invalida la confirmación y un fallo de escritura revierte el lote', async () => {
  const { repository, imports } = await setup()
  const stale = await imports.prepare(ids.album, source, choices)
  await repository.mutate((snapshot) => {
    snapshot.catalog.albums.find((row) => row.id === ids.album)!.description =
      'Cambio concurrente'
    return { snapshot, result: undefined }
  })
  const before = await repository.readSnapshot()
  await expect(imports.confirm(stale)).rejects.toThrow('cambió')
  const prepared = await imports.prepare(ids.album, source, choices)
  const fail = () => {
    throw new Error('QuotaExceededError ficticio')
  }
  database.releases.hook('creating', fail)
  await expect(imports.confirm(prepared)).rejects.toThrow()
  database.releases.hook('creating').unsubscribe(fail)
  expect(await repository.readSnapshot()).toEqual(before)
})
test('JSON9 conserva procedencia; JSON8 sigue legible y rechaza campos de ediciones o pistas futuros', async () => {
  const { repository, imports } = await setup()
  await imports.confirm(await imports.prepare(ids.album, source, choices))
  const snapshot = await repository.readSnapshot()
  const backup = { ...makeBackup(), data: snapshot }
  expect(parseBackupText(serializeBackup(backup)).data).toEqual(snapshot)
  expect(() => parseBackupDocument({ ...backup, schemaVersion: 8 })).toThrow()
  const old = { ...makeBackup(), schemaVersion: 8 }
  expect(parseBackupDocument(old).schemaVersion).toBe(9)
})
test('portada y vínculo de artista requieren confirmación y conservan los datos personales', async () => {
  const { repository, imports } = await setup(),
    before = await repository.readSnapshot()
  const cover = await imports.prepareCover(ids.album)
  expect(await repository.readSnapshot()).toEqual(before)
  await imports.confirm(cover)
  const artist = before.catalog.artists[0]!
  const link = await imports.prepareArtist(artist.id, {
    id: fixtureId(7800),
    name: 'Nombre de la fuente',
    country: 'GB',
  })
  await imports.confirm(link)
  const after = await repository.readSnapshot()
  expect(after.library).toEqual(before.library)
  expect(
    after.catalog.artists.find((row) => row.id === artist.id),
  ).toMatchObject({ ...artist, musicBrainz: { id: fixtureId(7800) } })
  expect(
    after.catalog.albums.find((row) => row.id === ids.album)!.coverUrl,
  ).toBe(
    `https://coverartarchive.org/release-group/${source.groupId}/front-500`,
  )
})
