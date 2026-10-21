import { z } from 'zod'
import {
  legacySnapshotV4Schema,
  migrateLegacySnapshot,
} from '../../domain/backup'
import { syncCheckpointSchema } from '../../domain/sync'

const historicalCheckpointSchema = syncCheckpointSchema.extend({
  base: legacySnapshotV4Schema.optional(),
  pending: z
    .strictObject({
      operationId: z.uuid(),
      expectedRevision: z.number().int().nonnegative(),
      snapshot: legacySnapshotV4Schema,
      localSnapshot: legacySnapshotV4Schema,
    })
    .optional(),
  recovery: z
    .strictObject({
      local: legacySnapshotV4Schema,
      remote: legacySnapshotV4Schema,
    })
    .optional(),
})
export function migrateLegacyCheckpoint(input: unknown) {
  const old = historicalCheckpointSchema.parse(input)
  return syncCheckpointSchema.parse({
    ...old,
    ...(old.base ? { base: migrateLegacySnapshot(old.base) } : {}),
    ...(old.pending
      ? {
          pending: {
            ...old.pending,
            snapshot: migrateLegacySnapshot(old.pending.snapshot),
            localSnapshot: migrateLegacySnapshot(old.pending.localSnapshot),
          },
        }
      : {}),
    ...(old.recovery
      ? {
          recovery: {
            local: migrateLegacySnapshot(old.recovery.local),
            remote: migrateLegacySnapshot(old.recovery.remote),
          },
        }
      : {}),
  })
}
