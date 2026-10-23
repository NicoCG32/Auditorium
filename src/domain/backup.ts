import { z } from 'zod'
import { catalogSchema } from './catalog/catalog'
import { artistSchema, catalogDataSchema } from './catalog/schemas'
import {
  legacyAlbumV4Schema,
  migrateLegacyAlbum,
} from './catalog/legacy-classification'
import { localIdentitySchema } from './identity'
import {
  albumRatingSchema,
  libraryDataSchema,
  userAlbumSchema,
} from './library/schemas'
import { getLibraryIssues } from './library/integrity'
import { ownedItemSchema } from './library/owned-items'
import { purchaseWishSchema } from './library/purchase-wishes'
import { utcTimestampSchema } from './shared/scalars'
import type { LocalSnapshot } from './repositories/local-repository'

export const BACKUP_SCHEMA_VERSION = 6
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

const legacyAlbumSchema = legacyAlbumV4Schema.omit({
  genres: true,
  coverImage: true,
})
const legacyUserAlbumSchema = z.strictObject({
  id: userAlbumSchema.shape.id,
  userId: userAlbumSchema.shape.userId,
  albumId: userAlbumSchema.shape.albumId,
  listeningStatus: userAlbumSchema.shape.listeningStatus,
  personalNotes: userAlbumSchema.shape.personalNotes,
  addedAt: userAlbumSchema.shape.addedAt,
  updatedAt: userAlbumSchema.shape.updatedAt,
  deletedAt: userAlbumSchema.shape.deletedAt,
})
export const legacyAlbumRatingSchema = z.strictObject({
  userAlbumId: albumRatingSchema.shape.userAlbumId,
  scoreUnits: albumRatingSchema.shape.scoreUnits,
  updatedAt: albumRatingSchema.shape.updatedAt,
})
const legacyRatingsLibrarySchema = localSnapshotSchema.shape.library.extend({
  albumRatings: z.array(legacyAlbumRatingSchema),
})
const legacyLibrarySchema = legacyRatingsLibrarySchema.extend({
  userAlbums: z.array(legacyUserAlbumSchema),
})
export const legacySnapshotV3Schema = z.strictObject({
  ...localSnapshotSchema.shape,
  library: legacyLibrarySchema,
  catalog: catalogDataSchema.extend({ albums: z.array(legacyAlbumV4Schema) }),
})
export const legacySnapshotV4Schema = z.strictObject({
  ...localSnapshotSchema.shape,
  library: legacyRatingsLibrarySchema,
  catalog: catalogDataSchema.extend({ albums: z.array(legacyAlbumV4Schema) }),
})
export const legacySnapshotV5Schema = z.strictObject({
  ...localSnapshotSchema.shape,
  library: legacyRatingsLibrarySchema,
})
const legacyBackupV5Schema = z.strictObject({
  format: z.literal('auditorium-backup'),
  schemaVersion: z.literal(5),
  exportedAt: utcTimestampSchema,
  data: legacySnapshotV5Schema,
})
const legacyBackupV4Schema = z.strictObject({
  format: z.literal('auditorium-backup'),
  schemaVersion: z.literal(4),
  exportedAt: utcTimestampSchema,
  data: legacySnapshotV4Schema,
})
export function migrateLegacySnapshot(input: unknown): LocalSnapshot {
  const legacy = legacySnapshotV4Schema.parse(input)
  return localSnapshotSchema.parse({
    ...legacy,
    catalog: {
      ...legacy.catalog,
      albums: legacy.catalog.albums.map(migrateLegacyAlbum),
    },
  })
}
const legacyBackupV3Schema = z.strictObject({
  format: z.literal('auditorium-backup'),
  schemaVersion: z.literal(3),
  exportedAt: utcTimestampSchema,
  data: legacySnapshotV3Schema,
})
const legacyData = z.strictObject({
  ...localSnapshotSchema.shape,
  library: legacyLibrarySchema,
  catalog: catalogDataSchema.extend({
    artists: z.array(artistSchema.omit({ country: true })),
    albums: z.array(legacyAlbumSchema),
  }),
})
const legacyBackupV2Schema = z.strictObject({
  format: z.literal('auditorium-backup'),
  schemaVersion: z.literal(2),
  exportedAt: utcTimestampSchema,
  data: legacyData,
})
const legacyBackupV1Schema = z.strictObject({
  format: z.literal('auditorium-backup'),
  schemaVersion: z.literal(1),
  exportedAt: utcTimestampSchema,
  data: legacyData.extend({
    catalog: legacyData.shape.catalog.extend({
      albums: z.array(legacyAlbumSchema.omit({ catalogReference: true })),
    }),
  }),
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
    input.schemaVersion !== BACKUP_SCHEMA_VERSION &&
    input.schemaVersion !== 1 &&
    input.schemaVersion !== 2 &&
    input.schemaVersion !== 3 &&
    input.schemaVersion !== 4 &&
    input.schemaVersion !== 5
  )
    throw new BackupError(
      'unsupported_version',
      'La versión del respaldo no es compatible.',
    )
  let document: unknown = input
  if (
    input &&
    typeof input === 'object' &&
    'schemaVersion' in input &&
    (input.schemaVersion === 1 ||
      input.schemaVersion === 2 ||
      input.schemaVersion === 3 ||
      input.schemaVersion === 4 ||
      input.schemaVersion === 5)
  ) {
    const legacy = (
      input.schemaVersion === 1
        ? legacyBackupV1Schema
        : input.schemaVersion === 2
          ? legacyBackupV2Schema
          : input.schemaVersion === 3
            ? legacyBackupV3Schema
            : input.schemaVersion === 4
              ? legacyBackupV4Schema
              : legacyBackupV5Schema
    ).safeParse(input)
    if (!legacy.success)
      throw new BackupError(
        'invalid_backup',
        'El respaldo no cumple el formato o sus relaciones no son válidas.',
      )
    try {
      document = {
        ...legacy.data,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        data:
          legacy.data.schemaVersion === 5
            ? localSnapshotSchema.parse(legacy.data.data)
            : migrateLegacySnapshot(legacy.data.data),
      }
    } catch {
      throw new BackupError(
        'invalid_backup',
        'El respaldo no cumple el formato o sus relaciones no son válidas.',
      )
    }
  }
  const result = backupSchema.safeParse(document)
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
