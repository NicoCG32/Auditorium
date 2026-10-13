import { z } from 'zod'
import { catalogSchema } from './catalog/catalog'
import { localIdentitySchema } from './identity'
import { libraryDataSchema } from './library/schemas'
import { getLibraryIssues } from './library/integrity'
import { ownedItemSchema } from './library/owned-items'
import { purchaseWishSchema } from './library/purchase-wishes'
import { utcTimestampSchema } from './shared/scalars'
import type { LocalSnapshot } from './repositories/local-repository'

export const BACKUP_SCHEMA_VERSION = 1
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024

export const localSnapshotSchema = z
  .strictObject({
    identity: localIdentitySchema,
    catalog: catalogSchema,
    library: libraryDataSchema.extend({
      ownedItems: z.array(ownedItemSchema),
      purchaseWishes: z.array(purchaseWishSchema),
    }),
  })
  .superRefine((snapshot, context) => {
    for (const issue of getLibraryIssues(
      snapshot.catalog,
      snapshot.library,
      snapshot.identity.userId,
    )) {
      context.addIssue({
        code: 'custom',
        path: ['library', ...issue.path],
        message: issue.message,
        params: { rule: issue.rule },
      })
    }
  })

export const backupSchema = z.strictObject({
  format: z.literal('auditorium-backup'),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: utcTimestampSchema,
  data: localSnapshotSchema,
})
export type LibraryBackup = z.output<typeof backupSchema>
export type BackupCode =
  | 'empty_file'
  | 'file_too_large'
  | 'invalid_json'
  | 'unsupported_version'
  | 'invalid_backup'
  | 'not_empty'
  | 'destination_changed'
export class BackupError extends Error {
  readonly code: BackupCode
  constructor(code: BackupCode, message: string) {
    super(message)
    this.name = 'BackupError'
    this.code = code
  }
}

export function isEmptySnapshot(snapshot: LocalSnapshot): boolean {
  return (
    Object.values(snapshot.catalog).every((rows) => rows.length === 0) &&
    Object.values(snapshot.library).every((rows) => rows.length === 0)
  )
}

export function parseBackupDocument(input: unknown): LibraryBackup {
  if (
    input &&
    typeof input === 'object' &&
    'format' in input &&
    input.format === 'auditorium-backup' &&
    'schemaVersion' in input &&
    input.schemaVersion !== BACKUP_SCHEMA_VERSION
  )
    throw new BackupError(
      'unsupported_version',
      'La versión del respaldo no es compatible.',
    )
  const result = backupSchema.safeParse(input)
  if (!result.success)
    throw new BackupError(
      'invalid_backup',
      'El respaldo no cumple el formato o sus relaciones no son válidas.',
    )
  return result.data
}

export function checkBackupSize(bytes: number) {
  if (bytes === 0) throw new BackupError('empty_file', 'El archivo está vacío.')
  if (bytes > MAX_BACKUP_BYTES)
    throw new BackupError(
      'file_too_large',
      'El respaldo supera el límite de 20 MiB.',
    )
}

export function parseBackupText(text: string): LibraryBackup {
  checkBackupSize(new TextEncoder().encode(text).byteLength)
  let input: unknown
  try {
    input = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new BackupError('invalid_json', 'El archivo no contiene JSON válido.')
  }
  return parseBackupDocument(input)
}

export function serializeBackup(input: unknown): string {
  const text = JSON.stringify(parseBackupDocument(input), null, 2) + '\n'
  checkBackupSize(new TextEncoder().encode(text).byteLength)
  return text
}
