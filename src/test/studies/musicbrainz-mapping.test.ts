// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ZodError } from 'zod'
import { MusicLibrary } from '../../application/music-library'
import { catalogSchema } from '../../domain/catalog/catalog'
import { fixtureId, ids } from '../../domain/catalog/catalog.fixture'
import type { Release, ReleaseTrack, Track } from '../../domain/catalog/schemas'
import {
  libraryIds,
  makeContext,
  makeLibrary,
  times,
} from '../../domain/library/library.fixture'
import { createLibrarySchema } from '../../domain/library/library'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { AuditoriumDatabase } from '../../infrastructure/db/database'
import { IndexedDbRepository } from '../../infrastructure/repositories/indexeddb-repository'

// Estudio offline con nombres y UUIDs inventados; no consulta MusicBrainz.
// Las selecciones están escritas a mano: no es un importador ni un parser de API.
// Véase docs/METADATOS_EXTERNOS.md para el alcance de la propuesta.
const localIds = {
  remaster: fixtureId(20000),
  otherRelease: fixtureId(20001),
  firstAppearance: fixtureId(20002),
  secondAppearance: fixtureId(20003),
  thirdAppearance: fixtureId(20004),
  copy: fixtureId(20005),
  secondCopy: fixtureId(20006),
  wish: fixtureId(20007),
}
const externalIds = {
  releaseGroup: fixtureId(90000),
  release: fixtureId(90001),
  recording: fixtureId(90002),
  track: fixtureId(90003),
  redirectedRecording: fixtureId(90004),
}

interface ApprovedCatalogChange {
  releases: Release[]
  tracks: Track[]
  appearances: ReleaseTrack[]
}

interface StudyPlan {
  // Proveniencia de estudio separada; no se añade al snapshot ni al respaldo.
  source: {
    provider: 'musicbrainz'
    releaseGroupMbid: string
    releaseMbid: string
    trackMbid: string
    recordingMbid: string
  }
  selectedAlbumId: string
  selectedTrackId: string
  change: ApprovedCatalogChange
}

function approvedRemaster(): StudyPlan {
  return {
    source: {
      provider: 'musicbrainz',
      releaseGroupMbid: externalIds.releaseGroup,
      releaseMbid: externalIds.release,
      trackMbid: externalIds.track,
      recordingMbid: externalIds.recording,
    },
    selectedAlbumId: ids.album,
    selectedTrackId: ids.eclipse,
    change: {
      releases: [
        {
          id: localIds.remaster,
          albumId: ids.album,
          format: 'cd',
          editionLabel: 'Remaster ficticio',
          releaseYear: 2025,
        },
      ],
      tracks: [],
      appearances: [
        {
          id: localIds.firstAppearance,
          releaseId: localIds.remaster,
          trackId: ids.eclipse,
          discNumber: 1,
          trackNumber: 1,
          durationMs: 240001,
          displayTitleOverride: 'Eclipse — presentación ficticia',
          contentRole: 'standard',
        },
        {
          id: localIds.secondAppearance,
          releaseId: localIds.remaster,
          trackId: ids.overture,
          discNumber: 1,
          trackNumber: 2,
          contentRole: 'standard',
        },
      ],
    },
  }
}

function appendApprovedChange(
  snapshot: LocalSnapshot,
  change: ApprovedCatalogChange,
) {
  snapshot.catalog.releases.push(...structuredClone(change.releases))
  snapshot.catalog.tracks.push(...structuredClone(change.tracks))
  snapshot.catalog.releaseTracks.push(...structuredClone(change.appearances))
  return { snapshot, result: undefined }
}

let indexedDB: IDBFactory
let databases: AuditoriumDatabase[]

beforeEach(() => {
  indexedDB = new IDBFactory()
  databases = []
})

afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of databases) database.close()
  for (const database of new Map(
    databases.map((database) => [database.name, database] as const),
  ).values())
    await database.delete()
})

function connection() {
  const database = new AuditoriumDatabase('metadata-mapping-study', {
    indexedDB,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  return { database, repository }
}

async function seeded() {
  const { database, repository } = connection()
  const context = makeContext()
  const otherAlbum = context.catalog.albums.find(
    (album) => album.id === ids.otherAlbum,
  )
  const otherTrack = context.catalog.tracks.find(
    (track) => track.id === libraryIds.otherTrack,
  )
  if (!otherAlbum || !otherTrack) throw new Error('Faltan datos ficticios.')
  otherAlbum.title = 'Eclipse'
  otherTrack.title = 'Eclipse'
  await repository.mutate((snapshot) => {
    snapshot.catalog = context.catalog
    snapshot.library = createLibrarySchema(context).parse({
      ...makeLibrary(),
      userAlbums: [
        ...makeLibrary().userAlbums,
        {
          id: libraryIds.historicalEntry,
          userId: libraryIds.user,
          albumId: ids.album,
          listeningStatus: 'completed',
          personalNotes: 'Recuerdo ficticio de una entrada retirada.',
          addedAt: times.added,
          updatedAt: times.later,
          deletedAt: times.later,
        },
      ],
      ownedItems: [localIds.copy, localIds.secondCopy].map((id) => ({
        id,
        userAlbumId: libraryIds.entry,
        releaseId: ids.original,
        medium: 'physical',
        format: 'cd',
        notes: 'Copia ficticia independiente.',
        createdAt: times.updated,
      })),
      purchaseWishes: [
        {
          id: localIds.wish,
          userAlbumId: libraryIds.entry,
          targetReleaseId: ids.deluxe,
          targetFormat: 'vinyl',
          status: 'active',
          createdAt: times.updated,
        },
      ],
    })
    return { snapshot, result: undefined }
  })
  return { database, repository }
}

describe('estudio offline de correspondencias MusicBrainz', () => {
  test('homónimos y el mismo MBID en la propuesta conservan álbumes distintos sin escribir', async () => {
    const { repository } = await seeded()
    const before = await repository.readSnapshot()
    const possibleLinks = before.catalog.albums.map((album) => ({
      localAlbumId: album.id,
      releaseGroupMbid: externalIds.releaseGroup,
    }))
    const music = new MusicLibrary(repository)
    const result = await music.registerAlbum({
      title: ' ÉCLIPSE ',
      artists: [{ name: 'Umbral Eléctrico' }],
    })
    expect(result.status).toBe('review')
    if (result.status !== 'review') throw new Error('Falta revisión explícita.')
    expect(result.candidates.map((candidate) => candidate.album.id)).toEqual([
      ids.album,
      ids.otherAlbum,
    ])
    expect(possibleLinks.map((link) => link.localAlbumId)).toEqual([
      ids.album,
      ids.otherAlbum,
    ])
    expect(
      possibleLinks.every(
        (link) => link.localAlbumId !== link.releaseGroupMbid,
      ),
    ).toBe(true)
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('catálogo aprobado de remaster conserva IDs, lista original y biblioteca exactos al reabrir', async () => {
    const { repository } = await seeded()
    const before = await repository.readSnapshot()
    const plan = approvedRemaster()
    await repository.mutate((snapshot) =>
      appendApprovedChange(snapshot, plan.change),
    )
    repository.close()
    const { repository: reopened } = connection()
    const after = await reopened.readSnapshot()
    expect(after.identity).toEqual(before.identity)
    expect(after.library).toEqual(before.library)
    expect(after.catalog.artists).toEqual(before.catalog.artists)
    expect(after.catalog.albums).toEqual(before.catalog.albums)
    expect(after.catalog.albumArtists).toEqual(before.catalog.albumArtists)
    expect(after.catalog.tracks).toEqual(before.catalog.tracks)
    expect(after.catalog.coreTracks).toEqual(before.catalog.coreTracks)
    expect(
      after.catalog.releases.filter(
        (release) => release.id !== localIds.remaster,
      ),
    ).toEqual(before.catalog.releases)
    expect(
      after.catalog.releaseTracks.filter(
        (row) => row.releaseId !== localIds.remaster,
      ),
    ).toEqual(before.catalog.releaseTracks)
    expect(
      after.catalog.releaseTracks.find(
        (row) => row.id === localIds.firstAppearance,
      )?.trackId,
    ).toBe(ids.eclipse)
    expect(after.library.ownedItems.map((item) => item.id)).toEqual([
      localIds.copy,
      localIds.secondCopy,
    ])
    expect(
      after.library.userAlbums.find(
        (entry) => entry.id === libraryIds.historicalEntry,
      )?.deletedAt,
    ).toBe(times.later)
    expect(JSON.stringify(after)).not.toContain(externalIds.recording)
    expect(JSON.stringify(after)).not.toContain(externalIds.release)
  })

  test('un recording compartido entre álbumes usa Tracks locales distintos y conserva sus notas', async () => {
    const { repository } = await seeded()
    const before = await repository.readSnapshot()
    const plan = approvedRemaster()
    const selectedLinks = [
      {
        albumId: ids.album,
        trackId: ids.eclipse,
        recordingMbid: externalIds.recording,
      },
      {
        albumId: ids.otherAlbum,
        trackId: libraryIds.otherTrack,
        recordingMbid: externalIds.recording,
      },
    ]
    plan.change.releases.push({
      id: localIds.otherRelease,
      albumId: ids.otherAlbum,
      format: 'cd',
    })
    plan.change.appearances.push({
      id: localIds.thirdAppearance,
      releaseId: localIds.otherRelease,
      trackId: libraryIds.otherTrack,
      discNumber: 1,
      trackNumber: 1,
      contentRole: 'standard',
    })
    await repository.mutate((snapshot) =>
      appendApprovedChange(snapshot, plan.change),
    )
    const after = await repository.readSnapshot()
    expect(catalogSchema.safeParse(after.catalog).success).toBe(true)
    expect(selectedLinks[0]?.recordingMbid).toBe(
      selectedLinks[1]?.recordingMbid,
    )
    expect(selectedLinks[0]?.trackId).not.toBe(selectedLinks[1]?.trackId)
    expect(after.catalog.tracks).toEqual(before.catalog.tracks)
    expect(after.library).toEqual(before.library)
    expect(
      after.catalog.releaseTracks.find(
        (row) => row.id === localIds.thirdAppearance,
      ),
    ).toMatchObject({ trackId: libraryIds.otherTrack })
  })

  test('rechaza reutilizar una Track en otro álbum y revierte también la edición nueva', async () => {
    const { repository } = await seeded()
    const before = await repository.readSnapshot()
    const plan = approvedRemaster()
    plan.change.releases[0]!.albumId = ids.otherAlbum
    await expect(
      repository.mutate((snapshot) =>
        appendApprovedChange(snapshot, plan.change),
      ),
    ).rejects.toHaveProperty(
      'issues',
      expect.arrayContaining([
        expect.objectContaining({ params: { rule: 'wrong_album' } }),
      ]),
    )
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('reemplazar UUID local por MBID rompe referencias y no reescribe la biblioteca', async () => {
    const { repository } = await seeded()
    const before = await repository.readSnapshot()
    await expect(
      repository.mutate((snapshot) => {
        const track = snapshot.catalog.tracks.find(
          (row) => row.id === ids.eclipse,
        )
        if (!track) throw new Error('Falta la Track ficticia.')
        track.id = externalIds.recording
        return { snapshot, result: undefined }
      }),
    ).rejects.toHaveProperty(
      'issues',
      expect.arrayContaining([
        expect.objectContaining({ params: { rule: 'missing_reference' } }),
      ]),
    )
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('proveniencia extra y posiciones duplicadas no entran en los schemas actuales', async () => {
    const { repository } = await seeded()
    const before = await repository.readSnapshot()
    const plan = approvedRemaster()
    await expect(
      repository.mutate((snapshot) => {
        const externalRelease = {
          ...plan.change.releases[0]!,
          externalIds: plan.source,
        }
        snapshot.catalog.releases.push(externalRelease)
        return { snapshot, result: undefined }
      }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(await repository.readSnapshot()).toEqual(before)
    plan.change.appearances[1]!.trackNumber = 1
    await expect(
      repository.mutate((snapshot) =>
        appendApprovedChange(snapshot, plan.change),
      ),
    ).rejects.toHaveProperty(
      'issues',
      expect.arrayContaining([
        expect.objectContaining({ params: { rule: 'duplicate_position' } }),
      ]),
    )
    expect(await repository.readSnapshot()).toEqual(before)
  })

  test('reordenar una aparición conserva calificaciones y una redirección externa no cambia IDs', async () => {
    const { repository } = await seeded()
    const plan = approvedRemaster()
    await repository.mutate((snapshot) =>
      appendApprovedChange(snapshot, plan.change),
    )
    const before = await repository.readSnapshot()
    plan.source.recordingMbid = externalIds.redirectedRecording
    await repository.mutate((snapshot) => {
      const first = snapshot.catalog.releaseTracks.find(
        (row) => row.id === localIds.firstAppearance,
      )
      const second = snapshot.catalog.releaseTracks.find(
        (row) => row.id === localIds.secondAppearance,
      )
      if (!first || !second) throw new Error('Faltan apariciones ficticias.')
      first.trackNumber = 2
      second.trackNumber = 1
      return { snapshot, result: undefined }
    })
    const after = await repository.readSnapshot()
    expect(after.identity).toEqual(before.identity)
    expect(after.library).toEqual(before.library)
    expect(after.catalog.tracks).toEqual(before.catalog.tracks)
    expect(after.catalog.coreTracks).toEqual(before.catalog.coreTracks)
    expect(
      after.catalog.releaseTracks.find(
        (row) => row.id === localIds.firstAppearance,
      ),
    ).toMatchObject({ trackId: ids.eclipse, trackNumber: 2 })
    expect(plan.selectedTrackId).toBe(ids.eclipse)
    expect(JSON.stringify(after)).not.toContain(externalIds.redirectedRecording)
  })

  test('un fallo de escritura de catálogo aprobado revierte todas las tablas', async () => {
    const { database, repository } = await seeded()
    const before = await repository.readSnapshot()
    const plan = approvedRemaster()
    const failure = vi
      .spyOn(database.releaseTracks, 'bulkPut')
      .mockRejectedValue(
        new DOMException('Quota ficticia', 'QuotaExceededError'),
      )
    await expect(
      repository.mutate((snapshot) =>
        appendApprovedChange(snapshot, plan.change),
      ),
    ).rejects.toMatchObject({ code: 'quota_exceeded' })
    failure.mockRestore()
    expect(await repository.readSnapshot()).toEqual(before)
  })
})
