import { expect, test } from 'vitest'
import { ZodError } from 'zod'
import { ids, fixtureId } from '../catalog/catalog.fixture'
import { makeContext, makeLibrary, libraryIds, times } from './library.fixture'
import {
  applyLibraryChange,
  createLibrarySchema,
  LibraryChangeError,
} from './library'
import { ownedItemSchema, acquisitionDateSchema } from './owned-items'

const item = {
  id: fixtureId(800),
  userAlbumId: libraryIds.entry,
  medium: 'physical',
  format: 'cd',
  releaseId: ids.original,
  createdAt: times.later,
}
test('copias iguales conservan identidad independiente y quitar una no cambia ninguna otra tabla', () => {
  const context = makeContext(),
    before = createLibrarySchema(context).parse(makeLibrary())
  const original = structuredClone(before)
  const first = applyLibraryChange(context, before, {
    type: 'add_owned_item',
    ...item,
  })
  const second = applyLibraryChange(context, first, {
    type: 'add_owned_item',
    ...item,
    id: fixtureId(801),
  })
  expect(second.ownedItems).toHaveLength(2)
  const after = applyLibraryChange(context, second, {
    type: 'remove_owned_item',
    userAlbumId: libraryIds.entry,
    ownedItemId: item.id,
  })
  expect(after.ownedItems.map((row) => row.id)).toEqual([fixtureId(801)])
  expect(after.userAlbums).toEqual(before.userAlbums)
  expect(after.albumRatings).toEqual(before.albumRatings)
  expect(after.trackRatings).toEqual(before.trackRatings)
  expect(before).toEqual(original)
  expect(second.ownedItems).toHaveLength(2)
})
test.each([
  { id: fixtureId(800), releaseId: ids.missing },
  { id: fixtureId(800), userAlbumId: ids.missing },
  { id: fixtureId(800), releaseId: ids.deluxe },
  { id: fixtureId(800), userAlbumId: libraryIds.otherEntry },
  { id: fixtureId(800), createdAt: times.earlier },
])(
  'referencias, formato y fecha inválidos %# se rechazan sin mutar',
  (patch) => {
    const context = makeContext(),
      before = createLibrarySchema(context).parse(makeLibrary())
    expect(() =>
      applyLibraryChange(context, before, {
        type: 'add_owned_item',
        ...item,
        ...patch,
      }),
    ).toThrow(patch.userAlbumId === ids.missing ? LibraryChangeError : ZodError)
    expect(before.ownedItems).toEqual([])
  },
)
test('ID duplicado se rechaza; otra entrada no puede quitar la copia', () => {
  const context = makeContext(),
    before = applyLibraryChange(context, makeLibrary(), {
      type: 'add_owned_item',
      ...item,
    })
  expect(() =>
    applyLibraryChange(context, before, { type: 'add_owned_item', ...item }),
  ).toThrow(ZodError)
  expect(() =>
    applyLibraryChange(context, before, {
      type: 'remove_owned_item',
      userAlbumId: libraryIds.otherEntry,
      ownedItemId: item.id,
    }),
  ).toThrow()
  expect(before.ownedItems).toHaveLength(1)
})
test('entrada inactiva no permite altas ni remociones', () => {
  const context = makeContext(),
    before = applyLibraryChange(context, makeLibrary(), {
      type: 'add_owned_item',
      ...item,
    })
  const target = before.userAlbums.find((row) => row.id === libraryIds.entry)!
  target.deletedAt = times.later
  target.updatedAt = times.later
  expect(() =>
    applyLibraryChange(context, before, {
      type: 'add_owned_item',
      ...item,
      id: fixtureId(801),
    }),
  ).toThrow()
  expect(() =>
    applyLibraryChange(context, before, {
      type: 'remove_owned_item',
      userAlbumId: libraryIds.entry,
      ownedItemId: item.id,
    }),
  ).toThrow()
})
test.each([
  { medium: 'physical', format: 'digital_download' },
  { medium: 'purchased_digital', format: 'cd' },
  {
    medium: 'purchased_digital',
    format: 'digital_download',
    mediaCondition: 'mint',
  },
  {
    medium: 'purchased_digital',
    format: 'digital_download',
    sleeveCondition: 'good',
  },
  { medium: 'streaming', format: 'digital_download' },
])('combinación de medio y formato inválida %# se rechaza', (patch) => {
  expect(ownedItemSchema.safeParse({ ...item, ...patch }).success).toBe(false)
})
test('metadatos físicos y fecha antigua son opcionales y no se inventan', () => {
  const parsed = ownedItemSchema.parse({
    ...item,
    acquiredAt: '1998-10-01',
    mediaCondition: 'very_good',
    sleeveCondition: 'fair',
    notes: '  Copia ficticia.\nOtra línea.  ',
  })
  expect(parsed.notes).toBe('  Copia ficticia.\nOtra línea.  ')
  expect(ownedItemSchema.parse(item)).not.toHaveProperty('acquiredAt')
})
test.each(['2026-02-29', '2026-04-31', '0000-01-01', '2026-2-01'])(
  'día inválido %s se rechaza',
  (value) => {
    expect(acquisitionDateSchema.safeParse(value).success).toBe(false)
  },
)
test('día bisiesto real es válido', () => {
  expect(acquisitionDateSchema.parse('2024-02-29')).toBe('2024-02-29')
})
