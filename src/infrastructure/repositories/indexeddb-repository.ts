import { ZodError } from 'zod'
import Dexie from 'dexie'
import {
  AudioError,
  audioAttachmentSchema,
  audioScope,
  validateAudioAttachments,
  verifyAudioFile,
  type AudioFile,
  type AudioLocalRepository,
  type CompleteAudioState,
} from '../../domain/audio'
import { planAudioChanges, writeAudioChanges } from '../db/audio-store'
import { catalogSchema } from '../../domain/catalog/catalog'
import { localIdentitySchema, type LocalIdentity } from '../../domain/identity'
import { createLibrarySchema } from '../../domain/library/library'
import type {
  BackupLocalRepository,
  SnapshotMutation,
  LocalSnapshot,
} from '../../domain/repositories/local-repository'
import { AuditoriumDatabase, DATABASE_VERSION } from '../db/database'
import { asLocalStorageError, LocalStorageError } from '../db/errors'
import { checkNativeSchema } from '../db/preflight'
import { writeSnapshotChanges } from '../db/write-changes'
import {
  canonical,
  sameSnapshot,
  syncCheckpointSchema,
  type SyncCheckpoint,
  type SyncFrame,
  type SyncLocalRepository,
} from '../../domain/sync'
import {
  BackupError,
  isEmptySnapshot,
  localSnapshotSchema,
} from '../../domain/backup'
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

export class IndexedDbRepository
  implements BackupLocalRepository, SyncLocalRepository, AudioLocalRepository
{
  private readonly database: AuditoriumDatabase
  private readonly createId: () => string
  private readonly now: () => Date
  private opening: Promise<void> | undefined
  private openingBlocked = false
  private closingRequested = false
  private listeners = new Set<() => void>()
  subscribeChanges = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private notifyChanged() {
    queueMicrotask(() => this.listeners.forEach((listener) => listener()))
  }

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
        albumGenreRatings,
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
        this.database.albumGenreRatings.toArray(),
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
        albumGenreRatings,
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
      const result = await this.database.transaction(
        'rw',
        this.database.tables,
        async () => {
          const before = await this.readInsideTransaction()
          const storedAudio = await this.database.audioAttachments.toArray()
          let audioPlan: ReturnType<typeof planAudioChanges>
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
            audioPlan = planAudioChanges(next, storedAudio, mutation.audio)
          } catch (error) {
            operationFailure =
              error instanceof Error || error instanceof ZodError
                ? error
                : new Error('Falló la operación de dominio.', { cause: error })
            throw operationFailure
          }
          try {
            await writeSnapshotChanges(this.database, before, next)
            await writeAudioChanges(this.database, audioPlan)
          } catch (error) {
            throw asLocalStorageError(error)
          }
          return mutation.result
        },
      )
      this.notifyChanged()
      return result
    } catch (error) {
      if (operationFailure) throw operationFailure
      throw asLocalStorageError(error)
    }
  }

  async restoreEmpty(
    snapshotInput: LocalSnapshot,
    expectedIdentityInput: LocalIdentity,
    files: AudioFile[] = [],
    signal?: AbortSignal,
  ): Promise<LocalSnapshot> {
    // Validar antes de abrir o inicializar el destino.
    const next = localSnapshotSchema.parse(snapshotInput)
    const expected = localIdentitySchema.parse(expectedIdentityInput)
    validateAudioAttachments(
      next,
      files.map((file) => file.attachment),
    )
    if (
      files.some(
        (file) =>
          !(file.bytes instanceof Uint8Array) ||
          file.bytes.byteLength !== file.attachment.size,
      )
    )
      throw new AudioError(
        'integrity',
        'El tamaño de los archivos no coincide con sus metadatos.',
      )
    const preparedFiles = files.map((file) => ({
      attachment: audioAttachmentSchema.parse(file.attachment),
      bytes: new Uint8Array(file.bytes),
    }))
    for (const file of preparedFiles) await verifyAudioFile(file, signal)
    signal?.throwIfAborted()
    await this.openDatabase()
    let stopAbort = () => {}
    try {
      return await this.database.transaction(
        'rw',
        this.database.tables,
        async () => {
          const transaction = Dexie.currentTransaction
          const abort = () => {
            if (transaction.active) transaction.abort()
          }
          signal?.addEventListener('abort', abort, { once: true })
          stopAbort = () => signal?.removeEventListener('abort', abort)
          signal?.throwIfAborted()
          const before = await this.readInsideTransaction()
          if (
            !isEmptySnapshot(before) ||
            (await this.database.metadata.count()) !== 1 ||
            (await this.database.audioAttachments.count()) !== 0 ||
            (await this.database.audioFiles.count()) !== 0
          )
            throw new BackupError(
              'not_empty',
              'La biblioteca debe estar completamente vacía para restaurar.',
            )
          if (
            before.identity.userId !== expected.userId ||
            before.identity.createdAt !== expected.createdAt
          )
            throw new BackupError(
              'destination_changed',
              'La identidad del destino cambió después de leerla.',
            )
          await this.database.metadata.put({
            key: IDENTITY_KEY,
            ...next.identity,
          })
          await writeSnapshotChanges(this.database, before, next)
          if (preparedFiles.length) {
            await this.database.audioFiles.bulkAdd(
              preparedFiles.map(({ attachment, bytes }) => ({
                scope: attachment.scope,
                id: attachment.id,
                bytes,
              })),
            )
            await this.database.audioAttachments.bulkAdd(
              preparedFiles.map((file) => file.attachment),
            )
          }
          signal?.throwIfAborted()
          return next
        },
      )
    } catch (error) {
      if (signal?.aborted)
        throw new LocalStorageError(
          'aborted',
          'La restauración se canceló. La biblioteca anterior se conserva.',
          error,
        )
      if (error instanceof BackupError) throw error
      throw asLocalStorageError(error)
    } finally {
      stopAbort()
    }
  }

  async readAudioAttachments() {
    await this.open()
    return this.database.transaction('r', this.database.tables, async () =>
      validateAudioAttachments(
        await this.readInsideTransaction(),
        await this.database.audioAttachments.toArray(),
      ),
    )
  }
  async readAudioFile(id: string): Promise<AudioFile> {
    await this.open()
    return this.database.transaction('r', this.database.tables, async () => {
      const snapshot = await this.readInsideTransaction()
      const scope = audioScope(snapshot.identity)
      const row = await this.database.audioAttachments.get([scope, id])
      if (!row)
        throw new AudioError(
          'missing',
          'El archivo no está disponible en esta biblioteca local. Vuelve a seleccionarlo o restaura un respaldo completo.',
        )
      const attachment = audioAttachmentSchema.parse(row)
      validateAudioAttachments(snapshot, [attachment])
      const file = await this.database.audioFiles.get([scope, id])
      if (!file || !(file.bytes instanceof Uint8Array))
        throw new AudioError(
          'missing',
          'Archivo no disponible en este dispositivo. Vuelve a seleccionarlo o restaura un respaldo completo.',
        )
      return { attachment, bytes: file.bytes }
    })
  }
  async readCompleteAudio(): Promise<CompleteAudioState> {
    await this.open()
    return this.database.transaction('r', this.database.tables, async () => {
      const snapshot = await this.readInsideTransaction()
      const attachments = validateAudioAttachments(
        snapshot,
        await this.database.audioAttachments.toArray(),
      )
      const rows = await this.database.audioFiles.toArray()
      if (rows.length !== attachments.length)
        throw new AudioError(
          'integrity',
          'Hay archivos ausentes o sin asociación. Resuelve el audio local antes de exportar un respaldo completo.',
        )
      const files = attachments.map((attachment) => {
        const row = rows.find(
          (file) =>
            file.scope === attachment.scope && file.id === attachment.id,
        )
        if (!row || !(row.bytes instanceof Uint8Array))
          throw new AudioError(
            'missing',
            'Falta un archivo de audio. No se puede generar un respaldo completo; vuelve a seleccionarlo.',
          )
        return { attachment, bytes: row.bytes }
      })
      return { snapshot, files }
    })
  }
  async restoreCompleteAudio(
    state: CompleteAudioState,
    expected: LocalIdentity,
    signal?: AbortSignal,
  ) {
    return this.restoreEmpty(state.snapshot, expected, state.files, signal)
  }
  async clearLocalAudio(expected: LocalIdentity, signal?: AbortSignal) {
    signal?.throwIfAborted()
    await this.open()
    let stopAbort = () => {}
    try {
      await this.database.transaction('rw', this.database.tables, async () => {
        const transaction = Dexie.currentTransaction
        const abort = () => {
          if (transaction.active) transaction.abort()
        }
        signal?.addEventListener('abort', abort, { once: true })
        stopAbort = () => signal?.removeEventListener('abort', abort)
        signal?.throwIfAborted()
        const snapshot = await this.readInsideTransaction()
        if (canonical(snapshot.identity) !== canonical(expected))
          throw new AudioError(
            'scope',
            'La identidad local cambió. Vuelve a abrir los respaldos antes de eliminar audio.',
          )
        const scope = audioScope(snapshot.identity)
        await this.database.audioAttachments
          .where('scope')
          .equals(scope)
          .delete()
        await this.database.audioFiles.where('scope').equals(scope).delete()
        signal?.throwIfAborted()
      })
    } finally {
      stopAbort()
    }
    this.notifyChanged()
  }

  close(): void {
    // Un open nativo bloqueado no puede cancelarse. Se cierra cuando termine.
    if (this.opening) this.closingRequested = true
    else this.database.close()
  }

  async readSyncFrame(): Promise<SyncFrame> {
    await this.open()
    return this.database.transaction('r', this.database.tables, async () => ({
      snapshot: await this.readInsideTransaction(),
      checkpoint: syncCheckpointSchema.parse(
        (await this.database.syncCheckpoint.get('cloud')) ?? {
          key: 'cloud',
          revision: 0,
        },
      ),
    }))
  }

  async applySyncFrame(
    expected: SyncFrame,
    input: LocalSnapshot,
    checkpoint: SyncCheckpoint,
  ): Promise<void> {
    const next = localSnapshotSchema.parse(input)
    const nextCheckpoint = syncCheckpointSchema.parse(checkpoint)
    await this.open()
    await this.database.transaction('rw', this.database.tables, async () => {
      const before = await this.readInsideTransaction()
      const previous = (await this.database.syncCheckpoint.get('cloud')) ?? {
        key: 'cloud',
        revision: 0,
      }
      if (
        !sameSnapshot(before, expected.snapshot) ||
        canonical(previous) !== canonical(expected.checkpoint)
      )
        throw new Error(
          'La biblioteca cambió durante la sincronización. Vuelve a intentar.',
        )
      await this.database.metadata.put({ key: IDENTITY_KEY, ...next.identity })
      if (
        audioScope(before.identity) !== audioScope(next.identity) &&
        (await this.database.audioFiles.count())
      )
        throw new AudioError(
          'scope',
          'Esta biblioteca tiene audio local. Guarda un respaldo completo y resuelve sus archivos antes de adoptar otra identidad.',
        )
      validateAudioAttachments(
        next,
        await this.database.audioAttachments.toArray(),
      )
      await writeSnapshotChanges(this.database, before, next)
      await this.database.syncCheckpoint.put(nextCheckpoint)
    })
  }
}
