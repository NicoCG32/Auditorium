// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { createLibrarySchema } from '../domain/library/library'
import {
  libraryIds,
  makeContext,
  makeLibrary,
  times,
} from '../domain/library/library.fixture'
import type { LocalSnapshot } from '../domain/repositories/local-repository'
import {
  defaultLibraryFilters,
  projectLibrary,
  queryLibrary,
  type LibraryOrder,
  type RatingFilter,
} from './library-query'

function snapshot(): LocalSnapshot {
  const context = makeContext()
  const library = createLibrarySchema(context).parse(makeLibrary())
  return {
    identity: { userId: libraryIds.user, createdAt: times.added },
    catalog: context.catalog,
    library,
  }
}

describe('proyección de biblioteca', () => {
  test('solo entradas activas; catálogo y históricos no se convierten en biblioteca', () => {
    const data = snapshot()
    data.catalog.albums.push({
      id: fixtureId(800),
      title: 'Solo catálogo',
      catalogScope: 'personal',
      releaseType: 'album',
    })
    data.catalog.albumArtists.push({
      albumId: fixtureId(800),
      artistId: ids.artist,
      role: 'primary',
      position: 1,
    })
    data.library.userAlbums = data.library.userAlbums.map((entry) =>
      entry.id === libraryIds.otherEntry
        ? { ...entry, deletedAt: times.updated }
        : entry,
    )
    const albums = projectLibrary(data)
    expect(albums).toHaveLength(1)
    expect(albums[0]).toMatchObject({
      id: libraryIds.entry,
      albumId: ids.album,
      title: 'Eclipse',
      artist: 'Umbral Eléctrico',
      score: 9.5,
      listeningStatus: 'queued',
      originalYear: 1998,
    })
  })
  test('nota ausente no se inventa ni se calcula desde pistas', () => {
    const data = snapshot()
    data.library.albumRatings = []
    expect(
      projectLibrary(data).every((album) => album.score === undefined),
    ).toBe(true)
    expect(data.library.trackRatings).toHaveLength(3)
  })
  test('ordena créditos y permite buscar nombre real y acreditado', () => {
    const data = snapshot()
    data.catalog.artists.push({
      id: ids.collaborator,
      name: 'Luz del Umbral',
      catalogScope: 'personal',
    })
    data.catalog.albumArtists.unshift({
      albumId: ids.album,
      artistId: ids.collaborator,
      role: 'featured',
      position: 2,
      creditedAs: 'LUZ',
    })
    const albums = projectLibrary(data)
    expect(albums.find((album) => album.albumId === ids.album)?.artist).toBe(
      'Umbral Eléctrico · LUZ',
    )
    expect(
      queryLibrary(albums, {
        ...defaultLibraryFilters,
        search: 'luz del umbral eclipse',
      }).map((album) => album.albumId),
    ).toEqual([ids.album])
  })
})

describe('búsqueda, filtros y orden', () => {
  test.each(['ECLIPSE', 'umbral electrico ECLIPSE', '  éléctrico   eclipse  '])(
    'busca %s sin acentos ni dependencia de mayúsculas',
    (search) => {
      expect(
        queryLibrary(projectLibrary(snapshot()), {
          ...defaultLibraryFilters,
          search,
        }).map((album) => album.albumId),
      ).toEqual([ids.album])
    },
  )
  test('combina búsqueda, escucha y nota sin alterar datos', () => {
    const albums = projectLibrary(snapshot()),
      before = structuredClone(albums)
    expect(
      queryLibrary(albums, {
        search: 'umbral',
        listening: 'queued',
        rating: 'high',
        order: 'title',
      }).map((album) => album.albumId),
    ).toEqual([ids.album])
    expect(
      queryLibrary(albums, {
        ...defaultLibraryFilters,
        listening: 'completed',
        search: 'eclipse',
      }),
    ).toEqual([])
    expect(albums).toEqual(before)
  })
  test.each<[RatingFilter, number]>([
    ['all', 2],
    ['unrated', 1],
    ['rated', 1],
    ['high', 1],
  ])('filtro %s distingue una nota ausente', (rating, count) => {
    const data = snapshot()
    data.library.albumRatings = data.library.albumRatings.filter(
      (row) => row.userAlbumId === libraryIds.entry,
    )
    expect(
      queryLibrary(projectLibrary(data), { ...defaultLibraryFilters, rating }),
    ).toHaveLength(count)
  })
  test('el umbral incluye 8 y excluye 7,5', () => {
    const data = snapshot()
    data.library.albumRatings = data.library.albumRatings.map((row) => ({
      ...row,
      scoreUnits: row.userAlbumId === libraryIds.entry ? 15 : 16,
    }))
    expect(
      queryLibrary(projectLibrary(data), {
        ...defaultLibraryFilters,
        rating: 'high',
      }).map((album) => album.id),
    ).toEqual([libraryIds.otherEntry])
  })
  test.each<[LibraryOrder, string[]]>([
    ['added', [libraryIds.otherEntry, libraryIds.entry]],
    ['title', [libraryIds.entry, libraryIds.otherEntry]],
    ['artist', [libraryIds.otherEntry, libraryIds.entry]],
    ['rating', [libraryIds.entry, libraryIds.otherEntry]],
  ])('orden %s con desempate estable', (order, expected) => {
    const albums = projectLibrary(snapshot()).map((album) =>
      album.id === libraryIds.otherEntry
        ? { ...album, artist: 'Alba ficticia', addedAt: times.later }
        : album,
    )
    expect(
      queryLibrary(albums, { ...defaultLibraryFilters, order }).map(
        (album) => album.id,
      ),
    ).toEqual(expected)
  })
  test('mayor nota sitúa sin nota al final y no cambia el orden de origen', () => {
    const albums = projectLibrary(snapshot())
    delete albums[0]?.score
    const before = structuredClone(albums)
    expect(
      queryLibrary(albums, { ...defaultLibraryFilters, order: 'rating' })[0]
        ?.id,
    ).toBe(libraryIds.otherEntry)
    expect(albums).toEqual(before)
  })
})
