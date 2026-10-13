import { ZodError } from 'zod'
import { catalogSchema } from '../../domain/catalog/catalog'
import { localIdentitySchema, type LocalIdentity } from '../../domain/identity'
import { createLibrarySchema } from '../../domain/library/library'
import type {
  TransactionalLocalRepository,
  SnapshotMutation,
  LocalSnapshot,
} from '../../domain/repositories/local-repository'
import { AuditoriumDatabase, DATABASE_VERSION } from '../db/database'
import { asLocalStorageError, LocalStorageError } from '../db/errors'
import { checkNativeSchema } from '../db/preflight'
import { writeSnapshotChanges } from '../db/write-changes'
import {
  fromStoredUserAlbum,
  IDENTITY_KEY,
  identityRecordSchema,
} from '../db/records'

export interface IndexedDbOptions {
  database?: AuditoriumDatabase
  createId?: () => string
  now?: () => Date
}

export class IndexedDbRepository implements TransactionalLocalRepository {
  private readonly database: AuditoriumDatabase
  private readonly createId: () => string
  private readonly now: () => Date
  private opening: Promise<void> | undefined
  private openingBlocked = false
  private closingRequested = false

  constructor(options: IndexedDbOptions = {}) {
    this.database = options.database ?? new AuditoriumDatabase()
    this.createId = options.createId ?? (() => globalThis.crypto.randomUUID())
    this.now = options.now ?? (() => new Date())
  }

  private openDatabase(): Promise<void> {
    if (this.opening) {
      return this.openingBlocked
        ? Promise.reject(
            new LocalStorageError(
              'blocked',
              'La apertura sigue pendiente de otra conexión. Reintente después de cerrarla.',
            ),
          )
        : this.opening
    }
    this.closingRequested = false
    this.opening = new Promise((resolve, reject) => {
      const blocked = () => {
        this.openingBlocked = true
        reject(
          new LocalStorageError(
            'blocked',
            'Otra conexión impide abrir la base local. Cierre las pestañas anteriores y reintente.',
          ),
        )
      }
      this.database.on('blocked', blocked)
      void checkNativeSchema(this.database, blocked)
        .then(() => {
          if (this.openingBlocked || this.closingRequested) {
            throw new LocalStorageError(
              'aborted',
              'La apertura pendiente se canceló antes de inicializar datos.',
            )
          }
          return this.database.open()
        })
        .then(
          () => {
            this.database.on('blocked').unsubscribe(blocked)
            this.opening = undefined
            const closeAfterOpen = this.openingBlocked || this.closingRequested
            this.openingBlocked = false
            if (closeAfterOpen) {
              this.database.close()
              reject(
                new LocalStorageError(
                  'aborted',
                  'La apertura pendiente se cerró sin inicializar datos.',
                ),
              )
              return
            }
            // Dexie expresa sus versiones en décimas de la versión nativa.
            if (this.database.backendDB().version !== DATABASE_VERSION * 10) {
              this.database.close()
              reject(
                new LocalStorageError(
                  'version_mismatch',
                  'La base local usa un esquema más reciente que esta aplicación.',
                ),
              )
            } else {
              resolve()
            }
          },
          (error: unknown) => {
            this.database.on('blocked').unsubscribe(blocked)
            this.opening = undefined
            this.openingBlocked = false
            reject(asLocalStorageError(error))
          },
        )
    })
    return this.opening
  }

  async open(): Promise<LocalIdentity> {
    try {
      await this.openDatabase()
      return await this.database.transaction(
        'rw',
        this.database.tables,
        async () => {
          const existing = await this.database.metadata.get(IDENTITY_KEY)
          if (existing !== undefined) {
            const record = identityRecordSchema.parse(existing)
            return localIdentitySchema.parse({
              userId: record.userId,
              createdAt: record.createdAt,
            })
          }
          const counts = await Promise.all(
            this.database.tables.map((table) => table.count()),
          )
          if (counts.some((count) => count > 0)) {
            throw new LocalStorageError(
              'identity_missing',
              'Falta la identidad local pero la base contiene datos. Se requiere recuperación explícita.',
            )
          }
          let identity: LocalIdentity
          try {
            identity = localIdentitySchema.parse({
              userId: this.createId(),
              createdAt: this.now().toISOString(),
            })
          } catch (error) {
            throw new LocalStorageError(
              'identity_generation_failed',
              'No se pudo crear una identidad local válida.',
              error,
            )
          }
          await this.database.metadata.add({ key: IDENTITY_KEY, ...identity })
          return identity
        },
      )
    } catch (error) {
      throw asLocalStorageError(error)
    }
  }

  async readSnapshot(): Promise<LocalSnapshot> {
    await this.open()
    try {
      return await this.database.transaction('r', this.database.tables, () =>
        this.readInsideTransaction(),
      )
    } catch (error) {
      throw asLocalStorageError(error)
    }
  }

  private async readInsideTransaction(): Promise<LocalSnapshot> {
    try {
      const [
        record,
        artists,
        albums,
        albumArtists,
        tracks,
        coreTracks,
        releases,
        releaseTracks,
        userAlbums,
        albumRatings,
        trackRatings,
        ownedItems,
        purchaseWishes,
      ] = await Promise.all([
        this.database.metadata.get(IDENTITY_KEY),
        this.database.artists.toArray(),
        this.database.albums.toArray(),
        this.database.albumArtists.toArray(),
        this.database.tracks.toArray(),
        this.database.coreTracks.toArray(),
        this.database.releases.toArray(),
        this.database.releaseTracks.toArray(),
        this.database.userAlbums.toArray(),
        this.database.albumRatings.toArray(),
        this.database.trackRatings.toArray(),
        this.database.ownedItems.toArray(),
        this.database.purchaseWishes.toArray(),
      ])
      if (record === undefined)
        throw new LocalStorageError(
          'identity_missing',
          'Falta la identidad local del snapshot.',
        )
      const metadata = identityRecordSchema.parse(record)
      const identity = localIdentitySchema.parse({
        userId: metadata.userId,
        createdAt: metadata.createdAt,
      })
      const catalog = catalogSchema.parse({
        artists,
        albums,
        albumArtists,
        tracks,
        coreTracks,
        releases,
        releaseTracks,
      })
      const library = createLibrarySchema({
        catalog,
        localUserId: identity.userId,
      }).parse({
        userAlbums: userAlbums.map(fromStoredUserAlbum),
        albumRatings,
        trackRatings,
        ownedItems,
        purchaseWishes,
      })
      return { identity, catalog, library }
    } catch (error) {
      throw asLocalStorageError(error)
    }
  }

  async mutate<T>(
    change: (snapshot: LocalSnapshot) => SnapshotMutation<T>,
  ): Promise<T> {
    await this.open()
    let operationFailure: Error | undefined
    try {
      return await this.database.transaction(
        'rw',
        this.database.tables,
        async () => {
          const before = await this.readInsideTransaction()
          let mutation: SnapshotMutation<T>
          let next: LocalSnapshot
          try {
            mutation = change(structuredClone(before))
            const result: unknown = mutation.result
            if (
              result !== null &&
              (typeof result === 'object' || typeof result === 'function') &&
              'then' in result &&
              typeof result.then === 'function'
            ) {
              throw new TypeError(
                'El resultado transaccional debe ser síncrono; no se permiten promesas externas.',
              )
            }
            const identity = localIdentitySchema.parse(
              mutation.snapshot.identity,
            )
            if (
              identity.userId !== before.identity.userId ||
              identity.createdAt !== before.identity.createdAt
            ) {
              throw new ZodError([
                {
                  code: 'custom',
                  path: ['identity'],
                  message:
                    'La mutación musical no puede cambiar la identidad local.',
                },
              ])
            }
            const catalog = catalogSchema.parse(mutation.snapshot.catalog)
            const library = createLibrarySchema({
              catalog,
              localUserId: identity.userId,
            }).parse(mutation.snapshot.library)
            next = { identity, catalog, library }
          } catch (error) {
            operationFailure =
              error instanceof Error || error instanceof ZodError
                ? error
                : new Error('Falló la operación de dominio.', { cause: error })
            throw operationFailure
          }
          try {
            await writeSnapshotChanges(this.database, before, next)
          } catch (error) {
            throw asLocalStorageError(error)
          }
          return mutation.result
        },
      )
    } catch (error) {
      if (operationFailure) throw operationFailure
      throw asLocalStorageError(error)
    }
  }

  close(): void {
    // Un open nativo bloqueado no puede cancelarse. Se cierra cuando termine.
    if (this.opening) this.closingRequested = true
    else this.database.close()
  }
}
