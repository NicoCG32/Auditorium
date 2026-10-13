// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { ids } from '../catalog/catalog.fixture'
import { utcTimestampSchema } from '../shared/scalars'
import { getLibraryIssues, type LibraryRule } from './integrity'
import {
  applyLibraryChange,
  createLibrarySchema,
  LibraryChangeError,
} from './library'
import { libraryIds, makeContext, makeLibrary, times } from './library.fixture'
import { scoreToUnits, unitsToScore } from './scores'
import {
  albumRatingSchema,
  trackRatingSchema,
  userAlbumSchema,
  type LibraryInput,
  type LibraryChange,
  listeningStatusSchema,
} from './schemas'

describe('experiencia personal independiente', () => {
  test.each(
    listeningStatusSchema.options.flatMap((from) =>
      listeningStatusSchema.options.map((to) => [from, to] as const),
    ),
  )('transición directa %s a %s conserva calificaciones', (from, to) => {
    const original = makeLibrary()
    original.userAlbums = original.userAlbums.map((entry) =>
      entry.id === libraryIds.entry
        ? { ...entry, listeningStatus: from }
        : entry,
    )
    const before = structuredClone(original)
    const result = applyLibraryChange(makeContext(), original, {
      type: 'set_personal_experience',
      userAlbumId: libraryIds.entry,
      listeningStatus: to,
      personalNotes: '  Impresión ficticia.\nSegunda línea.  ',
      updatedAt: times.later,
    })
    expect(
      result.userAlbums.find((entry) => entry.id === libraryIds.entry),
    ).toMatchObject({
      listeningStatus: to,
      personalNotes: '  Impresión ficticia.\nSegunda línea.  ',
      updatedAt: times.later,
    })
    expect(result.albumRatings).toEqual(before.albumRatings)
    expect(result.trackRatings).toEqual(before.trackRatings)
    expect(
      result.userAlbums.find((entry) => entry.id === libraryIds.otherEntry),
    ).toEqual(
      before.userAlbums.find((entry) => entry.id === libraryIds.otherEntry),
    )
    expect(original).toEqual(before)
  })
  test('omitir notas elimina exclusivamente el comentario personal', () => {
    const original = makeLibrary()
    const result = applyLibraryChange(makeContext(), original, {
      type: 'set_personal_experience',
      userAlbumId: libraryIds.entry,
      listeningStatus: 'queued',
      updatedAt: times.later,
    })
    expect(
      result.userAlbums.find((entry) => entry.id === libraryIds.entry),
    ).not.toHaveProperty('personalNotes')
    expect(result.albumRatings).toEqual(original.albumRatings)
    expect(result.trackRatings).toEqual(original.trackRatings)
  })
  test('rechaza escritura desactualizada o entrada inactiva sin modificar la biblioteca', () => {
    const original = makeLibrary(),
      before = structuredClone(original)
    expect(() =>
      applyLibraryChange(makeContext(), original, {
        type: 'set_personal_experience',
        userAlbumId: libraryIds.entry,
        listeningStatus: 'completed',
        updatedAt: times.earlier,
      }),
    ).toThrow(LibraryChangeError)
    const historical = structuredClone(original)
    historical.userAlbums = historical.userAlbums.map((entry) =>
      entry.id === libraryIds.entry
        ? { ...entry, deletedAt: times.updated }
        : entry,
    )
    expect(() =>
      applyLibraryChange(makeContext(), historical, {
        type: 'set_personal_experience',
        userAlbumId: libraryIds.entry,
        listeningStatus: 'completed',
        updatedAt: times.later,
      }),
    ).toThrow(LibraryChangeError)
    expect(original).toEqual(before)
  })
})

function expectRule(input: LibraryInput, rule: LibraryRule) {
  const result = createLibrarySchema(makeContext()).safeParse(input)
  expect(result.success).toBe(false)
  if (result.success) throw new Error('Se esperaba una biblioteca inválida.')
  expect(result.error.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'custom', params: { rule } }),
    ]),
  )
}

describe('escala de notas', () => {
  test.each(Array.from({ length: 19 }, (_, index) => index + 2))(
    'convierte y recupera %s unidades sin redondear',
    (units) => {
      expect(scoreToUnits(unitsToScore(units))).toBe(units)
      expect(unitsToScore(units)).toBe(units / 2)
    },
  )
  test.each([0, 0.5, -1, 10.5, 9.3, NaN, Infinity, '9.5', null, undefined])(
    'rechaza nota visible inválida %s',
    (value) => {
      expect(() => scoreToUnits(value)).toThrow()
    },
  )
  test.each([0, 1, 21, 19.5, NaN, Infinity, '19', null, undefined])(
    'rechaza unidades inválidas %s',
    (value) => {
      expect(() => unitsToScore(value)).toThrow()
      expect(
        albumRatingSchema.safeParse({
          userAlbumId: libraryIds.entry,
          scoreUnits: value,
          updatedAt: times.updated,
        }).success,
      ).toBe(false)
      expect(
        trackRatingSchema.safeParse({
          userAlbumId: libraryIds.entry,
          trackId: ids.eclipse,
          scoreUnits: value,
          updatedAt: times.updated,
        }).success,
      ).toBe(false)
    },
  )
})

describe('entradas e identidad local', () => {
  test('admite biblioteca vacía y álbumes sin calificar', () => {
    const schema = createLibrarySchema(makeContext())
    expect(
      schema.safeParse({ userAlbums: [], albumRatings: [], trackRatings: [] })
        .success,
    ).toBe(true)
    const input = makeLibrary()
    input.albumRatings = []
    input.trackRatings = []
    const library = schema.parse(input)
    expect(library.userAlbums).toHaveLength(2)
    expect(library.albumRatings).toEqual([])
    expect(library.trackRatings).toEqual([])
  })

  test('estado predeterminado no implica escucha ni propiedad y preserva notas', () => {
    const entry = userAlbumSchema.parse({
      id: libraryIds.entry,
      userId: libraryIds.user,
      albumId: ids.album,
      addedAt: times.added,
      updatedAt: times.updated,
      personalNotes: '  Comentario ficticio.\nSegunda línea.  ',
    })
    expect(entry.listeningStatus).toBe('untracked')
    expect(entry.personalNotes).toBe('  Comentario ficticio.\nSegunda línea.  ')
    expect(entry).not.toHaveProperty('owned')
    expect(entry).not.toHaveProperty('scoreUnits')
  })

  test('rechaza una segunda entrada activa y IDs duplicados', () => {
    const input = makeLibrary()
    const entry = userAlbumSchema.parse(input.userAlbums[0])
    input.userAlbums.push({ ...entry, id: libraryIds.historicalEntry })
    expectRule(input, 'duplicate_active_album')
    input.userAlbums[2] = { ...entry }
    expectRule(input, 'duplicate_id')
  })

  test('permite historia dada de baja sin otra entrada activa duplicada', () => {
    const input = makeLibrary()
    const entry = userAlbumSchema.parse(input.userAlbums[0])
    input.userAlbums.push({
      ...entry,
      id: libraryIds.historicalEntry,
      deletedAt: times.updated,
    })
    expect(createLibrarySchema(makeContext()).safeParse(input).success).toBe(
      true,
    )
    input.userAlbums[0] = { ...entry, deletedAt: times.updated }
    input.userAlbums[2] = { ...entry, id: libraryIds.historicalEntry }
    expect(createLibrarySchema(makeContext()).safeParse(input).success).toBe(
      true,
    )
  })

  test('impide mezclar propietarios y admite bibliotecas separadas para el mismo álbum', () => {
    const input = makeLibrary()
    input.userAlbums = input.userAlbums.map((entry) => ({
      ...entry,
      userId: libraryIds.otherUser,
    }))
    expectRule(input, 'wrong_owner')
    const context = { ...makeContext(), localUserId: libraryIds.otherUser }
    expect(createLibrarySchema(context).safeParse(input).success).toBe(true)
    expect(
      createLibrarySchema(makeContext()).safeParse(makeLibrary()).success,
    ).toBe(true)
  })

  test('normaliza UUID de entrada, propietario y referencias', () => {
    const input = makeLibrary()
    input.userAlbums = input.userAlbums.map((entry) => ({
      ...entry,
      id: entry.id.toUpperCase(),
      userId: entry.userId.toUpperCase(),
      albumId: entry.albumId.toUpperCase(),
    }))
    input.albumRatings = input.albumRatings.map((row) => ({
      ...row,
      userAlbumId: row.userAlbumId.toUpperCase(),
    }))
    const parsed = createLibrarySchema({
      ...makeContext(),
      localUserId: libraryIds.user.toUpperCase(),
    }).parse(input)
    expect(parsed.userAlbums[0]?.id).toBe(libraryIds.entry)
  })
})

describe('referencias de calificaciones', () => {
  test.each(['album', 'albumRating', 'trackRating', 'track'] as const)(
    'rechaza referencia ausente: %s',
    (kind) => {
      const input = makeLibrary()
      if (kind === 'album')
        input.userAlbums[0] = {
          ...userAlbumSchema.parse(input.userAlbums[0]),
          albumId: ids.missing,
        }
      if (kind === 'albumRating')
        input.albumRatings[0] = {
          userAlbumId: ids.missing,
          scoreUnits: 19,
          updatedAt: times.updated,
        }
      if (kind === 'trackRating')
        input.trackRatings[0] = {
          userAlbumId: ids.missing,
          trackId: ids.eclipse,
          scoreUnits: 18,
          updatedAt: times.updated,
        }
      if (kind === 'track')
        input.trackRatings[0] = {
          userAlbumId: libraryIds.entry,
          trackId: ids.missing,
          scoreUnits: 18,
          updatedAt: times.updated,
        }
      expectRule(input, 'missing_reference')
    },
  )

  test('rechaza pista de otro álbum', () => {
    const input = makeLibrary()
    input.trackRatings[0] = {
      userAlbumId: libraryIds.entry,
      trackId: libraryIds.otherTrack,
      scoreUnits: 18,
      updatedAt: times.updated,
    }
    expectRule(input, 'wrong_album')
  })

  test('rechaza notas duplicadas sin fusionarlas ni promediarlas', () => {
    const input = makeLibrary()
    input.albumRatings.push({
      userAlbumId: libraryIds.entry,
      scoreUnits: 12,
      updatedAt: times.updated,
    })
    expectRule(input, 'duplicate_rating')
    input.albumRatings.pop()
    input.trackRatings.push({
      userAlbumId: libraryIds.entry,
      trackId: ids.eclipse,
      scoreUnits: 14,
      updatedAt: times.updated,
    })
    expectRule(input, 'duplicate_rating')
  })

  test('una pista compartida conserva nota entre ediciones y una demo tiene otra', () => {
    const context = makeContext()
    const library = createLibrarySchema(context).parse(makeLibrary())
    const appearances = context.catalog.releaseTracks.filter(
      (row) => row.trackId === ids.eclipse,
    )
    expect(appearances).toHaveLength(2)
    expect(
      appearances.map(
        (appearance) =>
          library.trackRatings.find(
            (row) =>
              row.userAlbumId === libraryIds.entry &&
              row.trackId === appearance.trackId,
          )?.scoreUnits,
      ),
    ).toEqual([18, 18])
    expect(
      library.trackRatings.find((row) => row.trackId === ids.demo)?.scoreUnits,
    ).toBe(14)
    expect(
      library.albumRatings.find((row) => row.userAlbumId === libraryIds.entry)
        ?.scoreUnits,
    ).toBe(19)
  })
})

describe('cambios puros de biblioteca', () => {
  test('actualizar nota de álbum no afecta pistas, entradas ni el catálogo', () => {
    const context = makeContext()
    const catalogBefore = structuredClone(context.catalog)
    const input = makeLibrary()
    const result = applyLibraryChange(context, input, {
      type: 'set_album_rating',
      userAlbumId: libraryIds.entry,
      scoreUnits: 20,
      updatedAt: times.later,
    })
    expect(
      result.albumRatings.find((row) => row.userAlbumId === libraryIds.entry),
    ).toMatchObject({ scoreUnits: 20, updatedAt: times.later })
    expect(result.albumRatings).toHaveLength(2)
    expect(result.trackRatings).toEqual(input.trackRatings)
    expect(result.userAlbums).toEqual(input.userAlbums)
    expect(context.catalog).toEqual(catalogBefore)
  })

  test('actualizar pista no recalcula el álbum ni modifica la variante', () => {
    const input = makeLibrary()
    const result = applyLibraryChange(makeContext(), input, {
      type: 'set_track_rating',
      userAlbumId: libraryIds.entry,
      trackId: ids.eclipse,
      scoreUnits: 10,
      updatedAt: times.later,
    })
    expect(result.albumRatings).toEqual(input.albumRatings)
    expect(result.trackRatings).toHaveLength(3)
    expect(
      result.trackRatings.find((row) => row.trackId === ids.demo)?.scoreUnits,
    ).toBe(14)
    expect(
      result.trackRatings.find((row) => row.trackId === ids.eclipse)
        ?.scoreUnits,
    ).toBe(10)
  })

  test('crea notas ausentes sin crear entradas ni cambiar escucha', () => {
    const input = makeLibrary()
    input.albumRatings = []
    input.trackRatings = []
    const context = makeContext()
    const album = applyLibraryChange(context, input, {
      type: 'set_album_rating',
      userAlbumId: libraryIds.entry,
      scoreUnits: 19,
      updatedAt: times.later,
    })
    const track = applyLibraryChange(context, album, {
      type: 'set_track_rating',
      userAlbumId: libraryIds.entry,
      trackId: ids.eclipse,
      scoreUnits: 18,
      updatedAt: times.later,
    })
    expect(track.albumRatings).toHaveLength(1)
    expect(track.trackRatings).toHaveLength(1)
    expect(track.userAlbums).toEqual(input.userAlbums)
  })

  test.each(['remove_album_rating', 'remove_track_rating'] as const)(
    'quitar nota conserva los demás datos: %s',
    (type) => {
      const input = makeLibrary()
      const change: LibraryChange =
        type === 'remove_album_rating'
          ? { type, userAlbumId: libraryIds.entry }
          : { type, userAlbumId: libraryIds.entry, trackId: ids.eclipse }
      const result = applyLibraryChange(makeContext(), input, change)
      expect(result.userAlbums).toEqual(input.userAlbums)
      if (type === 'remove_album_rating') {
        expect(result.albumRatings).toEqual(
          input.albumRatings.filter(
            (row) => row.userAlbumId !== libraryIds.entry,
          ),
        )
        expect(result.trackRatings).toEqual(input.trackRatings)
      } else {
        expect(result.trackRatings).toEqual(
          input.trackRatings.filter((row) => row.trackId !== ids.eclipse),
        )
        expect(result.albumRatings).toEqual(input.albumRatings)
      }
      expect(applyLibraryChange(makeContext(), result, change)).toEqual(result)
    },
  )

  test('admite transición directa entre todos los estados conservando notas', () => {
    const statuses = [
      'untracked',
      'queued',
      'in_progress',
      'completed',
    ] as const
    for (const from of statuses) {
      const input = makeLibrary()
      input.ownedItems = [
        {
          id: '00000000-0000-4000-8000-000000000900',
          userAlbumId: libraryIds.entry,
          medium: 'physical',
          format: 'cd',
          createdAt: times.updated,
        },
      ]
      input.purchaseWishes = [
        {
          id: '00000000-0000-4000-8000-000000000901',
          userAlbumId: libraryIds.entry,
          targetFormat: 'vinyl',
          status: 'active',
          notes: 'Deseo ficticio independiente de escucha.',
          createdAt: times.updated,
        },
      ]
      input.userAlbums[0] = {
        ...userAlbumSchema.parse(input.userAlbums[0]),
        listeningStatus: from,
      }
      for (const to of statuses) {
        const result = applyLibraryChange(makeContext(), input, {
          type: 'set_listening_status',
          userAlbumId: libraryIds.entry,
          listeningStatus: to,
          updatedAt: times.later,
        })
        expect(result.userAlbums[0]?.listeningStatus).toBe(to)
        expect(result.userAlbums[0]?.personalNotes).toBe(
          input.userAlbums[0]?.personalNotes,
        )
        expect(result.userAlbums[1]).toEqual(input.userAlbums[1])
        expect(result.albumRatings).toEqual(input.albumRatings)
        expect(result.trackRatings).toEqual(input.trackRatings)
        expect(result.ownedItems).toEqual(input.ownedItems ?? [])
        expect(result.purchaseWishes).toEqual(input.purchaseWishes)
      }
    }
  })

  test.each([
    'set_album_rating',
    'set_track_rating',
    'set_listening_status',
    'remove_album_rating',
    'remove_track_rating',
  ] as const)('no modifica la entrada recibida: %s', (type) => {
    const input = makeLibrary()
    const before = structuredClone(input)
    const changes = {
      set_album_rating: {
        type: 'set_album_rating',
        userAlbumId: libraryIds.entry,
        scoreUnits: 20,
        updatedAt: times.later,
      },
      set_track_rating: {
        type: 'set_track_rating',
        userAlbumId: libraryIds.entry,
        trackId: ids.eclipse,
        scoreUnits: 20,
        updatedAt: times.later,
      },
      set_listening_status: {
        type: 'set_listening_status',
        userAlbumId: libraryIds.entry,
        listeningStatus: 'completed',
        updatedAt: times.later,
      },
      remove_album_rating: {
        type: 'remove_album_rating',
        userAlbumId: libraryIds.entry,
      },
      remove_track_rating: {
        type: 'remove_track_rating',
        userAlbumId: libraryIds.entry,
        trackId: ids.eclipse,
      },
    }
    const result = applyLibraryChange(makeContext(), input, changes[type])
    expect(input).toEqual(before)
    expect(result).not.toBe(input)
  })

  test('rechaza cambios sobre entradas ausentes o dadas de baja', () => {
    const input = makeLibrary()
    expect(() =>
      applyLibraryChange(makeContext(), input, {
        type: 'remove_album_rating',
        userAlbumId: ids.missing,
      }),
    ).toThrow(LibraryChangeError)
    input.userAlbums[0] = {
      ...userAlbumSchema.parse(input.userAlbums[0]),
      deletedAt: times.updated,
    }
    const before = structuredClone(input)
    expect(() =>
      applyLibraryChange(makeContext(), input, {
        type: 'remove_album_rating',
        userAlbumId: libraryIds.entry,
      }),
    ).toThrow(expect.objectContaining({ rule: 'inactive_entry' }))
    expect(input).toEqual(before)
  })

  test('rechaza pista ajena o ausente incluso al quitar una nota que no existe', () => {
    const input = makeLibrary()
    expect(() =>
      applyLibraryChange(makeContext(), input, {
        type: 'remove_track_rating',
        userAlbumId: libraryIds.entry,
        trackId: libraryIds.otherTrack,
      }),
    ).toThrow(expect.objectContaining({ rule: 'wrong_album' }))
    expect(() =>
      applyLibraryChange(makeContext(), input, {
        type: 'remove_track_rating',
        userAlbumId: libraryIds.entry,
        trackId: ids.missing,
      }),
    ).toThrow(expect.objectContaining({ rule: 'missing_reference' }))
  })

  test('rechaza actualizaciones anteriores y notas previas al alta', () => {
    for (const type of [
      'set_album_rating',
      'set_track_rating',
      'set_listening_status',
    ] as const) {
      const change =
        type === 'set_listening_status'
          ? {
              type,
              userAlbumId: libraryIds.entry,
              listeningStatus: 'completed',
              updatedAt: times.added,
            }
          : {
              type,
              userAlbumId: libraryIds.entry,
              trackId: type === 'set_track_rating' ? ids.eclipse : undefined,
              scoreUnits: 20,
              updatedAt: times.added,
            }
      if (type === 'set_album_rating') delete change.trackId
      expect(() =>
        applyLibraryChange(makeContext(), makeLibrary(), change),
      ).toThrow(expect.objectContaining({ rule: 'outdated_change' }))
    }
    const input = makeLibrary()
    input.albumRatings = []
    expect(() =>
      applyLibraryChange(makeContext(), input, {
        type: 'set_album_rating',
        userAlbumId: libraryIds.entry,
        scoreUnits: 19,
        updatedAt: times.earlier,
      }),
    ).toThrow()
  })
})

describe('fechas y entradas inválidas', () => {
  test.each([
    '2026-02-30T12:00:00.000Z',
    '2026-01-01T12:00:00Z',
    '2026-01-01T12:00:00.000',
    '2026-01-01T12:00:00.000-03:00',
    'invalid',
  ])('rechaza timestamp fuera del contrato %s', (timestamp) => {
    expect(utcTimestampSchema.safeParse(timestamp).success).toBe(false)
  })

  test('rechaza actualización o baja incompatibles con el alta', () => {
    const entry = userAlbumSchema.parse(makeLibrary().userAlbums[0])
    expect(
      userAlbumSchema.safeParse({ ...entry, updatedAt: times.earlier }).success,
    ).toBe(false)
    expect(
      userAlbumSchema.safeParse({ ...entry, deletedAt: times.earlier }).success,
    ).toBe(false)
    expect(
      userAlbumSchema.safeParse({ ...entry, deletedAt: times.later }).success,
    ).toBe(false)
    const input = makeLibrary()
    input.albumRatings[0] = {
      userAlbumId: libraryIds.entry,
      scoreUnits: 19,
      updatedAt: times.earlier,
    }
    expectRule(input, 'rating_before_entry')
  })

  test('rechaza estados, notas vacías, identidades y campos ajenos', () => {
    const entry = userAlbumSchema.parse(makeLibrary().userAlbums[0])
    expect(
      userAlbumSchema.safeParse({ ...entry, listeningStatus: 'owned' }).success,
    ).toBe(false)
    expect(
      userAlbumSchema.safeParse({ ...entry, personalNotes: '  \n' }).success,
    ).toBe(false)
    expect(
      userAlbumSchema.safeParse({ ...entry, userId: 'fixed-user' }).success,
    ).toBe(false)
    expect(userAlbumSchema.safeParse({ ...entry, owned: true }).success).toBe(
      false,
    )
    expect(
      albumRatingSchema.safeParse({
        userAlbumId: libraryIds.entry,
        score: 9.5,
        updatedAt: times.updated,
      }).success,
    ).toBe(false)
    expect(
      trackRatingSchema.safeParse({
        userAlbumId: libraryIds.entry,
        trackId: ids.eclipse,
        scoreUnits: 18,
        updatedAt: times.updated,
        releaseId: ids.original,
      }).success,
    ).toBe(false)
    expect(() =>
      createLibrarySchema({ ...makeContext(), localUserId: 'fixed-user' }),
    ).toThrow()
  })

  test('los errores relacionales no mutan la biblioteca', () => {
    const context = makeContext()
    const library = createLibrarySchema(context).parse(makeLibrary())
    const before = structuredClone(library)
    expect(
      getLibraryIssues(context.catalog, library, context.localUserId),
    ).toEqual([])
    expect(library).toEqual(before)
  })
})
