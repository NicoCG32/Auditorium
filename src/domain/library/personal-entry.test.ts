import { expect, test } from 'vitest'
import {
  applyLibraryChange,
  createLibrarySchema,
  LibraryChangeError,
} from './library'
import { personalEntryToken } from './personal-entry'
import { makeContext, makeLibrary, libraryIds, times } from './library.fixture'
import { fixtureId, ids } from '../catalog/catalog.fixture'

function populated() {
  const context = makeContext()
  let data = applyLibraryChange(context, makeLibrary(), {
    type: 'add_owned_item',
    id: fixtureId(800),
    userAlbumId: libraryIds.entry,
    medium: 'physical',
    format: 'cd',
    releaseId: ids.original,
    notes: 'Copia ficticia protegida',
    createdAt: times.updated,
  })
  data = applyLibraryChange(context, data, {
    type: 'add_purchase_wish',
    id: fixtureId(810),
    userAlbumId: libraryIds.entry,
    targetReleaseId: ids.deluxe,
    status: 'active',
    notes: 'Deseo ficticio protegido',
    createdAt: times.updated,
  })
  return { context, data }
}
test('retirar y restaurar conservan identidad de entrada, fecha de alta y todas las colecciones personales', () => {
  const { context, data } = populated(),
    original = structuredClone(data)
  const removed = applyLibraryChange(context, data, {
    type: 'remove_personal_album',
    userAlbumId: libraryIds.entry,
    expectedToken: personalEntryToken(data, libraryIds.entry),
    updatedAt: times.later,
  })
  expect(removed.userAlbums[0]).toEqual({
    ...data.userAlbums[0],
    updatedAt: times.later,
    deletedAt: times.later,
  })
  const restored = applyLibraryChange(context, removed, {
    type: 'restore_personal_album',
    userAlbumId: libraryIds.entry,
    expectedToken: personalEntryToken(removed, libraryIds.entry),
    updatedAt: times.later,
  })
  expect(restored).toEqual({
    ...original,
    userAlbums: original.userAlbums.map((row) =>
      row.id === libraryIds.entry ? { ...row, updatedAt: times.later } : row,
    ),
  })
  for (const library of [removed, restored]) {
    expect(library.ownedItems).toEqual(data.ownedItems)
    expect(library.purchaseWishes).toEqual(data.purchaseWishes)
    expect(library.albumRatings).toEqual(data.albumRatings)
    expect(library.trackRatings).toEqual(data.trackRatings)
    expect(library.userAlbums[1]).toEqual(data.userAlbums[1])
  }
  expect(data).toEqual(original)
})
test.each([
  'set_personal_experience',
  'set_album_rating',
  'set_track_rating',
  'add_owned_item',
  'add_purchase_wish',
] as const)(
  'cambio concurrente %s invalida la confirmación sin retirar',
  (type) => {
    const { context, data } = populated(),
      expectedToken = personalEntryToken(data, libraryIds.entry)
    const change =
      type === 'set_personal_experience'
        ? {
            listeningStatus: 'completed',
            personalNotes: 'Nota ficticia nueva',
            updatedAt: times.later,
          }
        : type === 'set_album_rating'
          ? { scoreUnits: 20, updatedAt: times.later }
          : type === 'set_track_rating'
            ? { trackId: ids.eclipse, scoreUnits: 20, updatedAt: times.later }
            : type === 'add_owned_item'
              ? {
                  id: fixtureId(801),
                  medium: 'physical',
                  format: 'cd',
                  createdAt: times.later,
                }
              : {
                  id: fixtureId(811),
                  targetFormat: 'vinyl',
                  status: 'active',
                  createdAt: times.later,
                }
    const changed = applyLibraryChange(context, data, {
        type,
        userAlbumId: libraryIds.entry,
        ...change,
      }),
      copy = structuredClone(changed)
    expect(() =>
      applyLibraryChange(context, changed, {
        type: 'remove_personal_album',
        userAlbumId: libraryIds.entry,
        expectedToken,
        updatedAt: times.later,
      }),
    ).toThrow(LibraryChangeError)
    expect(changed).toEqual(copy)
  },
)
test('token ignora orden de arrays y cambios de otra entrada, pero detecta quitar copia y cancelar deseo', () => {
  const { context, data } = populated(),
    token = personalEntryToken(data, libraryIds.entry)
  const reordered = structuredClone(data)
  reordered.trackRatings.reverse()
  reordered.userAlbums.reverse()
  expect(personalEntryToken(reordered, libraryIds.entry)).toBe(token)
  const other = applyLibraryChange(context, data, {
    type: 'set_album_rating',
    userAlbumId: libraryIds.otherEntry,
    scoreUnits: 20,
    updatedAt: times.later,
  })
  expect(personalEntryToken(other, libraryIds.entry)).toBe(token)
  const removed = applyLibraryChange(context, data, {
    type: 'remove_owned_item',
    userAlbumId: libraryIds.entry,
    ownedItemId: fixtureId(800),
  })
  expect(personalEntryToken(removed, libraryIds.entry)).not.toBe(token)
  const cancelled = applyLibraryChange(context, data, {
    type: 'set_wish_status',
    userAlbumId: libraryIds.entry,
    wishId: fixtureId(810),
    expectedStatus: 'active',
    status: 'cancelled',
  })
  expect(personalEntryToken(cancelled, libraryIds.entry)).not.toBe(token)
})
test('entrada retirada permanece válida pero no admite cambios musicales ni otra baja', () => {
  const { context, data } = populated()
  const removed = applyLibraryChange(context, data, {
    type: 'remove_personal_album',
    userAlbumId: libraryIds.entry,
    expectedToken: personalEntryToken(data, libraryIds.entry),
    updatedAt: times.later,
  })
  expect(createLibrarySchema(context).safeParse(removed).success).toBe(true)
  expect(() =>
    applyLibraryChange(context, removed, {
      type: 'set_album_rating',
      userAlbumId: libraryIds.entry,
      scoreUnits: 18,
      updatedAt: times.later,
    }),
  ).toThrow()
  expect(() =>
    applyLibraryChange(context, removed, {
      type: 'remove_personal_album',
      userAlbumId: libraryIds.entry,
      expectedToken: personalEntryToken(removed, libraryIds.entry),
      updatedAt: times.later,
    }),
  ).toThrow()
})
test('restaurar no fusiona con otra entrada activa del mismo álbum', () => {
  const { context, data } = populated()
  const removed = applyLibraryChange(context, data, {
    type: 'remove_personal_album',
    userAlbumId: libraryIds.entry,
    expectedToken: personalEntryToken(data, libraryIds.entry),
    updatedAt: times.later,
  })
  removed.userAlbums.push({
    ...data.userAlbums[0]!,
    id: fixtureId(900),
    addedAt: times.later,
    updatedAt: times.later,
  })
  const before = structuredClone(removed)
  expect(() =>
    applyLibraryChange(context, removed, {
      type: 'restore_personal_album',
      userAlbumId: libraryIds.entry,
      expectedToken: personalEntryToken(removed, libraryIds.entry),
      updatedAt: times.later,
    }),
  ).toThrow('otra entrada activa')
  expect(removed).toEqual(before)
})
test.each(['remove_personal_album', 'restore_personal_album'])(
  'referencias, propietario y fecha inválidos se rechazan en %s',
  (type) => {
    const { context, data } = populated()
    for (const change of [
      { userAlbumId: ids.missing },
      { updatedAt: times.earlier },
    ])
      expect(() =>
        applyLibraryChange(context, data, {
          type,
          userAlbumId: libraryIds.entry,
          expectedToken: personalEntryToken(data, libraryIds.entry),
          updatedAt: times.later,
          ...change,
        }),
      ).toThrow()
    expect(() =>
      applyLibraryChange(
        { ...context, localUserId: libraryIds.otherUser },
        data,
        {
          type,
          userAlbumId: libraryIds.entry,
          expectedToken: personalEntryToken(data, libraryIds.entry),
          updatedAt: times.later,
        },
      ),
    ).toThrow()
  },
)
test.each(['album', 'track'])(
  'quitar nota %s comprueba el valor confirmado y conserva las otras colecciones',
  (kind) => {
    const { context, data } = populated(),
      isTrack = kind === 'track'
    const change = {
      type: isTrack ? 'remove_track_rating' : 'remove_album_rating',
      userAlbumId: libraryIds.entry,
      ...(isTrack ? { trackId: ids.eclipse } : {}),
      expectedScoreUnits: 20,
    }
    expect(() => applyLibraryChange(context, data, change)).toThrow(
      'nota cambió',
    )
    const result = applyLibraryChange(context, data, {
      ...change,
      expectedScoreUnits: isTrack ? 18 : 19,
    })
    expect(result.ownedItems).toEqual(data.ownedItems)
    expect(result.purchaseWishes).toEqual(data.purchaseWishes)
    expect(result.userAlbums).toEqual(data.userAlbums)
  },
)
