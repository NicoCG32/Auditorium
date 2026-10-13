import { catalogSchema } from '../catalog/catalog'
import type { Catalog } from '../catalog/schemas'
import { entityIdSchema } from '../shared/scalars'
import { getLibraryIssues, type LibraryRule } from './integrity'
import { libraryChangeSchema, libraryDataSchema, type Library } from './schemas'
import { ownedItemSchema } from './owned-items'
import { purchaseWishSchema, wishMatchesOwnedItem } from './purchase-wishes'

export interface LibraryContext {
  catalog: Catalog
  localUserId: string
}

function parseContext(context: LibraryContext): LibraryContext {
  return {
    catalog: catalogSchema.parse(context.catalog),
    localUserId: entityIdSchema.parse(context.localUserId),
  }
}

function schemaForContext(context: LibraryContext) {
  return libraryDataSchema.superRefine((library, validation) => {
    for (const issue of getLibraryIssues(
      context.catalog,
      library,
      context.localUserId,
    )) {
      validation.addIssue({
        code: 'custom',
        path: issue.path,
        message: issue.message,
        params: { rule: issue.rule },
      })
    }
  })
}

export function createLibrarySchema(context: LibraryContext) {
  return schemaForContext(parseContext(context))
}

export class LibraryChangeError extends Error {
  readonly rule: LibraryRule
  constructor(rule: LibraryRule, message: string) {
    super(message)
    this.name = 'LibraryChangeError'
    this.rule = rule
  }
}

export function applyLibraryChange(
  contextInput: LibraryContext,
  input: unknown,
  changeInput: unknown,
): Library {
  const context = parseContext(contextInput)
  const schema = schemaForContext(context)
  const library = schema.parse(input)
  const change = libraryChangeSchema.parse(changeInput)
  const entry = library.userAlbums.find((row) => row.id === change.userAlbumId)
  if (!entry)
    throw new LibraryChangeError(
      'missing_reference',
      'No existe la entrada personal.',
    )
  if (entry.deletedAt !== undefined) {
    throw new LibraryChangeError(
      'inactive_entry',
      'No se puede modificar una entrada dada de baja.',
    )
  }
  if ('trackId' in change) {
    const track = context.catalog.tracks.find(
      (row) => row.id === change.trackId,
    )
    if (!track)
      throw new LibraryChangeError('missing_reference', 'No existe la pista.')
    if (track.albumId !== entry.albumId) {
      throw new LibraryChangeError(
        'wrong_album',
        'La pista no pertenece al álbum de la entrada.',
      )
    }
  }
  if ('updatedAt' in change) {
    const previous =
      change.type === 'set_album_rating'
        ? library.albumRatings.find((row) => row.userAlbumId === entry.id)
            ?.updatedAt
        : change.type === 'set_track_rating'
          ? library.trackRatings.find(
              (row) =>
                row.userAlbumId === entry.id && row.trackId === change.trackId,
            )?.updatedAt
          : entry.updatedAt
    if (previous !== undefined && change.updatedAt < previous) {
      throw new LibraryChangeError(
        'outdated_change',
        'El cambio no puede sobrescribir una actualización posterior.',
      )
    }
  }

  switch (change.type) {
    case 'add_purchase_wish': {
      const wish = purchaseWishSchema.parse(
        Object.fromEntries(
          Object.entries(change).filter(
            ([key, value]) => key !== 'type' && value !== undefined,
          ),
        ),
      )
      if (wish.status !== 'active')
        throw new LibraryChangeError(
          'outdated_change',
          'Un deseo nuevo debe estar activo.',
        )
      library.purchaseWishes = [...library.purchaseWishes, wish]
      break
    }
    case 'update_purchase_wish':
    case 'set_wish_status': {
      const wish = library.purchaseWishes.find(
        (row) => row.id === change.wishId,
      )
      if (!wish)
        throw new LibraryChangeError(
          'missing_reference',
          'No existe el deseo seleccionado.',
        )
      if (wish.userAlbumId !== entry.id)
        throw new LibraryChangeError(
          'wrong_album',
          'El deseo no pertenece a esta entrada.',
        )
      let updated = wish
      if (change.type === 'update_purchase_wish') {
        if (wish.status !== 'active')
          throw new LibraryChangeError(
            'outdated_change',
            'Reactiva el deseo antes de editar su objetivo.',
          )
        if (JSON.stringify(wish) !== JSON.stringify(change.expected))
          throw new LibraryChangeError(
            'outdated_change',
            'El deseo cambió después de leerlo.',
          )
        const base = {
          id: wish.id,
          userAlbumId: wish.userAlbumId,
          status: wish.status,
          createdAt: wish.createdAt,
        }
        updated = purchaseWishSchema.parse({
          ...base,
          ...(change.targetReleaseId
            ? { targetReleaseId: change.targetReleaseId }
            : {}),
          ...(change.targetFormat ? { targetFormat: change.targetFormat } : {}),
          ...(change.notes ? { notes: change.notes } : {}),
        })
      } else {
        if (wish.status !== change.expectedStatus)
          throw new LibraryChangeError(
            'outdated_change',
            'El estado del deseo cambió después de leerlo.',
          )
        if (change.status === 'fulfilled') {
          const item = library.ownedItems.find(
            (row) => row.id === change.ownedItemId,
          )
          if (!item || !wishMatchesOwnedItem(wish, item))
            throw new LibraryChangeError(
              'incompatible_release',
              'Se requiere un ejemplar coincidente y un deseo activo para cumplirlo.',
            )
        }
        updated = { ...wish, status: change.status }
      }
      library.purchaseWishes = library.purchaseWishes.map((row) =>
        row.id === wish.id ? updated : row,
      )
      break
    }
    case 'add_owned_item': {
      const item = ownedItemSchema.parse(
        Object.fromEntries(
          Object.entries(change).filter(
            ([key, value]) => key !== 'type' && value !== undefined,
          ),
        ),
      )
      library.ownedItems = [...library.ownedItems, item]
      break
    }
    case 'remove_owned_item': {
      const item = library.ownedItems.find(
        (row) => row.id === change.ownedItemId,
      )
      if (!item)
        throw new LibraryChangeError(
          'missing_reference',
          'No existe el ejemplar seleccionado.',
        )
      if (item.userAlbumId !== entry.id)
        throw new LibraryChangeError(
          'wrong_album',
          'El ejemplar no pertenece a esta entrada.',
        )
      library.ownedItems = library.ownedItems.filter(
        (row) => row.id !== item.id,
      )
      break
    }
    case 'set_personal_experience':
      library.userAlbums = library.userAlbums.map((row) => {
        if (row.id !== entry.id) return row
        const updated = {
          ...row,
          listeningStatus: change.listeningStatus,
          updatedAt: change.updatedAt,
        }
        delete updated.personalNotes
        if (change.personalNotes !== undefined)
          updated.personalNotes = change.personalNotes
        return updated
      })
      break
    case 'set_listening_status':
      library.userAlbums = library.userAlbums.map((row) =>
        row.id === entry.id
          ? {
              ...row,
              listeningStatus: change.listeningStatus,
              updatedAt: change.updatedAt,
            }
          : row,
      )
      break
    case 'set_album_rating':
      library.albumRatings = [
        ...library.albumRatings.filter((row) => row.userAlbumId !== entry.id),
        {
          userAlbumId: entry.id,
          scoreUnits: change.scoreUnits,
          updatedAt: change.updatedAt,
        },
      ]
      break
    case 'set_track_rating':
      library.trackRatings = [
        ...library.trackRatings.filter(
          (row) =>
            row.userAlbumId !== entry.id || row.trackId !== change.trackId,
        ),
        {
          userAlbumId: entry.id,
          trackId: change.trackId,
          scoreUnits: change.scoreUnits,
          updatedAt: change.updatedAt,
        },
      ]
      break
    case 'remove_album_rating':
      library.albumRatings = library.albumRatings.filter(
        (row) => row.userAlbumId !== entry.id,
      )
      break
    case 'remove_track_rating':
      library.trackRatings = library.trackRatings.filter(
        (row) => row.userAlbumId !== entry.id || row.trackId !== change.trackId,
      )
      break
  }
  return schema.parse(library)
}
