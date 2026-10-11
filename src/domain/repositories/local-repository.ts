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
