import { isEmptySnapshot } from '../domain/backup'
import {
  canonical,
  mergeSnapshots,
  sameSnapshot,
  SyncConflict,
  type RemoteLibrary,
  type RemoteLibraryRepository,
  type SyncFrame,
  type SyncLocalRepository,
} from '../domain/sync'

export interface SyncStatus {
  phase: 'idle' | 'syncing' | 'synced' | 'error' | 'conflict'
  message: string
  conflict?: { frame: SyncFrame; remote: RemoteLibrary }
}

/** A durable snapshot + checkpoint is the outbox; no network I/O enters a local transaction. */
export class LibrarySync {
  private state: SyncStatus = {
    phase: 'idle',
    message: 'Lista para sincronizar.',
  }
  private listeners = new Set<() => void>()
  private running: Promise<void> | undefined
  private requested = false
  private stopped = false
  private readonly local: SyncLocalRepository
  private readonly remote: RemoteLibraryRepository
  private readonly changed: () => void
  private readonly canApply: () => boolean
  constructor(
    local: SyncLocalRepository,
    remote: RemoteLibraryRepository,
    changed: () => void = () => {},
    canApply: () => boolean = () => true,
  ) {
    this.local = local
    this.remote = remote
    this.changed = changed
    this.canApply = canApply
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  stop() {
    this.stopped = true
  }
  markDirty() {
    if (this.state.phase !== 'conflict' && this.state.phase !== 'syncing')
      this.update({
        phase: 'idle',
        message:
          'Cambios guardados en este dispositivo. Pendientes de sincronizar.',
      })
  }
  private update(next: SyncStatus) {
    if (this.stopped) return
    this.state = next
    this.listeners.forEach((listener) => listener())
  }
  sync = (): Promise<void> => {
    if (this.stopped) return Promise.resolve()
    this.requested = true
    if (this.running) return this.running
    this.running = this.drain().finally(() => {
      this.running = undefined
    })
    return this.running
  }
  private async drain() {
    do {
      this.requested = false
      await this.perform()
    } while (this.requested && !this.stopped)
  }
  private async perform() {
    this.update({ phase: 'syncing', message: 'Sincronizando biblioteca…' })
    try {
      // A second pass sends edits committed locally while a previous request was in flight.
      for (let pass = 0; pass < 3 && !this.stopped; pass++) {
        const frame = await this.local.readSyncFrame()
        const pending = frame.checkpoint.pending
        if (pending) {
          let saved: RemoteLibrary
          try {
            saved = await this.remote.save(pending)
          } catch (error) {
            if (!(error instanceof SyncConflict)) throw error
            const latest = await this.remote.load()
            if (!latest) throw error
            this.update({
              phase: 'conflict',
              message: error.message,
              conflict: { frame, remote: latest },
            })
            return
          }
          if (this.stopped || !this.canApply()) return
          const fresh = await this.local.readSyncFrame()
          if (canonical(fresh.checkpoint) !== canonical(frame.checkpoint))
            throw new Error(
              'Otra pestaña está sincronizando. Vuelve a intentar.',
            )
          let next
          try {
            next = mergeSnapshots(
              pending.localSnapshot,
              fresh.snapshot,
              saved.snapshot,
            )
          } catch {
            this.update({
              phase: 'conflict',
              message: new SyncConflict().message,
              conflict: { frame: fresh, remote: saved },
            })
            return
          }
          await this.local.applySyncFrame(fresh, next, {
            key: 'cloud',
            revision: saved.revision,
            base: saved.snapshot,
            ...(frame.checkpoint.recovery
              ? { recovery: frame.checkpoint.recovery }
              : {}),
          })
          this.changed()
          if (sameSnapshot(next, saved.snapshot)) break
          continue
        }
        const remote = await this.remote.load()
        if (this.stopped || !this.canApply()) return
        if (!remote && isEmptySnapshot(frame.snapshot)) break
        let next = frame.snapshot
        if (remote) {
          try {
            next = frame.checkpoint.base
              ? mergeSnapshots(
                  frame.checkpoint.base,
                  frame.snapshot,
                  remote.snapshot,
                )
              : isEmptySnapshot(frame.snapshot) ||
                  sameSnapshot(frame.snapshot, remote.snapshot)
                ? remote.snapshot
                : (() => {
                    throw new SyncConflict()
                  })()
          } catch {
            this.update({
              phase: 'conflict',
              message: new SyncConflict().message,
              conflict: { frame, remote },
            })
            return
          }
        }
        if (remote && sameSnapshot(next, remote.snapshot)) {
          if (
            frame.checkpoint.revision === remote.revision &&
            sameSnapshot(frame.snapshot, next)
          )
            break
          await this.local.applySyncFrame(frame, next, {
            ...frame.checkpoint,
            revision: remote.revision,
            base: remote.snapshot,
          })
          if (!sameSnapshot(frame.snapshot, next)) this.changed()
          break
        }
        await this.local.applySyncFrame(frame, frame.snapshot, {
          ...frame.checkpoint,
          pending: {
            operationId: crypto.randomUUID(),
            expectedRevision: remote?.revision ?? 0,
            snapshot: next,
            localSnapshot: frame.snapshot,
          },
        })
      }
      const final = await this.local.readSyncFrame()
      this.update(
        final.checkpoint.pending ||
          (final.checkpoint.base &&
            !sameSnapshot(final.snapshot, final.checkpoint.base))
          ? {
              phase: 'idle',
              message:
                'Hay cambios guardados en este dispositivo pendientes de sincronizar.',
            }
          : { phase: 'synced', message: 'Biblioteca sincronizada.' },
      )
    } catch {
      this.update({
        phase: 'error',
        message:
          'No se pudo completar la sincronización. Los cambios siguen guardados en este dispositivo; vuelve a intentar con conexión.',
      })
    }
  }
  async resolve(choice: 'local' | 'remote') {
    const conflict = this.state.conflict
    if (!conflict || this.running || this.stopped) return
    const { frame, remote } = conflict
    const recovery = { local: frame.snapshot, remote: remote.snapshot }
    // Preserve both originals atomically before either copy can be replaced.
    await this.local.applySyncFrame(
      frame,
      choice === 'remote' ? remote.snapshot : frame.snapshot,
      {
        key: 'cloud',
        revision: remote.revision,
        base: remote.snapshot,
        recovery,
        ...(choice === 'local'
          ? {
              pending: {
                operationId: crypto.randomUUID(),
                expectedRevision: remote.revision,
                snapshot: frame.snapshot,
                localSnapshot: frame.snapshot,
              },
            }
          : {}),
      },
    )
    this.changed()
    await this.sync()
  }
}
