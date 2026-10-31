import { z } from 'zod'
import { artistSchema, albumSchema } from './catalog/schemas'
import { entityIdSchema } from './shared/scalars'
import {
  checkBackupSize,
  parseBackupDocument,
  BackupError,
  serializeBackup,
} from './backup'

export const catalogImportSchema = z
  .strictObject({
    format: z.literal('auditorium-catalog'),
    schemaVersion: z.literal(1),
    artists: z
      .array(artistSchema.pick({ id: true, name: true, country: true }))
      .max(2000),
    albums: z
      .array(
        albumSchema
          .pick({
            id: true,
            title: true,
            primaryType: true,
            categories: true,
            publicationStatus: true,
            originalYear: true,
            genres: true,
            coverUrl: true,
            description: true,
          })
          .extend({ artistIds: z.array(entityIdSchema).min(1).max(50) }),
      )
      .max(5000),
  })
  .superRefine((value, context) => {
    for (const table of ['artists', 'albums'] as const) {
      const ids = new Set<string>()
      value[table].forEach((row, index) => {
        if (ids.has(row.id))
          context.addIssue({
            code: 'custom',
            path: [table, index, 'id'],
            message: 'Identificador duplicado.',
          })
        ids.add(row.id)
      })
    }
    const artists = new Set(value.artists.map((row) => row.id))
    value.albums.forEach((row, index) => {
      if (
        new Set(row.artistIds).size !== row.artistIds.length ||
        row.artistIds.some((id) => !artists.has(id))
      )
        context.addIssue({
          code: 'custom',
          path: ['albums', index, 'artistIds'],
          message: 'Los artistas deben existir y no repetirse.',
        })
    })
  })
export type CatalogImport = z.output<typeof catalogImportSchema>
export type JsonImportDocument =
  CatalogImport | ReturnType<typeof parseBackupDocument>

export function parseImportText(text: string): JsonImportDocument {
  checkBackupSize(new TextEncoder().encode(text).byteLength)
  let input: unknown
  try {
    input = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('El archivo no contiene un JSON válido.')
  }
  if (
    input &&
    typeof input === 'object' &&
    'format' in input &&
    input.format === 'auditorium-catalog'
  ) {
    const result = catalogImportSchema.safeParse(input)
    if (!result.success) {
      const first = result.error.issues[0]
      throw new Error(
        `Catálogo no válido (${first?.path.join('.') || 'documento'}): ${first?.message ?? 'Revisa el formato.'}`,
      )
    }
    checkBackupSize(
      new TextEncoder().encode(JSON.stringify(result.data)).byteLength,
    )
    return result.data
  }
  try {
    const document = parseBackupDocument(input)
    serializeBackup(document)
    return document
  } catch (error) {
    if (error instanceof BackupError) throw error
    throw new Error('El archivo no es un respaldo o catálogo compatible.', {
      cause: error,
    })
  }
}
