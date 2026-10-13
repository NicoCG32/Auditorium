import type { Catalog } from '../catalog/schemas'
import type { LocalIdentity } from '../identity'
import type { Library } from '../library/schemas'

export interface LocalSnapshot {
  identity: LocalIdentity
  catalog: Catalog
  library: Library
}

export interface LocalRepository {
  open(): Promise<LocalIdentity>
  readSnapshot(): Promise<LocalSnapshot>
  close(): void
}

export interface SnapshotMutation<T> {
  snapshot: LocalSnapshot
  result: T
}

export interface TransactionalLocalRepository extends LocalRepository {
  mutate<T>(
    change: (snapshot: LocalSnapshot) => SnapshotMutation<T>,
  ): Promise<T>
}

export interface BackupLocalRepository extends TransactionalLocalRepository {
  restoreEmpty(
    snapshot: LocalSnapshot,
    expectedIdentity: LocalIdentity,
  ): Promise<LocalSnapshot>
}
