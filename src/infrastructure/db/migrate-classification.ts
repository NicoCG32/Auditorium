import { z } from 'zod'
import {
  legacySnapshotV4Schema,
  migrateLegacySnapshotToV6,
} from '../../domain/backup'
import { legacySyncCheckpointV6Schema } from '../../domain/sync'

const historicalCheckpointSchema = legacySyncCheckpointV6Schema.extend({
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
  return legacySyncCheckpointV6Schema.parse({
    ...old,
    ...(old.base ? { base: migrateLegacySnapshotToV6(old.base) } : {}),
    ...(old.pending
      ? {
          pending: {
            ...old.pending,
            snapshot: migrateLegacySnapshotToV6(old.pending.snapshot),
            localSnapshot: migrateLegacySnapshotToV6(old.pending.localSnapshot),
          },
        }
      : {}),
    ...(old.recovery
      ? {
          recovery: {
            local: migrateLegacySnapshotToV6(old.recovery.local),
            remote: migrateLegacySnapshotToV6(old.recovery.remote),
          },
        }
      : {}),
  })
}
