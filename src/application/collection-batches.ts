import { z } from 'zod'
import { releaseFormatSchema } from '../domain/catalog/schemas'
import {
  ownedFormatSchema,
  ownedItemSchema,
} from '../domain/library/owned-items'
import { purchaseWishSchema } from '../domain/library/purchase-wishes'
import { createLibrarySchema } from '../domain/library/library'
import {
  listeningStatusSchema,
  type UserAlbum,
} from '../domain/library/schemas'
import { entityIdSchema } from '../domain/shared/scalars'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../domain/repositories/local-repository'
import { albumArtistIndex } from './catalog-artists'

export const collectionBatchActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('own'), format: ownedFormatSchema }),
  z.strictObject({ kind: z.literal('wish'), format: releaseFormatSchema }),
  z.strictObject({
    kind: z.literal('listening'),
    status: listeningStatusSchema,
  }),
])
export type CollectionBatchAction = z.output<typeof collectionBatchActionSchema>
export interface CollectionBatchPreview {
  readonly action: CollectionBatchAction
  readonly rows: readonly {
    readonly id: string
    readonly title: string
    readonly artist: string
    readonly change: boolean
  }[]
  readonly changed: number
  readonly unchanged: number
}
export interface CollectionBatchReceipt {
  changed: number
  unchanged: number
}
type ExpectedEntry = Pick<
  UserAlbum,
  'id' | 'albumId' | 'addedAt' | 'listeningStatus'
> & {
  present: boolean
}
type PreparedState = {
  identity: LocalSnapshot['identity']
  action: CollectionBatchAction
  entries: ExpectedEntry[]
}
const selectionSchema = z
  .array(entityIdSchema)
  .min(1, 'Selecciona al menos un álbum.')
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'La selección contiene álbumes repetidos.',
  )

function matchingEntries(
  snapshot: LocalSnapshot,
  action: CollectionBatchAction,
) {
  if (action.kind === 'own')
    return new Set(
      snapshot.library.ownedItems
        .filter((item) => item.format === action.format)
        .map((item) => item.userAlbumId),
    )
  if (action.kind === 'wish') {
    const releases = new Map(
      snapshot.catalog.releases.map((release) => [release.id, release.format]),
    )
    return new Set(
      snapshot.library.purchaseWishes
        .filter(
          (wish) =>
            wish.status === 'active' &&
            (wish.targetFormat ??
              (wish.targetReleaseId
                ? releases.get(wish.targetReleaseId)
                : undefined)) === action.format,
        )
        .map((wish) => wish.userAlbumId),
    )
  }
  return new Set(
    snapshot.library.userAlbums
      .filter((entry) => entry.listeningStatus === action.status)
      .map((entry) => entry.id),
  )
}
function conflict(): never {
  throw new Error(
    'La selección cambió después de revisarla. Vuelve a revisar los álbumes antes de guardar.',
  )
}

/** One confirmed action, one transaction; existing copies and wishes are never rewritten. */
export class CollectionBatches {
  private readonly prepared = new WeakMap<
    CollectionBatchPreview,
    PreparedState
  >()
  private readonly committing = new WeakSet<CollectionBatchPreview>()
  private readonly repository: TransactionalLocalRepository
  private readonly options: { createId?: () => string; now?: () => Date }
  constructor(
    repository: TransactionalLocalRepository,
    options: { createId?: () => string; now?: () => Date } = {},
  ) {
    this.repository = repository
    this.options = options
  }

  async prepare(
    idsInput: unknown,
    actionInput: unknown,
  ): Promise<CollectionBatchPreview> {
    const ids = selectionSchema.parse(idsInput)
    const action = collectionBatchActionSchema.parse(actionInput)
    const snapshot = await this.repository.readSnapshot()
    const entries = new Map(
      snapshot.library.userAlbums.map((entry) => [entry.id, entry]),
    )
    const albums = new Map(
      snapshot.catalog.albums.map((album) => [album.id, album]),
    )
    const artists = albumArtistIndex(snapshot.catalog)
    const matching = matchingEntries(snapshot, action)
    const expected: ExpectedEntry[] = []
    const rows = ids.map((id) => {
      const entry = entries.get(id)
      if (
        !entry ||
        entry.deletedAt ||
        entry.userId !== snapshot.identity.userId
      )
        conflict()
      const album = albums.get(entry.albumId)
      if (!album) conflict()
      const present = matching.has(id)
      expected.push({
        id,
        albumId: entry.albumId,
        addedAt: entry.addedAt,
        listeningStatus: entry.listeningStatus,
        present,
      })
      return Object.freeze({
        id,
        title: album.title,
        artist: (artists.get(album.id) ?? [])
          .map((artist) => artist.name)
          .join(' · '),
        change: !present,
      })
    })
    const changed = rows.filter((row) => row.change).length
    const preview: CollectionBatchPreview = Object.freeze({
      action: Object.freeze(structuredClone(action)),
      rows: Object.freeze(rows),
      changed,
      unchanged: rows.length - changed,
    })
    this.prepared.set(preview, {
      identity: { ...snapshot.identity },
      action,
      entries: expected,
    })
    return preview
  }

  async confirm(
    preview: CollectionBatchPreview,
  ): Promise<CollectionBatchReceipt> {
    const prepared = this.prepared.get(preview)
    if (!prepared)
      throw new Error('Vuelve a revisar la selección antes de guardar.')
    if (this.committing.has(preview))
      throw new Error('Esta selección ya se está guardando.')
    this.committing.add(preview)
    try {
      const receipt = await this.repository.mutate((snapshot) => {
        if (
          snapshot.identity.userId !== prepared.identity.userId ||
          snapshot.identity.createdAt !== prepared.identity.createdAt
        )
          conflict()
        const entries = new Map(
          snapshot.library.userAlbums.map((entry) => [entry.id, entry]),
        )
        const matching = matchingEntries(snapshot, prepared.action)
        for (const expected of prepared.entries) {
          const entry = entries.get(expected.id)
          if (
            !entry ||
            entry.deletedAt ||
            entry.userId !== prepared.identity.userId ||
            entry.albumId !== expected.albumId ||
            entry.addedAt !== expected.addedAt
          )
            conflict()
          if (
            matching.has(entry.id) !== expected.present ||
            (prepared.action.kind === 'listening' &&
              entry.listeningStatus !== expected.listeningStatus)
          )
            conflict()
        }
        const now = (this.options.now?.() ?? new Date()).toISOString()
        const createId = this.options.createId ?? (() => crypto.randomUUID())
        const changes = prepared.entries.filter((entry) => !entry.present)
        const changedIds = new Set(changes.map((entry) => entry.id))
        const action = prepared.action
        if (action.kind === 'own') {
          snapshot.library.ownedItems = snapshot.library.ownedItems.concat(
            changes.map((entry) =>
              ownedItemSchema.parse({
                id: createId(),
                userAlbumId: entry.id,
                medium:
                  action.format === 'digital_download'
                    ? 'purchased_digital'
                    : 'physical',
                format: action.format,
                createdAt: now < entry.addedAt ? entry.addedAt : now,
              }),
            ),
          )
        } else if (action.kind === 'wish') {
          snapshot.library.purchaseWishes =
            snapshot.library.purchaseWishes.concat(
              changes.map((entry) =>
                purchaseWishSchema.parse({
                  id: createId(),
                  userAlbumId: entry.id,
                  targetFormat: action.format,
                  status: 'active',
                  createdAt: now < entry.addedAt ? entry.addedAt : now,
                }),
              ),
            )
        } else {
          snapshot.library.userAlbums = snapshot.library.userAlbums.map(
            (entry) =>
              changedIds.has(entry.id)
                ? {
                    ...entry,
                    listeningStatus: action.status,
                    updatedAt: now < entry.updatedAt ? entry.updatedAt : now,
                  }
                : entry,
          )
        }
        snapshot.library = createLibrarySchema({
          catalog: snapshot.catalog,
          localUserId: snapshot.identity.userId,
        }).parse(snapshot.library)
        return {
          snapshot,
          result: {
            changed: changes.length,
            unchanged: prepared.entries.length - changes.length,
          },
        }
      })
      this.prepared.delete(preview)
      return receipt
    } finally {
      this.committing.delete(preview)
    }
  }
}
