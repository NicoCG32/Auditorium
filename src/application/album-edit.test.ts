// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, test, vi } from 'vitest'
import { fixtureId } from '../domain/catalog/catalog.fixture'
import type { LocalSnapshot } from '../domain/repositories/local-repository'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import {
  buildAlbumEditExpected,
  sameAlbumEditExpected,
  updateAlbumInputSchema,
} from './album-edit'
import { MusicLibrary } from './music-library'

const databases: AuditoriumDatabase[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of databases) {
    database.close()
    await database.delete()
  }
  databases.length = 0
})
function setup() {
  const database = new AuditoriumDatabase('album-edit', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
  databases.push(database)
  let sequence = 1000
  const repository = new IndexedDbRepository({
    database,
    createId: () => fixtureId(900),
    now: () => new Date('2026-10-17T12:00:00.000Z'),
  })
  const service = new MusicLibrary(repository, {
    createId: () => fixtureId(sequence++),
    now: () => new Date('2026-10-17T13:00:00.000Z'),
  })
  return { database, repository, service }
}
function request(snapshot: LocalSnapshot, albumId: string) {
  const expected = buildAlbumEditExpected(snapshot, albumId)
  const fields = Object.fromEntries(
    Object.entries(expected.album).filter(
      ([key]) => !['id', 'createdBy', 'catalogScope'].includes(key),
    ),
  )
  return updateAlbumInputSchema.parse({
    ...fields,
    albumId,
    expected,
    artists: expected.credits.map((credit) => ({
      artistId: credit.artistId,
      name: expected.artists.find((artist) => artist.id === credit.artistId)!
        .name,
      country: expected.artists.find((artist) => artist.id === credit.artistId)!
        .country,
      role: credit.role,
      creditedAs: credit.creditedAs,
    })),
  })
}
const input = {
  title: 'Horizonte ficticio',
  artists: [{ name: 'Banda de ejemplo', country: 'Chile' }],
  genres: ['Progresivo'],
  catalogReference: {
    provider: 'wikidata',
    entityId: 'Q999999999',
    retrievedAt: '2026-10-16T12:00:00.000Z',
  },
}

test('reutiliza otro artista explícito conservando UUID, datos, álbum ajeno y experiencia', async () => {
  const { repository, service } = setup()
  const first = await service.createAlbum(input)
  const other = await service.createAlbum({
    title: 'Otro Disco',
    artists: [{ name: 'Otra Banda', country: 'Perú' }],
  })
  await service.rateAlbum(first.userAlbum!.id, 1)
  const before = await repository.readSnapshot()
  const selected = other.artists[0]!
  await service.updateAlbum({
    ...request(before, first.album.id),
    artists: [
      {
        artistId: selected.id,
        name: selected.name,
        country: selected.country,
        role: 'primary',
      },
    ],
    reuseArtists: [selected],
  })
  const after = await repository.readSnapshot()
  expect(after.catalog.artists).toEqual(before.catalog.artists)
  expect(
    after.catalog.albumArtists.filter((row) => row.albumId === other.album.id),
  ).toEqual(
    before.catalog.albumArtists.filter((row) => row.albumId === other.album.id),
  )
  expect(
    after.catalog.albumArtists.find((row) => row.albumId === first.album.id)
      ?.artistId,
  ).toBe(selected.id)
  expect(after.library).toEqual(before.library)
  expect(after.catalog.albums[0]).not.toHaveProperty('reuseArtists')
})

test('un artista sugerido cambiado entre ventanas impide sobrescribir o guardar parcialmente', async () => {
  const { repository, service } = setup()
  const first = await service.createAlbum(input)
  const other = await service.createAlbum({
    title: 'Otro Disco',
    artists: [{ name: 'Otra Banda', country: 'Perú' }],
  })
  const selected = other.artists[0]!,
    before = await repository.readSnapshot()
  await repository.mutate((snapshot) => {
    snapshot.catalog.artists.find((row) => row.id === selected.id)!.country =
      'Chile'
    return { snapshot, result: undefined }
  })
  const concurrent = await repository.readSnapshot()
  await expect(
    service.updateAlbum({
      ...request(before, first.album.id),
      title: 'No Guardar',
      artists: [
        {
          artistId: selected.id,
          name: selected.name,
          country: selected.country,
        },
      ],
      reuseArtists: [selected],
    }),
  ).rejects.toMatchObject({ code: 'outdated_album' })
  expect(await repository.readSnapshot()).toEqual(concurrent)
})

test('sin selección comprobable no se puede reutilizar ni modificar un artista ajeno', async () => {
  const { repository, service } = setup()
  const first = await service.createAlbum(input)
  const other = await service.createAlbum({
    title: 'Otro Disco',
    artists: [{ name: 'Otra Banda', country: 'Perú' }],
  })
  const selected = other.artists[0]!,
    before = await repository.readSnapshot()
  const edited = {
    ...request(before, first.album.id),
    artists: [
      { artistId: selected.id, name: selected.name, country: selected.country },
    ],
  }
  await expect(service.updateAlbum(edited)).rejects.toMatchObject({
    code: 'missing_reference',
  })
  await expect(
    service.updateAlbum({
      ...edited,
      artists: [{ ...edited.artists[0]!, country: 'Argentina' }],
      reuseArtists: [selected],
    }),
  ).rejects.toMatchObject({ code: 'outdated_album' })
  expect(await repository.readSnapshot()).toEqual(before)
})

test('capitalizar metadatos históricos conserva identidad, referencia externa y experiencia', async () => {
  const { repository, service } = setup()
  const created = await service.createAlbum(input)
  await service.rateAlbum(created.userAlbum!.id, 8)
  await repository.mutate((snapshot) => {
    snapshot.catalog.albums[0]!.title = 'horizonte ficticio'
    snapshot.catalog.artists[0]!.name = 'banda de ejemplo'
    snapshot.catalog.albumArtists[0]!.creditedAs = 'banda del sur'
    return { snapshot, result: undefined }
  })
  const before = await repository.readSnapshot()
  const edit = request(before, created.album.id)
  await service.updateAlbum({
    ...edit,
    title: 'HORIZONTE   FICTICIO',
    artists: edit.artists.map((artist) => ({
      ...artist,
      name: 'BANDA DE EJEMPLO',
    })),
  })
  const after = await repository.readSnapshot()
  expect(after.catalog.albums[0]).toMatchObject({
    id: created.album.id,
    title: 'Horizonte Ficticio',
    catalogReference: input.catalogReference,
  })
  expect(after.catalog.artists).toHaveLength(1)
  expect(after.catalog.artists[0]).toMatchObject({
    id: created.artists[0]!.id,
    name: 'Banda De Ejemplo',
  })
  expect(after.catalog.albumArtists[0]).toMatchObject({
    artistId: created.artists[0]!.id,
    creditedAs: 'Banda Del Sur',
  })
  expect(after.library).toEqual(before.library)
  await service.updateAlbum(request(after, created.album.id))
  expect((await repository.readSnapshot()).catalog).toEqual(after.catalog)
})

test('registrar con variantes de mayúsculas revisa la coincidencia sin crear otro álbum ni artista', async () => {
  const { repository, service } = setup()
  const created = await service.registerAlbum({
    title: 'álbum de prueba',
    artists: [{ name: 'conjunto del sur' }],
    genres: ['metal progresivo'],
  })
  expect(created.status).toBe('created')
  const before = await repository.readSnapshot()
  expect(before.catalog.albums[0]).toMatchObject({
    title: 'Álbum De Prueba',
    genres: ['Metal Progresivo'],
  })
  expect(before.catalog.artists[0]!.name).toBe('Conjunto Del Sur')
  expect(
    await service.registerAlbum({
      title: 'ÁLBUM DE PRUEBA',
      artists: [{ name: 'Conjunto del SUR' }],
    }),
  ).toMatchObject({
    status: 'review',
    candidates: [{ album: { id: before.catalog.albums[0]!.id } }],
  })
  expect(await repository.readSnapshot()).toEqual(before)
})

test('reutilizar por ID un artista histórico capitaliza su nombre sin crear otra identidad', async () => {
  const { repository, service } = setup()
  const created = await service.createAlbum(input)
  await repository.mutate((snapshot) => {
    snapshot.catalog.artists[0]!.name = 'banda de ejemplo'
    return { snapshot, result: undefined }
  })
  const second = await service.createAlbum({
    title: 'segundo álbum',
    artists: [{ artistId: created.artists[0]!.id }],
  })
  expect(second.artists[0]).toMatchObject({
    id: created.artists[0]!.id,
    name: 'Banda De Ejemplo',
  })
  const after = await repository.readSnapshot()
  expect(after.catalog.artists).toHaveLength(1)
  expect(
    after.catalog.albumArtists.every(
      (credit) => credit.artistId === created.artists[0]!.id,
    ),
  ).toBe(true)
})

test('editar metadatos conserva IDs, biblioteca, valoraciones, pistas, ediciones, ejemplares y deseos', async () => {
  const { repository, service } = setup()
  const created = await service.createAlbum(input)
  const release = await service.addRelease({
    albumId: created.album.id,
    format: 'cd',
  })
  const track = await service.addTrackToRelease({
    releaseId: release.id,
    discNumber: 1,
    trackNumber: 1,
    track: { title: 'Pista ficticia' },
    corePosition: { discNumber: 1, trackNumber: 1 },
  })
  await service.rateAlbum(created.userAlbum!.id, 8)
  await service.rateTrack(created.userAlbum!.id, track.track.id, 7)
  await service.addOwnedItem(created.userAlbum!.id, {
    medium: 'physical',
    format: 'cd',
    releaseId: release.id,
  })
  await service.addPurchaseWish(created.userAlbum!.id, {
    targetFormat: 'vinyl',
  })
  const before = await repository.readSnapshot()
  const edited = await service.updateAlbum({
    ...request(before, created.album.id),
    title: 'Horizonte corregido',
    genres: ['Metal', 'Progresivo'],
    originalYear: 2020,
    coverImage: 'data:image/png;base64,iVBORw0KGgo=',
  })
  const after = await repository.readSnapshot()
  expect(edited.id).toBe(created.album.id)
  expect(edited.genres).toEqual(['Metal', 'Progresivo'])
  expect(edited).not.toHaveProperty('catalogReference')
  expect(after.library).toEqual(before.library)
  for (const table of [
    'tracks',
    'coreTracks',
    'releases',
    'releaseTracks',
  ] as const)
    expect(after.catalog[table]).toEqual(before.catalog[table])
  expect(after.catalog.albumArtists).toEqual(before.catalog.albumArtists)
  expect(after.catalog.artists).toEqual(before.catalog.artists)
})

test('país compartido se actualiza en la identidad existente; corregir nombre crea artista para este álbum', async () => {
  const { repository, service } = setup()
  const first = await service.createAlbum(input)
  const second = await service.createAlbum({
    title: 'Otro álbum',
    artists: [{ artistId: first.artists[0]!.id }],
  })
  let before = await repository.readSnapshot()
  let edit = request(before, first.album.id)
  await service.updateAlbum({
    ...edit,
    artists: [{ ...edit.artists[0]!, country: 'Argentina' }],
  })
  let after = await repository.readSnapshot()
  expect(
    after.catalog.artists.find((artist) => artist.id === first.artists[0]!.id)
      ?.country,
  ).toBe('Argentina')
  expect(
    after.catalog.albumArtists.find(
      (credit) => credit.albumId === second.album.id,
    )?.artistId,
  ).toBe(first.artists[0]!.id)
  expect(
    after.catalog.albums.find((album) => album.id === first.album.id)
      ?.catalogReference,
  ).toEqual(input.catalogReference)
  before = after
  edit = request(before, first.album.id)
  await service.updateAlbum({
    ...edit,
    artists: [{ ...edit.artists[0]!, name: 'Nombre Corregido' }],
  })
  after = await repository.readSnapshot()
  const firstCredit = after.catalog.albumArtists.find(
    (credit) => credit.albumId === first.album.id,
  )!
  expect(firstCredit.artistId).not.toBe(first.artists[0]!.id)
  expect(
    after.catalog.artists.find((artist) => artist.id === firstCredit.artistId)
      ?.name,
  ).toBe('Nombre Corregido')
  expect(
    after.catalog.artists.find((artist) => artist.id === first.artists[0]!.id)
      ?.name,
  ).toBe('Banda De Ejemplo')
  expect(
    after.catalog.albumArtists.find(
      (credit) => credit.albumId === second.album.id,
    )?.artistId,
  ).toBe(first.artists[0]!.id)
})

test('corregir un artista con varios roles conserva una sola identidad en este álbum', async () => {
  const { repository, service } = setup()
  const created = await service.createAlbum(input)
  const shared = await service.createAlbum({
    title: 'Otra obra compartida',
    artists: [{ artistId: created.artists[0]!.id }],
  })
  await repository.mutate((snapshot) => {
    snapshot.catalog.albumArtists.push({
      albumId: created.album.id,
      artistId: created.artists[0]!.id,
      role: 'collaborator',
      position: 2,
    })
    return { snapshot, result: undefined }
  })
  const before = await repository.readSnapshot()
  const edit = request(before, created.album.id)
  await service.updateAlbum({
    ...edit,
    artists: edit.artists.map((artist) => ({
      ...artist,
      name: 'Banda Corregida',
      country: 'Argentina',
    })),
  })
  const after = await repository.readSnapshot()
  const credits = after.catalog.albumArtists
    .filter((credit) => credit.albumId === created.album.id)
    .sort((a, b) => a.position - b.position)
  expect(credits.map((credit) => credit.role)).toEqual([
    'primary',
    'collaborator',
  ])
  expect(new Set(credits.map((credit) => credit.artistId)).size).toBe(1)
  expect(credits[0]!.artistId).not.toBe(created.artists[0]!.id)
  expect(after.catalog.artists).toHaveLength(before.catalog.artists.length + 1)
  expect(
    after.catalog.artists.find((artist) => artist.id === credits[0]!.artistId),
  ).toMatchObject({ name: 'Banda Corregida', country: 'Argentina' })
  expect(
    after.catalog.artists.find(
      (artist) => artist.id === created.artists[0]!.id,
    ),
  ).toEqual(created.artists[0])
  expect(
    after.catalog.albumArtists.find(
      (credit) => credit.albumId === shared.album.id,
    )?.artistId,
  ).toBe(created.artists[0]!.id)
  await service.updateAlbum(request(after, created.album.id))
  expect((await repository.readSnapshot()).catalog).toEqual(after.catalog)
})

test('nombres corregidos iguales no fusionan identidades originales ni un artista nuevo', async () => {
  const { repository, service } = setup()
  const created = await service.createAlbum({
    title: 'Colaboración ficticia',
    artists: [
      { name: 'Primer artista' },
      { name: 'Segundo artista', role: 'featured' },
    ],
  })
  const edit = request(await repository.readSnapshot(), created.album.id)
  await service.updateAlbum({
    ...edit,
    artists: [
      ...edit.artists.map((artist) => ({
        ...artist,
        name: 'Nombre Compartido',
      })),
      { name: 'Nombre Compartido', role: 'collaborator' },
    ],
  })
  const after = await repository.readSnapshot()
  const credits = after.catalog.albumArtists.filter(
    (credit) => credit.albumId === created.album.id,
  )
  expect(new Set(credits.map((credit) => credit.artistId)).size).toBe(3)
  expect(
    after.catalog.artists.filter(
      (artist) => artist.name === 'Nombre Compartido',
    ),
  ).toHaveLength(3)
})

test('créditos repetidos o países contradictorios de una misma identidad se rechazan antes de guardar', async () => {
  const { repository, service } = setup()
  const created = await service.createAlbum(input)
  const before = await repository.readSnapshot()
  const edit = request(before, created.album.id)
  const first = edit.artists[0]!
  for (const second of [
    { ...first },
    { ...first, role: 'featured', country: 'Argentina' },
  ]) {
    const invalid = { ...edit, artists: [first, second] }
    expect(updateAlbumInputSchema.safeParse(invalid).success).toBe(false)
    await expect(service.updateAlbum(invalid)).rejects.toThrow()
    expect(await repository.readSnapshot()).toEqual(before)
  }
})

test('cambios simultáneos de metadatos o país rechazan la copia obsoleta; puntuar no impide editar', async () => {
  const { repository, service } = setup(),
    created = await service.createAlbum(input)
  const before = await repository.readSnapshot(),
    original = request(before, created.album.id)
  await service.rateAlbum(created.userAlbum!.id, 9)
  await service.updateAlbum({ ...original, description: 'Descripción actual' })
  const after = await repository.readSnapshot()
  await expect(
    service.updateAlbum({ ...original, title: 'Datos obsoletos' }),
  ).rejects.toMatchObject({ code: 'outdated_album' })
  expect(await repository.readSnapshot()).toEqual(after)
  const expected = buildAlbumEditExpected(after, created.album.id)
  expect(
    sameAlbumEditExpected(expected, {
      ...expected,
      artists: [...expected.artists].reverse(),
      credits: [...expected.credits].reverse(),
    }),
  ).toBe(true)
})

test('fallo de escritura revierte artista y álbum y permite reintentar el mismo formulario', async () => {
  const { database, repository, service } = setup(),
    created = await service.createAlbum(input)
  const before = await repository.readSnapshot(),
    edit = request(before, created.album.id)
  const fail = vi
    .spyOn(database.albums, 'bulkPut')
    .mockRejectedValueOnce(
      new DOMException('Fallo ficticio', 'QuotaExceededError'),
    )
  const changed = {
    ...edit,
    title: 'Título Corregido',
    artists: [{ ...edit.artists[0]!, country: 'Argentina' }],
  }
  await expect(service.updateAlbum(changed)).rejects.toMatchObject({
    code: 'quota_exceeded',
  })
  expect(await repository.readSnapshot()).toEqual(before)
  fail.mockRestore()
  await expect(service.updateAlbum(changed)).resolves.toMatchObject({
    title: 'Título Corregido',
  })
})

test('retirados, artista ajeno y créditos sin principal se rechazan sin mutar', async () => {
  const { repository, service } = setup(),
    created = await service.createAlbum(input)
  const before = await repository.readSnapshot(),
    edit = request(before, created.album.id)
  await expect(
    service.updateAlbum({
      ...edit,
      artists: [{ ...edit.artists[0]!, artistId: fixtureId(999) }],
    }),
  ).rejects.toMatchObject({ code: 'missing_reference' })
  await expect(
    service.updateAlbum({
      ...edit,
      artists: [{ ...edit.artists[0]!, role: 'featured' }],
    }),
  ).rejects.toThrow()
  expect(await repository.readSnapshot()).toEqual(before)
  await repository.mutate((snapshot) => {
    snapshot.library.userAlbums[0]!.deletedAt = '2026-10-17T14:00:00.000Z'
    snapshot.library.userAlbums[0]!.updatedAt = '2026-10-17T14:00:00.000Z'
    return { snapshot, result: undefined }
  })
  const removed = await repository.readSnapshot()
  await expect(service.updateAlbum(edit)).rejects.toMatchObject({
    code: 'missing_reference',
  })
  expect(await repository.readSnapshot()).toEqual(removed)
})

test('pueden quitarse metadatos opcionales y una portada sin alterar el catálogo restante', async () => {
  const { repository, service } = setup(),
    created = await service.createAlbum({
      ...input,
      coverUrl: 'https://example.invalid/cover.png',
    })
  const edit = request(await repository.readSnapshot(), created.album.id)
  const remaining = { ...edit }
  delete remaining.coverUrl
  delete remaining.genres
  delete remaining.catalogReference
  const updated = await service.updateAlbum({
    ...remaining,
    artists: [{ ...edit.artists[0]!, country: undefined }],
  })
  expect(updated).not.toHaveProperty('coverUrl')
  expect(updated).not.toHaveProperty('genres')
  expect(updated).not.toHaveProperty('catalogReference')
  expect(
    (await repository.readSnapshot()).catalog.artists[0],
  ).not.toHaveProperty('country')
})
