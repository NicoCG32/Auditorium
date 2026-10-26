// @vitest-environment node
import { expect, test } from 'vitest'
import { fixtureId, ids } from '../catalog/catalog.fixture'
import { getLibraryIssues, type LibraryRule } from './integrity'
import {
  applyLibraryChange,
  createLibrarySchema,
  sameAlbumGenreRating,
} from './library'
import { libraryIds, makeContext, makeLibrary, times } from './library.fixture'
import { personalEntryData, personalEntryToken } from './personal-entry'
import {
  albumGenreRatingSchema,
  libraryChangeSchema,
  libraryDataSchema,
  type AlbumGenreRating,
  type Library,
  type LibraryChange,
} from './schemas'

type SetGenreRating = Extract<LibraryChange, { type: 'set_album_genre_rating' }>

function fixture() {
  const context = makeContext()
  context.catalog.albums[0]!.genres = ['Metal Progresivo', 'Jazz']
  context.catalog.albums[1]!.genres = ['Jazz']
  const library = createLibrarySchema(context).parse(makeLibrary())
  return { context, library }
}

function rating(overrides: Partial<AlbumGenreRating> = {}): AlbumGenreRating {
  return {
    userAlbumId: libraryIds.entry,
    genreKey: 'metal progresivo',
    scoreUnits: 18,
    updatedAt: times.updated,
    ...overrides,
  }
}

function setRating(
  library: Library,
  overrides: Partial<SetGenreRating> = {},
): SetGenreRating {
  const userAlbumId = overrides.userAlbumId ?? libraryIds.entry
  const genreKey = overrides.genreKey ?? 'metal progresivo'
  return {
    type: 'set_album_genre_rating',
    userAlbumId,
    genreKey,
    scoreUnits: 18,
    updatedAt: times.later,
    expected:
      library.albumGenreRatings.find(
        (row) => row.userAlbumId === userAlbumId && row.genreKey === genreKey,
      ) ?? null,
    ...overrides,
  }
}

function expectRule(library: Library, rule: LibraryRule) {
  const { context } = fixture()
  expect(
    getLibraryIssues(context.catalog, library, context.localUserId).some(
      (issue) => issue.rule === rule,
    ),
  ).toBe(true)
  expect(createLibrarySchema(context).safeParse(library).success).toBe(false)
}

test('la colección opcional de constructor produce un array vacío y filas estrictas', () => {
  expect(libraryDataSchema.parse(makeLibrary()).albumGenreRatings).toEqual([])
  expect(albumGenreRatingSchema.parse(rating())).toEqual(rating())
  expect(
    albumGenreRatingSchema.safeParse({ ...rating(), fallback: 20 }).success,
  ).toBe(false)
})

test.each([1, 21, 2.5, Number.NaN])('rechaza scoreUnits %j', (scoreUnits) => {
  expect(albumGenreRatingSchema.safeParse(rating({ scoreUnits })).success).toBe(
    false,
  )
})

test('set exige expected explícito y remove exige una fila completa', () => {
  const { library } = fixture()
  const command = setRating(library)
  const { expected: omitted, ...withoutExpected } = command
  expect(omitted).toBeNull()
  expect(libraryChangeSchema.safeParse(withoutExpected).success).toBe(false)
  expect(
    libraryChangeSchema.safeParse({
      type: 'remove_album_genre_rating',
      userAlbumId: libraryIds.entry,
      genreKey: 'metal progresivo',
      expected: null,
    }).success,
  ).toBe(false)
})

test('dos géneros mantienen notas independientes de álbum, pistas y experiencia', () => {
  const { context, library } = fixture()
  const before = structuredClone(library)
  const metal = applyLibraryChange(context, library, setRating(library))
  const jazz = applyLibraryChange(
    context,
    metal,
    setRating(metal, { genreKey: 'jazz', scoreUnits: 6 }),
  )
  expect(jazz.albumGenreRatings.map((row) => row.scoreUnits)).toEqual([18, 6])
  expect(jazz.albumRatings).toEqual(before.albumRatings)
  expect(jazz.trackRatings).toEqual(before.trackRatings)
  expect(jazz.userAlbums).toEqual(before.userAlbums)
  expect(library).toEqual(before)
  const removed = applyLibraryChange(context, jazz, {
    type: 'remove_album_rating',
    userAlbumId: libraryIds.entry,
  })
  expect(removed.albumGenreRatings).toEqual(jazz.albumGenreRatings)
})

test('la misma clave tiene notas distintas para entradas distintas', () => {
  const { context, library } = fixture()
  library.albumGenreRatings = [rating({ genreKey: 'jazz' })]
  const after = applyLibraryChange(
    context,
    library,
    setRating(library, {
      userAlbumId: libraryIds.otherEntry,
      genreKey: 'jazz',
      scoreUnits: 2,
    }),
  )
  expect(after.albumGenreRatings).toHaveLength(2)
})

test('etiquetas legadas equivalentes comparten una clave sin modificar el catálogo', () => {
  const { context, library } = fixture()
  context.catalog.albums[0]!.genres = ['MÉTAL   Progresivo', 'Metal Progresivo']
  const before = structuredClone(context.catalog)
  const after = applyLibraryChange(context, library, setRating(library))
  expect(after.albumGenreRatings).toHaveLength(1)
  expect(context.catalog).toEqual(before)
})

test('integridad exige género asignado incluso para una entrada retirada', () => {
  const { context, library } = fixture()
  library.albumGenreRatings = [rating({ genreKey: 'rock' })]
  expectRule(library, 'genre_not_assigned')
  library.userAlbums[0]!.deletedAt = times.updated
  expectRule(library, 'genre_not_assigned')
  expect(() =>
    applyLibraryChange(context, fixture().library, {
      ...setRating(fixture().library),
      genreKey: 'rock',
    }),
  ).toThrow()
})

test('integridad rechaza notas duplicadas sin fusionar ni promediar', () => {
  const { library } = fixture()
  library.albumGenreRatings = [rating(), rating({ scoreUnits: 2 })]
  expectRule(library, 'duplicate_rating')
})

test('integridad exige entrada existente y fecha no anterior al alta', () => {
  const { library } = fixture()
  library.albumGenreRatings = [rating({ userAlbumId: ids.missing })]
  expectRule(library, 'missing_reference')
  library.albumGenreRatings = [rating({ updatedAt: times.earlier })]
  expectRule(library, 'rating_before_entry')
})

test('integridad rechaza edición ausente o perteneciente a otro álbum', () => {
  const { context, library } = fixture()
  library.albumGenreRatings = [rating({ referenceReleaseId: ids.missing })]
  expectRule(library, 'missing_reference')
  context.catalog.releases.push({
    id: fixtureId(9081),
    albumId: ids.otherAlbum,
    format: 'digital',
  })
  library.albumGenreRatings = [rating({ referenceReleaseId: fixtureId(9081) })]
  expect(
    getLibraryIssues(context.catalog, library, context.localUserId).some(
      (issue) => issue.rule === 'wrong_album',
    ),
  ).toBe(true)
})

test('la referencia es propia: no hereda álbum, undefined conserva y null quita', () => {
  const { context, library } = fixture()
  library.albumRatings[0]!.referenceReleaseId = ids.deluxe
  const created = applyLibraryChange(context, library, setRating(library))
  expect(created.albumGenreRatings[0]).not.toHaveProperty('referenceReleaseId')
  const referenced = applyLibraryChange(
    context,
    created,
    setRating(created, { referenceReleaseId: ids.original }),
  )
  const kept = applyLibraryChange(
    context,
    referenced,
    setRating(referenced, { scoreUnits: 20 }),
  )
  expect(kept.albumGenreRatings[0]?.referenceReleaseId).toBe(ids.original)
  const cleared = applyLibraryChange(
    context,
    kept,
    setRating(kept, { referenceReleaseId: null }),
  )
  expect(cleared.albumGenreRatings[0]).not.toHaveProperty('referenceReleaseId')
  expect(cleared.albumRatings[0]?.referenceReleaseId).toBe(ids.deluxe)
})

test.each(['scoreUnits', 'updatedAt', 'referenceReleaseId'] as const)(
  'set y remove detectan conflicto en %s y conservan los datos',
  (field) => {
    const { context, library } = fixture()
    const expected = rating()
    const changed = {
      ...expected,
      [field]:
        field === 'scoreUnits'
          ? 2
          : field === 'updatedAt'
            ? times.later
            : ids.original,
    }
    library.albumGenreRatings = [changed]
    const before = structuredClone(library)
    for (const command of [
      setRating(library, { expected }),
      {
        type: 'remove_album_genre_rating',
        userAlbumId: libraryIds.entry,
        genreKey: 'metal progresivo',
        expected,
      },
    ])
      expect(() => applyLibraryChange(context, library, command)).toThrow(
        expect.objectContaining({ rule: 'outdated_change' }),
      )
    expect(library).toEqual(before)
  },
)

test('CAS detecta creación concurrente, eliminación concurrente y pareja incorrecta', () => {
  const { context, library } = fixture()
  library.albumGenreRatings = [rating()]
  expect(() =>
    applyLibraryChange(
      context,
      library,
      setRating(library, { expected: null }),
    ),
  ).toThrow(expect.objectContaining({ rule: 'outdated_change' }))
  expect(() =>
    applyLibraryChange(
      context,
      library,
      setRating(library, { expected: rating({ genreKey: 'jazz' }) }),
    ),
  ).toThrow(expect.objectContaining({ rule: 'outdated_change' }))
  library.albumGenreRatings = []
  for (const command of [
    setRating(library, { expected: rating() }),
    {
      type: 'remove_album_genre_rating',
      userAlbumId: libraryIds.entry,
      genreKey: 'metal progresivo',
      expected: rating(),
    },
  ])
    expect(() => applyLibraryChange(context, library, command)).toThrow(
      expect.objectContaining({ rule: 'outdated_change' }),
    )
})

test('el timestamp se compara con la pareja y no con la actualización de la entrada', () => {
  const { context, library } = fixture()
  library.userAlbums[0]!.updatedAt = times.later
  const created = applyLibraryChange(
    context,
    library,
    setRating(library, { updatedAt: times.added }),
  )
  expect(created.albumGenreRatings[0]?.updatedAt).toBe(times.added)
  library.albumGenreRatings = [rating()]
  expect(() =>
    applyLibraryChange(
      context,
      library,
      setRating(library, { updatedAt: times.added, scoreUnits: 20 }),
    ),
  ).toThrow(expect.objectContaining({ rule: 'outdated_change' }))
  expect(() =>
    applyLibraryChange(
      context,
      fixture().library,
      setRating(fixture().library, { updatedAt: times.earlier }),
    ),
  ).toThrow()
})

test('un set idéntico conserva la fila y el timestamp previo', () => {
  const { context, library } = fixture()
  library.albumGenreRatings = [rating({ referenceReleaseId: ids.original })]
  expect(applyLibraryChange(context, library, setRating(library))).toEqual(
    library,
  )
})

test('remove sólo quita la pareja elegida y conserva las demás notas', () => {
  const { context, library } = fixture()
  library.albumGenreRatings = [rating(), rating({ genreKey: 'jazz' })]
  const after = applyLibraryChange(context, library, {
    type: 'remove_album_genre_rating',
    userAlbumId: libraryIds.entry,
    genreKey: 'metal progresivo',
    expected: rating(),
  })
  expect(after).toEqual({
    ...library,
    albumGenreRatings: [rating({ genreKey: 'jazz' })],
  })
})

test('retirar y restaurar conservan las notas y la entrada retirada impide cambios', () => {
  const { context, library } = fixture()
  library.albumGenreRatings = [rating()]
  const removed = applyLibraryChange(context, library, {
    type: 'remove_personal_album',
    userAlbumId: libraryIds.entry,
    expectedToken: personalEntryToken(library, libraryIds.entry),
    updatedAt: times.later,
  })
  expect(removed.albumGenreRatings).toEqual(library.albumGenreRatings)
  for (const command of [
    setRating(removed),
    {
      type: 'remove_album_genre_rating',
      userAlbumId: libraryIds.entry,
      genreKey: 'metal progresivo',
      expected: rating(),
    },
  ])
    expect(() => applyLibraryChange(context, removed, command)).toThrow(
      expect.objectContaining({ rule: 'inactive_entry' }),
    )
  const restored = applyLibraryChange(context, removed, {
    type: 'restore_personal_album',
    userAlbumId: libraryIds.entry,
    expectedToken: personalEntryToken(removed, libraryIds.entry),
    updatedAt: times.later,
  })
  expect(restored.albumGenreRatings).toEqual(library.albumGenreRatings)
})

test('el token incluye filas ordenadas y una nueva nota invalida la retirada confirmada', () => {
  const { context, library } = fixture()
  library.albumGenreRatings = [rating(), rating({ genreKey: 'jazz' })]
  expect(
    personalEntryData(library, libraryIds.entry).albumGenreRatings,
  ).toEqual([rating({ genreKey: 'jazz' }), rating()])
  const reordered = structuredClone(library)
  reordered.albumGenreRatings.reverse()
  expect(personalEntryToken(reordered, libraryIds.entry)).toBe(
    personalEntryToken(library, libraryIds.entry),
  )
  const changed = applyLibraryChange(
    context,
    library,
    setRating(library, { scoreUnits: 20 }),
  )
  expect(() =>
    applyLibraryChange(context, changed, {
      type: 'remove_personal_album',
      userAlbumId: libraryIds.entry,
      expectedToken: personalEntryToken(library, libraryIds.entry),
      updatedAt: times.later,
    }),
  ).toThrow(expect.objectContaining({ rule: 'outdated_change' }))
})

test('comparar filas no depende del orden de propiedades e incluye la pareja', () => {
  const row = rating()
  expect(
    sameAlbumGenreRating(row, {
      updatedAt: row.updatedAt,
      scoreUnits: row.scoreUnits,
      genreKey: row.genreKey,
      userAlbumId: row.userAlbumId,
    }),
  ).toBe(true)
  expect(sameAlbumGenreRating(null, null)).toBe(true)
  expect(sameAlbumGenreRating(row, null)).toBe(false)
  expect(
    sameAlbumGenreRating(row, rating({ userAlbumId: libraryIds.otherEntry })),
  ).toBe(false)
})
