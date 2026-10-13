import { expect, test } from 'vitest'
import { fixtureId, ids } from '../catalog/catalog.fixture'
import { makeContext, makeLibrary, libraryIds, times } from './library.fixture'
import { applyLibraryChange, createLibrarySchema } from './library'
import { purchaseWishSchema, wishMatchesOwnedItem } from './purchase-wishes'
import { ownedItemSchema } from './owned-items'

const wish = {
  id: fixtureId(810),
  userAlbumId: libraryIds.entry,
  targetFormat: 'vinyl',
  status: 'active',
  createdAt: times.later,
}
const item = ownedItemSchema.parse({
  id: fixtureId(820),
  userAlbumId: libraryIds.entry,
  medium: 'physical',
  format: 'cd',
  releaseId: ids.original,
  createdAt: times.later,
})
const context = makeContext()
test.each([
  { targetFormat: undefined },
  { targetFormat: 'streaming' },
  { targetReleaseId: ids.missing },
  { targetReleaseId: ids.original },
  { createdAt: times.earlier },
  { userAlbumId: libraryIds.otherEntry, targetReleaseId: ids.deluxe },
  { status: 'fulfilled' },
  { status: 'unknown' },
])(
  'objetivo, referencia, fecha o estado inicial inválidos %# no alteran la biblioteca',
  (patch) => {
    const before = createLibrarySchema(context).parse(makeLibrary()),
      original = structuredClone(before)
    expect(() =>
      applyLibraryChange(context, before, {
        type: 'add_purchase_wish',
        ...wish,
        ...patch,
      }),
    ).toThrow()
    expect(before).toEqual(original)
  },
)
test('deseos genéricos y exactos coexisten con CD sin alterar propiedad, experiencia o ratings', () => {
  const before = applyLibraryChange(context, makeLibrary(), {
    type: 'add_owned_item',
    ...item,
  })
  const first = applyLibraryChange(context, before, {
    type: 'add_purchase_wish',
    ...wish,
  })
  const after = applyLibraryChange(context, first, {
    type: 'add_purchase_wish',
    ...wish,
    id: fixtureId(811),
    targetFormat: undefined,
    targetReleaseId: ids.deluxe,
  })
  expect(after.purchaseWishes).toHaveLength(2)
  expect(after.ownedItems).toEqual([item])
  expect(after.userAlbums).toEqual(before.userAlbums)
  expect(after.albumRatings).toEqual(before.albumRatings)
  expect(after.trackRatings).toEqual(before.trackRatings)
  expect(after.purchaseWishes.every((row) => row.status === 'active')).toBe(
    true,
  )
  expect(before.purchaseWishes).toEqual([])
})
test('IDs únicos, pertenencia y entrada activa se comprueban', () => {
  const before = applyLibraryChange(context, makeLibrary(), {
    type: 'add_purchase_wish',
    ...wish,
  })
  expect(() =>
    applyLibraryChange(context, before, { type: 'add_purchase_wish', ...wish }),
  ).toThrow()
  expect(() =>
    applyLibraryChange(context, before, {
      type: 'set_wish_status',
      userAlbumId: libraryIds.otherEntry,
      wishId: wish.id,
      status: 'cancelled',
      expectedStatus: 'active',
    }),
  ).toThrow()
  before.userAlbums[0]!.deletedAt = times.later
  before.userAlbums[0]!.updatedAt = times.later
  expect(createLibrarySchema(context).safeParse(before).success).toBe(true)
  expect(() =>
    applyLibraryChange(context, before, {
      type: 'set_wish_status',
      userAlbumId: libraryIds.entry,
      wishId: wish.id,
      status: 'cancelled',
      expectedStatus: 'active',
    }),
  ).toThrow()
})
test('compra coincidente no cumple nada; acción explícita cumple solo el deseo solicitado', () => {
  const first = applyLibraryChange(context, makeLibrary(), {
    type: 'add_purchase_wish',
    ...wish,
  })
  const second = applyLibraryChange(context, first, {
    type: 'add_purchase_wish',
    ...wish,
    id: fixtureId(811),
    targetReleaseId: ids.deluxe,
  })
  const vinyl = ownedItemSchema.parse({
    ...item,
    format: 'vinyl',
    releaseId: ids.deluxe,
  })
  const before = applyLibraryChange(context, second, {
    type: 'add_owned_item',
    ...vinyl,
  })
  expect(before.purchaseWishes.map((row) => row.status)).toEqual([
    'active',
    'active',
  ])
  const after = applyLibraryChange(context, before, {
    type: 'set_wish_status',
    userAlbumId: libraryIds.entry,
    wishId: wish.id,
    status: 'fulfilled',
    expectedStatus: 'active',
    ownedItemId: item.id,
  })
  expect(after.purchaseWishes.map((row) => row.status)).toEqual([
    'fulfilled',
    'active',
  ])
  expect(after.ownedItems).toEqual(before.ownedItems)
  const removed = applyLibraryChange(context, after, {
    type: 'remove_owned_item',
    userAlbumId: libraryIds.entry,
    ownedItemId: item.id,
  })
  expect(removed.purchaseWishes).toEqual(after.purchaseWishes)
})
test.each([undefined, ids.missing, item.id])(
  'cumplir sin compra coincidente %s se rechaza',
  (ownedItemId) => {
    const withCopy = applyLibraryChange(context, makeLibrary(), {
      type: 'add_owned_item',
      ...item,
    })
    const before = applyLibraryChange(context, withCopy, {
      type: 'add_purchase_wish',
      ...wish,
    })
    expect(() =>
      applyLibraryChange(context, before, {
        type: 'set_wish_status',
        userAlbumId: libraryIds.entry,
        wishId: wish.id,
        status: 'fulfilled',
        expectedStatus: 'active',
        ownedItemId,
      }),
    ).toThrow()
  },
)
test('cancelación conserva objetivo y notas; edición elimina opcionales; cambios obsoletos se rechazan', () => {
  const before = applyLibraryChange(context, makeLibrary(), {
    type: 'add_purchase_wish',
    ...wish,
    targetReleaseId: ids.deluxe,
    notes: '  Nota ficticia.\nLínea.  ',
  })
  const expected = before.purchaseWishes[0]!
  const edited = applyLibraryChange(context, before, {
    type: 'update_purchase_wish',
    userAlbumId: libraryIds.entry,
    wishId: wish.id,
    expected,
    targetFormat: 'cd',
  })
  expect(edited.purchaseWishes[0]).not.toHaveProperty('notes')
  expect(edited.purchaseWishes[0]).not.toHaveProperty('targetReleaseId')
  expect(() =>
    applyLibraryChange(context, edited, {
      type: 'update_purchase_wish',
      userAlbumId: libraryIds.entry,
      wishId: wish.id,
      expected,
      targetFormat: 'vinyl',
    }),
  ).toThrow()
  const cancelled = applyLibraryChange(context, before, {
    type: 'set_wish_status',
    userAlbumId: libraryIds.entry,
    wishId: wish.id,
    expectedStatus: 'active',
    status: 'cancelled',
  })
  expect(cancelled.purchaseWishes[0]).toEqual({
    ...expected,
    status: 'cancelled',
  })
  expect(() =>
    applyLibraryChange(context, cancelled, {
      type: 'set_wish_status',
      userAlbumId: libraryIds.entry,
      wishId: wish.id,
      expectedStatus: 'active',
      status: 'fulfilled',
      ownedItemId: item.id,
    }),
  ).toThrow()
})
test('coincidencia exacta no infiere edición, distingue álbum/formato/estado y reconoce compra digital', () => {
  const exact = purchaseWishSchema.parse({
    ...wish,
    targetFormat: 'cd',
    targetReleaseId: ids.original,
  })
  expect(wishMatchesOwnedItem(exact, item)).toBe(true)
  expect(wishMatchesOwnedItem(exact, { ...item, releaseId: undefined })).toBe(
    false,
  )
  expect(
    wishMatchesOwnedItem(exact, {
      ...item,
      userAlbumId: libraryIds.otherEntry,
    }),
  ).toBe(false)
  expect(wishMatchesOwnedItem({ ...exact, status: 'cancelled' }, item)).toBe(
    false,
  )
  expect(wishMatchesOwnedItem(purchaseWishSchema.parse(wish), item)).toBe(false)
  expect(
    wishMatchesOwnedItem(
      purchaseWishSchema.parse({ ...wish, targetFormat: 'digital' }),
      ownedItemSchema.parse({
        ...item,
        releaseId: undefined,
        medium: 'purchased_digital',
        format: 'digital_download',
      }),
    ),
  ).toBe(true)
})
