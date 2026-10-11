// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { catalogSchema } from './catalog'
import { fixtureId, ids, makeCatalog } from './catalog.fixture'
import { getCatalogIssues, type CatalogRule } from './integrity'
import {
  albumSchema,
  artistSchema,
  coreTrackSchema,
  releaseSchema,
  releaseTrackSchema,
  trackSchema,
  type CatalogInput,
} from './schemas'

function expectRule(input: CatalogInput, rule: CatalogRule) {
  const result = catalogSchema.safeParse(input)
  expect(result.success).toBe(false)
  if (result.success) throw new Error('Se esperaba un catálogo inválido.')
  expect(result.error.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'custom', params: { rule } }),
    ]),
  )
  return result.error.issues
}

function addOtherAlbum(input: CatalogInput) {
  input.albums.push({ id: ids.otherAlbum, title: 'Otra órbita' })
  input.albumArtists.push({
    albumId: ids.otherAlbum,
    artistId: ids.artist,
    role: 'primary',
    position: 1,
  })
}

describe('catálogo original y Deluxe', () => {
  test('comparte identidad de álbum y pistas; conserva una variante y un bonus propios', () => {
    const catalog = catalogSchema.parse(makeCatalog())
    expect(catalog.albums).toHaveLength(1)
    expect(catalog.releases.map((release) => release.albumId)).toEqual([
      ids.album,
      ids.album,
    ])
    const original = catalog.releaseTracks.filter(
      (row) => row.releaseId === ids.original,
    )
    const deluxe = catalog.releaseTracks.filter(
      (row) => row.releaseId === ids.deluxe,
    )
    expect(deluxe.slice(0, 3).map((row) => row.trackId)).toEqual(
      original.map((row) => row.trackId),
    )
    expect(deluxe.at(-1)).toMatchObject({
      trackId: ids.demo,
      contentRole: 'bonus',
    })
    expect(catalog.tracks.find((track) => track.id === ids.demo)).toMatchObject(
      {
        variantOfTrackId: ids.eclipse,
      },
    )
  })

  test('cambiar el orden Deluxe conserva el original y no muta la entrada', () => {
    const input = makeCatalog()
    const before = structuredClone(input)
    const parsed = catalogSchema.parse(input)
    const deluxe = parsed.releaseTracks.filter(
      (row) => row.releaseId === ids.deluxe,
    )
    deluxe.forEach((row) => {
      row.trackNumber = 5 - row.trackNumber
    })
    const changed = catalogSchema.parse(parsed)
    expect(changed.coreTracks).toEqual(before.coreTracks)
    expect(
      changed.releaseTracks.filter((row) => row.releaseId === ids.original),
    ).toEqual(
      catalogSchema
        .parse(before)
        .releaseTracks.filter((row) => row.releaseId === ids.original),
    )
    expect(input).toEqual(before)
  })

  test('admite listas incompletas y metadatos opcionales ausentes', () => {
    const input = makeCatalog()
    input.albums = [{ id: ids.album, title: 'Eclipse' }]
    input.releases = [{ id: ids.original, albumId: ids.album, format: 'cd' }]
    input.tracks = []
    input.coreTracks = []
    input.releaseTracks = []
    const catalog = catalogSchema.parse(input)
    expect(catalog.albums[0]).toEqual({
      id: ids.album,
      title: 'Eclipse',
      releaseType: 'album',
      catalogScope: 'personal',
    })
    expect(catalog.releases[0]).not.toHaveProperty('releaseYear')
  })

  test('no fusiona artistas ni álbumes homónimos', () => {
    const input = makeCatalog()
    input.artists.push({ id: ids.collaborator, name: 'Umbral Eléctrico' })
    input.albums.push({ id: ids.otherAlbum, title: 'Eclipse' })
    input.albumArtists.push({
      albumId: ids.otherAlbum,
      artistId: ids.collaborator,
      role: 'primary',
      position: 1,
    })
    const catalog = catalogSchema.parse(input)
    expect(catalog.artists).toHaveLength(2)
    expect(catalog.albums).toHaveLength(2)
  })

  test('una pista se puede repetir en posiciones distintas de una edición', () => {
    const input = makeCatalog()
    input.releaseTracks.push({
      id: fixtureId(300),
      releaseId: ids.original,
      trackId: ids.eclipse,
      discNumber: 2,
      trackNumber: 1,
      contentRole: 'bonus',
    })
    expect(catalogSchema.safeParse(input).success).toBe(true)
  })

  test('acepta catálogo vacío sin inventar entidades', () => {
    expect(
      catalogSchema.parse({
        artists: [],
        albums: [],
        albumArtists: [],
        tracks: [],
        coreTracks: [],
        releases: [],
        releaseTracks: [],
      }),
    ).toEqual({
      artists: [],
      albums: [],
      albumArtists: [],
      tracks: [],
      coreTracks: [],
      releases: [],
      releaseTracks: [],
    })
  })
})

describe('créditos e identidades', () => {
  test('acepta varios artistas principales y colaboradores', () => {
    const input = makeCatalog()
    input.artists.push({ id: ids.collaborator, name: 'Luz del Umbral' })
    input.albumArtists.push({
      albumId: ids.album,
      artistId: ids.collaborator,
      role: 'primary',
      position: 2,
    })
    expect(catalogSchema.safeParse(input).success).toBe(true)
    input.albumArtists[1] = {
      albumId: ids.album,
      artistId: ids.collaborator,
      role: 'collaborator',
      position: 2,
    }
    expect(catalogSchema.safeParse(input).success).toBe(true)
  })

  test('requiere un artista principal existente', () => {
    const input = makeCatalog()
    input.albumArtists = []
    expectRule(input, 'missing_primary_artist')
    input.albumArtists = [
      {
        albumId: ids.album,
        artistId: ids.artist,
        role: 'featured',
        position: 1,
      },
    ]
    expectRule(input, 'missing_primary_artist')
    input.albumArtists[0] = {
      albumId: ids.album,
      artistId: ids.missing,
      role: 'primary',
      position: 1,
    }
    expectRule(input, 'missing_reference')
    expectRule(input, 'missing_primary_artist')
  })

  test('rechaza créditos y posiciones duplicados', () => {
    const input = makeCatalog()
    input.albumArtists.push({
      albumId: ids.album,
      artistId: ids.artist,
      role: 'primary',
      position: 2,
    })
    expectRule(input, 'duplicate_credit')
    input.albumArtists[1] = {
      albumId: ids.album,
      artistId: ids.artist,
      role: 'collaborator',
      position: 1,
    }
    expectRule(input, 'duplicate_position')
  })

  test.each([
    'artists',
    'albums',
    'tracks',
    'releases',
    'releaseTracks',
  ] as const)('rechaza ID duplicado en %s', (table) => {
    const input = makeCatalog()
    // El dato inválido conserva el tipo de la tabla, sin mezclar entidades.
    if (table === 'artists')
      input.artists.push(artistSchema.parse(input.artists[0]))
    if (table === 'albums')
      input.albums.push(albumSchema.parse(input.albums[0]))
    if (table === 'tracks')
      input.tracks.push(trackSchema.parse(input.tracks[0]))
    if (table === 'releases')
      input.releases.push(releaseSchema.parse(input.releases[0]))
    if (table === 'releaseTracks')
      input.releaseTracks.push(releaseTrackSchema.parse(input.releaseTracks[0]))
    expectRule(input, 'duplicate_id')
  })

  test('normaliza UUID y espacios sin perder acentos ni capitalización', () => {
    const artist = artistSchema.parse({
      id: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
      name: '  Umbral Eléctrico  ',
    })
    expect(artist.id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(artist.name).toBe('Umbral Eléctrico')
    const input = makeCatalog()
    input.artists = [artist, { ...artist, id: artist.id.toUpperCase() }]
    input.albumArtists = [
      {
        albumId: ids.album,
        artistId: artist.id.toUpperCase(),
        role: 'primary',
        position: 1,
      },
    ]
    expectRule(input, 'duplicate_id')
  })
})

describe('referencias y listas', () => {
  test.each([
    'creditAlbum',
    'creditArtist',
    'trackAlbum',
    'releaseAlbum',
    'coreAlbum',
    'coreTrack',
    'releaseRowRelease',
    'releaseRowTrack',
    'variant',
  ] as const)('rechaza referencia ausente: %s', (reference) => {
    const input = makeCatalog()
    if (reference === 'creditAlbum')
      input.albumArtists[0] = {
        albumId: ids.missing,
        artistId: ids.artist,
        role: 'primary',
        position: 1,
      }
    if (reference === 'creditArtist')
      input.albumArtists[0] = {
        albumId: ids.album,
        artistId: ids.missing,
        role: 'primary',
        position: 1,
      }
    if (reference === 'trackAlbum')
      input.tracks.push({
        id: fixtureId(301),
        albumId: ids.missing,
        title: 'Sin álbum',
      })
    if (reference === 'releaseAlbum')
      input.releases.push({
        id: fixtureId(302),
        albumId: ids.missing,
        format: 'digital',
      })
    if (reference === 'coreAlbum')
      input.coreTracks.push({
        albumId: ids.missing,
        trackId: ids.eclipse,
        discNumber: 1,
        trackNumber: 1,
      })
    if (reference === 'coreTrack')
      input.coreTracks.push({
        albumId: ids.album,
        trackId: ids.missing,
        discNumber: 2,
        trackNumber: 1,
      })
    if (reference === 'releaseRowRelease')
      input.releaseTracks.push({
        id: fixtureId(303),
        releaseId: ids.missing,
        trackId: ids.eclipse,
        discNumber: 1,
        trackNumber: 1,
      })
    if (reference === 'releaseRowTrack')
      input.releaseTracks.push({
        id: fixtureId(303),
        releaseId: ids.original,
        trackId: ids.missing,
        discNumber: 2,
        trackNumber: 1,
      })
    if (reference === 'variant')
      input.tracks.push({
        id: fixtureId(304),
        albumId: ids.album,
        title: 'Sin original',
        variantOfTrackId: ids.missing,
      })
    expectRule(input, 'missing_reference')
  })

  test('rechaza pistas de otro álbum en original, edición y variante', () => {
    const input = makeCatalog()
    addOtherAlbum(input)
    const foreign = fixtureId(310)
    input.tracks.push({
      id: foreign,
      albumId: ids.otherAlbum,
      title: 'Pista ajena',
    })
    input.coreTracks.push({
      albumId: ids.album,
      trackId: foreign,
      discNumber: 2,
      trackNumber: 1,
    })
    input.releaseTracks.push({
      id: fixtureId(311),
      releaseId: ids.original,
      trackId: foreign,
      discNumber: 2,
      trackNumber: 1,
    })
    input.tracks.push({
      id: fixtureId(312),
      albumId: ids.album,
      title: 'Variante ajena',
      variantOfTrackId: foreign,
    })
    const errors = expectRule(input, 'wrong_album')
    expect(
      errors.filter(
        (issue) =>
          issue.code === 'custom' && issue.params?.rule === 'wrong_album',
      ),
    ).toHaveLength(3)
  })

  test('rechaza posiciones ocupadas en cada lista y señala el dato inválido', () => {
    const input = makeCatalog()
    input.coreTracks.push({
      albumId: ids.album,
      trackId: ids.demo,
      discNumber: 1,
      trackNumber: 1,
    })
    expect(expectRule(input, 'duplicate_position')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['coreTracks', 3] }),
      ]),
    )
    input.coreTracks.pop()
    input.releaseTracks.push({
      id: fixtureId(313),
      releaseId: ids.original,
      trackId: ids.demo,
      discNumber: 1,
      trackNumber: 1,
    })
    expectRule(input, 'duplicate_position')
  })
})

describe('variantes', () => {
  test('señala un miembro del ciclo cuando una cadena externa llega a él', () => {
    const input = makeCatalog()
    input.tracks = [
      {
        id: ids.overture,
        albumId: ids.album,
        title: 'Entrada',
        variantOfTrackId: ids.eclipse,
      },
      {
        id: ids.eclipse,
        albumId: ids.album,
        title: 'Eclipse',
        variantOfTrackId: ids.ashes,
      },
      {
        id: ids.ashes,
        albumId: ids.album,
        title: 'Ashes',
        variantOfTrackId: ids.eclipse,
      },
      {
        id: ids.demo,
        albumId: ids.album,
        title: 'Demo',
        variantOfTrackId: ids.eclipse,
      },
    ]
    const issues = expectRule(input, 'cyclic_variant')
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['tracks', 1, 'variantOfTrackId'] }),
      ]),
    )
  })
  test('rechaza autociclos y ciclos indirectos', () => {
    const input = makeCatalog()
    input.tracks[3] = {
      id: ids.demo,
      albumId: ids.album,
      title: 'Demo',
      variantOfTrackId: ids.demo,
    }
    expectRule(input, 'cyclic_variant')
    input.tracks[3] = {
      id: ids.demo,
      albumId: ids.album,
      title: 'Demo',
      variantOfTrackId: ids.eclipse,
    }
    input.tracks[1] = {
      id: ids.eclipse,
      albumId: ids.album,
      title: 'Eclipse',
      variantOfTrackId: ids.demo,
    }
    expectRule(input, 'cyclic_variant')
  })

  test('procesa cadenas largas de forma iterativa y detecta un ciclo al final', () => {
    const input = makeCatalog()
    const count = 2000
    input.tracks.push(
      ...Array.from({ length: count }, (_, index) => ({
        id: fixtureId(1000 + index),
        albumId: ids.album,
        title: `Variante ${index + 1}`,
        variantOfTrackId:
          index === count - 1 ? ids.eclipse : fixtureId(1001 + index),
      })),
    )
    expect(catalogSchema.safeParse(input).success).toBe(true)
    input.tracks[input.tracks.length - 1] = {
      id: fixtureId(1000 + count - 1),
      albumId: ids.album,
      title: 'Cierre',
      variantOfTrackId: fixtureId(1000),
    }
    expectRule(input, 'cyclic_variant')
  })

  test('la comprobación de referencias no modifica el catálogo', () => {
    const catalog = catalogSchema.parse(makeCatalog())
    const before = structuredClone(catalog)
    expect(getCatalogIssues(catalog)).toEqual([])
    expect(catalog).toEqual(before)
  })
})

describe('entradas estructurales', () => {
  test.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rechaza posición inválida %s',
    (value) => {
      expect(
        coreTrackSchema.safeParse({
          albumId: ids.album,
          trackId: ids.eclipse,
          discNumber: value,
          trackNumber: 1,
        }).success,
      ).toBe(false)
      expect(
        releaseTrackSchema.safeParse({
          id: fixtureId(400),
          releaseId: ids.original,
          trackId: ids.eclipse,
          discNumber: 1,
          trackNumber: value,
        }).success,
      ).toBe(false)
    },
  )

  test.each(['', ' ', '\t\n'])(
    'rechaza nombres y títulos en blanco %j',
    (value) => {
      expect(
        artistSchema.safeParse({ id: ids.artist, name: value }).success,
      ).toBe(false)
      expect(
        albumSchema.safeParse({ id: ids.album, title: value }).success,
      ).toBe(false)
      expect(
        trackSchema.safeParse({
          id: ids.eclipse,
          albumId: ids.album,
          title: value,
        }).success,
      ).toBe(false)
    },
  )

  test.each([0, -1, 1998.5, 10000, NaN, Infinity])(
    'rechaza año inválido %s',
    (value) => {
      expect(
        albumSchema.safeParse({
          id: ids.album,
          title: 'Eclipse',
          originalYear: value,
        }).success,
      ).toBe(false)
    },
  )

  test('rechaza UUID, enums, duración, portada y campos no admitidos', () => {
    expect(
      artistSchema.safeParse({ id: 'invalid', name: 'Umbral' }).success,
    ).toBe(false)
    expect(
      albumSchema.safeParse({
        id: ids.album,
        title: 'Eclipse',
        releaseType: 'deluxe',
      }).success,
    ).toBe(false)
    expect(
      releaseSchema.safeParse({
        id: ids.original,
        albumId: ids.album,
        format: 'streaming',
      }).success,
    ).toBe(false)
    expect(
      trackSchema.safeParse({
        id: ids.eclipse,
        albumId: ids.album,
        title: 'Eclipse',
        referenceDurationMs: 0,
      }).success,
    ).toBe(false)
    expect(
      albumSchema.safeParse({
        id: ids.album,
        title: 'Eclipse',
        coverUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false)
    expect(
      albumSchema.safeParse({
        id: ids.album,
        title: 'Eclipse',
        coverUrl: 'https://example.org/cover.png',
      }).success,
    ).toBe(true)
    expect(
      albumSchema.safeParse({ id: ids.album, title: 'Eclipse', owned: true })
        .success,
    ).toBe(false)
    expect(
      albumSchema.safeParse({
        id: ids.album,
        title: 'Eclipse',
        catalogScope: 'shared',
      }).success,
    ).toBe(false)
    expect(
      albumSchema.safeParse({
        id: ids.album,
        title: 'Eclipse',
        originalYear: null,
      }).success,
    ).toBe(false)
  })
})
