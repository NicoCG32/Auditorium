import { migrateSnapshotV6 } from '../../domain/backup'
import {
  legacySyncCheckpointV6Schema,
  syncCheckpointSchema,
} from '../../domain/sync'

export function migrateGenreRatingsCheckpoint(input: unknown) {
  const legacy = legacySyncCheckpointV6Schema.parse(input)
  return syncCheckpointSchema.parse({
    ...legacy,
    ...(legacy.base ? { base: migrateSnapshotV6(legacy.base) } : {}),
    ...(legacy.pending
      ? {
          pending: {
            ...legacy.pending,
            snapshot: migrateSnapshotV6(legacy.pending.snapshot),
            localSnapshot: migrateSnapshotV6(legacy.pending.localSnapshot),
          },
        }
      : {}),
    ...(legacy.recovery
      ? {
          recovery: {
            local: migrateSnapshotV6(legacy.recovery.local),
            remote: migrateSnapshotV6(legacy.recovery.remote),
          },
        }
      : {}),
  })
}
