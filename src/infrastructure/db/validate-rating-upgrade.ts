import { z } from 'zod'
import { legacySnapshotV5Schema } from '../../domain/backup'
import { legacySyncCheckpointV6Schema } from '../../domain/sync'

const historicalCheckpointSchema = legacySyncCheckpointV6Schema.extend({
  base: legacySnapshotV5Schema.optional(),
  pending: z
    .strictObject({
      operationId: z.uuid(),
      expectedRevision: z.number().int().nonnegative(),
      snapshot: legacySnapshotV5Schema,
      localSnapshot: legacySnapshotV5Schema,
    })
    .optional(),
  recovery: z
    .strictObject({
      local: legacySnapshotV5Schema,
      remote: legacySnapshotV5Schema,
    })
    .optional(),
})
export function validateRatingUpgradeCheckpoint(input: unknown) {
  return legacySyncCheckpointV6Schema.parse(
    historicalCheckpointSchema.parse(input),
  )
}
