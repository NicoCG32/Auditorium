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
  libraryFilterOptions,
  projectLibrary,
  projectRemovedAlbums,
  queryLibrary,
  type LibraryAlbum,
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
  test('proyecta géneros, portadas y todos los países de los artistas acreditados', () => {
    const data = snapshot()
    Object.assign(data.catalog.albums[0]!, {
      genres: ['  Metal progresivo ', 'MÉTAL progresivo', 'Jazz'],
      coverUrl: 'https://example.org/portada.png',
      coverImage: 'data:image/png;base64,aW1hZ2Vu',
    })
    data.catalog.artists[0]!.country = '  Chile '
    data.catalog.artists.push({
      id: ids.collaborator,
      name: 'Luz ficticia',
      country: 'CHÍLE',
      catalogScope: 'personal',
    })
    data.catalog.artists.push({
      id: fixtureId(42),
      name: 'Artista invitado',
      country: 'España',
      catalogScope: 'personal',
    })
    data.catalog.albumArtists.push(
      {
        albumId: ids.album,
        artistId: ids.collaborator,
        role: 'collaborator',
        position: 2,
      },
      {
        albumId: ids.album,
        artistId: fixtureId(42),
        role: 'featured',
        position: 3,
      },
    )
    const before = structuredClone(data)
    const albums = projectLibrary(data)
    expect(albums[0]).toMatchObject({
      genres: ['Jazz', 'Metal progresivo'],
      countries: ['Chile', 'España'],
      coverUrl: 'https://example.org/portada.png',
      coverImage: 'data:image/png;base64,aW1hZ2Vu',
    })
    expect(
      queryLibrary(albums, {
        ...defaultLibraryFilters,
        search: 'metal espana',
      }).map((album) => album.id),
    ).toEqual([libraryIds.entry])
    expect(data).toEqual(before)
  })
  test('datos opcionales ausentes conservan la proyección anterior', () => {
    const [album] = projectLibrary(snapshot())
    expect(album).not.toHaveProperty('genres')
    expect(album).not.toHaveProperty('countries')
    expect(album).not.toHaveProperty('coverUrl')
    expect(album).not.toHaveProperty('coverImage')
  })
  test('las opciones activas no incorporan géneros ni países de álbumes retirados', () => {
    const data = snapshot()
    data.catalog.albums[0]!.genres = ['Jazz']
    data.catalog.albums[1]!.genres = ['Rock']
    data.catalog.artists.push({
      id: ids.collaborator,
      name: 'Artista retirado',
      country: 'Perú',
      catalogScope: 'personal',
    })
    data.catalog.albumArtists[1]!.artistId = ids.collaborator
    data.library.userAlbums[1]!.deletedAt = times.updated
    expect(libraryFilterOptions(projectLibrary(data))).toEqual({
      genres: [{ value: 'jazz', label: 'Jazz' }],
      countries: [],
    })
    expect(projectRemovedAlbums(data)[0]).toMatchObject({
      genres: ['Rock'],
      countries: ['Perú'],
    })
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
  test('combina género y país con escucha, nota y búsqueda sin exigir datos nuevos', () => {
    const albums = projectLibrary(snapshot())
    Object.assign(albums[0]!, {
      genres: ['Metal progresivo', 'Rock'],
      countries: ['Chile', 'España'],
    })
    Object.assign(albums[1]!, { genres: ['Rock'], countries: ['Chile'] })
    const before = structuredClone(albums)
    expect(
      queryLibrary(albums, {
        search: 'eclipse',
        listening: 'queued',
        rating: 'high',
        order: 'title',
        genre: '  MÉTAL   progresivo  ',
        country: 'ESPANA',
      }).map((album) => album.id),
    ).toEqual([libraryIds.entry])
    expect(
      queryLibrary(albums, {
        ...defaultLibraryFilters,
        genre: 'rock',
        country: 'peru',
      }),
    ).toEqual([])
    expect(
      queryLibrary(projectLibrary(snapshot()), {
        ...defaultLibraryFilters,
        genre: 'rock',
      }),
    ).toEqual([])
    expect(albums).toEqual(before)
  })
  test('las opciones agrupan alias de acentos, mayúsculas y espacios manteniendo etiquetas', () => {
    const albums = projectLibrary(snapshot())
    Object.assign(albums[0]!, {
      genres: ['  Metal progresivo  ', 'Jazz'],
      countries: ['España'],
    })
    Object.assign(albums[1]!, {
      genres: ['MÉTAL   PROGRESIVO', 'Rock'],
      countries: [' espana ', 'Chile'],
    })
    const before = structuredClone(albums)
    expect(libraryFilterOptions(albums)).toEqual({
      genres: [
        { value: 'jazz', label: 'Jazz' },
        { value: 'metal progresivo', label: 'Metal progresivo' },
        { value: 'rock', label: 'Rock' },
      ],
      countries: [
        { value: 'chile', label: 'Chile' },
        { value: 'espana', label: 'España' },
      ],
    })
    expect(albums).toEqual(before)
  })
  test.each<['genre' | 'country', 'genres' | 'countries']>([
    ['genre', 'genres'],
    ['country', 'countries'],
  ])(
    'ordena por %s con vacíos al final y desempate de título',
    (order, field) => {
      const base = projectLibrary(snapshot())[0]!
      const row = (
        id: string,
        title: string,
        labels?: string[],
      ): LibraryAlbum => ({
        ...base,
        id,
        title,
        ...(labels ? { [field]: labels } : {}),
      })
      const albums = [
        row('missing', 'Sin datos'),
        row('b', 'Segundo', ['Zulu']),
        row('empty', 'Vacío', []),
        row('a2', 'Beta', ['Álfa']),
        row('a1', 'Alba', ['alfa']),
      ]
      const before = structuredClone(albums)
      expect(
        queryLibrary(albums, { ...defaultLibraryFilters, order }).map(
          (album) => album.id,
        ),
      ).toEqual(['a1', 'a2', 'b', 'missing', 'empty'])
      expect(albums).toEqual(before)
    },
  )
})
