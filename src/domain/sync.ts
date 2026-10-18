import { z } from 'zod'
import { localSnapshotSchema } from './backup'
import type { LocalSnapshot } from './repositories/local-repository'

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

export function sameSnapshot(a: LocalSnapshot, b: LocalSnapshot): boolean {
  const normalized = (snapshot: LocalSnapshot) => ({
    identity: snapshot.identity,
    ...Object.fromEntries(
      (['catalog', 'library'] as const).map((section) => [
        section,
        Object.fromEntries(
          Object.entries(snapshot[section] as Record<string, unknown[]>).map(
            ([table, rows]) => [
              table,
              [...rows].sort((x, y) =>
                rowKey(table, x).localeCompare(rowKey(table, y)),
              ),
            ],
          ),
        ),
      ]),
    ),
  })
  return canonical(normalized(a)) === canonical(normalized(b))
}

export class SyncConflict extends Error {
  constructor() {
    super(
      'Hay cambios incompatibles entre dispositivos. Conservamos ambas bibliotecas para que puedas elegir.',
    )
    this.name = 'SyncConflict'
  }
}

function rowKey(table: string, input: unknown): string {
  const row = input as Record<string, unknown>
  const keys =
    table === 'albumArtists'
      ? ['albumId', 'artistId', 'role']
      : table === 'coreTracks'
        ? ['albumId', 'discNumber', 'trackNumber']
        : table === 'albumRatings'
          ? ['userAlbumId']
          : table === 'trackRatings'
            ? ['userAlbumId', 'trackId']
            : ['id']
  return canonical(keys.map((key) => row[key]))
}

/** Merge whole domain records; never guess between two edits to the same record. */
export function mergeSnapshots(
  base: LocalSnapshot,
  local: LocalSnapshot,
  remote: LocalSnapshot,
): LocalSnapshot {
  if (
    canonical(local.identity) !== canonical(base.identity) ||
    canonical(remote.identity) !== canonical(base.identity)
  )
    throw new SyncConflict()
  const merged = structuredClone(local)
  for (const section of ['catalog', 'library'] as const) {
    const output: Record<string, unknown[]> = {}
    for (const table of Object.keys(base[section])) {
      const records = [base, local, remote].map((snapshot) => {
        const rows = (snapshot[section] as Record<string, unknown[]>)[table]!
        return new Map(rows.map((row) => [rowKey(table, row), row]))
      })
      const [original, ours, theirs] = records as [
        Map<string, unknown>,
        Map<string, unknown>,
        Map<string, unknown>,
      ]
      const rows: unknown[] = []
      for (const key of new Set([
        ...original.keys(),
        ...ours.keys(),
        ...theirs.keys(),
      ])) {
        const before = original.get(key),
          here = ours.get(key),
          there = theirs.get(key)
        let selected: unknown
        if (
          canonical(here) === canonical(there) ||
          canonical(there) === canonical(before)
        )
          selected = here
        else if (canonical(here) === canonical(before)) selected = there
        else throw new SyncConflict()
        if (selected !== undefined) rows.push(selected)
      }
      output[table] = rows
    }
    Object.assign(merged[section], output)
  }
  const result = localSnapshotSchema.safeParse(merged)
  if (!result.success) throw new SyncConflict()
  return result.data
}

export const remoteLibrarySchema = z.strictObject({
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  snapshot: localSnapshotSchema,
})
export type RemoteLibrary = z.output<typeof remoteLibrarySchema>

export interface PendingSync {
  operationId: string
  expectedRevision: number
  snapshot: LocalSnapshot
  localSnapshot: LocalSnapshot
}
export const syncCheckpointSchema = z.strictObject({
  key: z.literal('cloud'),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  base: localSnapshotSchema.optional(),
  pending: z
    .strictObject({
      operationId: z.uuid(),
      expectedRevision: z.number().int().nonnegative(),
      snapshot: localSnapshotSchema,
      localSnapshot: localSnapshotSchema,
    })
    .optional(),
  recovery: z
    .strictObject({ local: localSnapshotSchema, remote: localSnapshotSchema })
    .optional(),
})
export type SyncCheckpoint = z.output<typeof syncCheckpointSchema>
export interface SyncFrame {
  snapshot: LocalSnapshot
  checkpoint: SyncCheckpoint
}
export interface SyncLocalRepository {
  readSyncFrame(): Promise<SyncFrame>
  applySyncFrame(
    expected: SyncFrame,
    snapshot: LocalSnapshot,
    checkpoint: SyncCheckpoint,
  ): Promise<void>
}
export interface RemoteLibraryRepository {
  load(): Promise<RemoteLibrary | null>
  save(pending: PendingSync): Promise<RemoteLibrary>
}
