import { z } from 'zod'
import { audioDigest, audioScope } from './audio'
import { canonical } from './sync'
import type { LocalIdentity } from './identity'
import type { Catalog } from './catalog/schemas'
import type {
  BackupLocalRepository,
  LocalSnapshot,
  TransactionalLocalRepository,
} from './repositories/local-repository'

export const MAX_LOCAL_COVERS = 5000
export const MAX_LOCAL_COVER_BYTES = 128 * 1024 * 1024
export const MAX_OPTIMIZED_COVER_BYTES = 128 * 1024
export const MAX_COMPLETE_BACKUP_BYTES = 288 * 1024 * 1024
export const MAX_COMPLETE_MANIFEST_BYTES = 4 * 1024 * 1024
export const coverSourceSchema = z
  .string()
  .regex(
    /^https:\/\/coverartarchive\.org\/(release-group|release)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/front-500$/u,
  )
export const coverAttachmentSchema = z.strictObject({
  scope: z.string().min(1).max(150),
  albumId: z.uuid(),
  sourceUrl: coverSourceSchema,
  mime: z.literal('image/jpeg'),
  size: z.int().positive().max(MAX_OPTIMIZED_COVER_BYTES),
  width: z.int().positive().max(500),
  height: z.int().positive().max(500),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
})
export type CoverAttachment = z.output<typeof coverAttachmentSchema>
export interface CoverFile {
  attachment: CoverAttachment
  bytes: Uint8Array
}
export interface CoverFileRecord {
  scope: string
  albumId: string
  bytes: Uint8Array
}
export class CoverError extends Error {
  constructor(message = 'No pudimos guardar esta portada. Vuelve a intentar.') {
    super(message)
    this.name = 'CoverError'
  }
}
export function coverTarget(
  snapshot: {
    identity: LocalIdentity
    catalog: Pick<Catalog, 'albums' | 'albumArtists' | 'artists'>
  },
  albumId: string,
) {
  const album = snapshot.catalog.albums.find((row) => row.id === albumId)
  const credits = snapshot.catalog.albumArtists.filter(
    (row) => row.albumId === albumId,
  )
  return canonical({
    identity: snapshot.identity,
    album,
    credits: credits.toSorted((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
    artists: snapshot.catalog.artists
      .filter((row) => credits.some((credit) => credit.artistId === row.id))
      .toSorted((a, b) => a.id.localeCompare(b.id)),
  })
}
export interface CoverLocalRepository extends BackupLocalRepository {
  readCoverAttachments(): Promise<CoverAttachment[]>
  readCoverFile(
    sourceUrl: string,
    identity: LocalIdentity,
  ): Promise<CoverFile | undefined>
  saveCover(
    file: CoverFile,
    expected: string,
    signal?: AbortSignal,
  ): Promise<boolean>
}
export function hasCoverRepository(
  repository: TransactionalLocalRepository,
): repository is CoverLocalRepository {
  return (
    'readCoverAttachments' in repository &&
    typeof repository.readCoverAttachments === 'function' &&
    'readCoverFile' in repository &&
    typeof repository.readCoverFile === 'function' &&
    'saveCover' in repository &&
    typeof repository.saveCover === 'function'
  )
}
export function validateCoverAttachments(
  snapshot: LocalSnapshot,
  input: CoverAttachment[],
) {
  const rows = input.map((row) => coverAttachmentSchema.parse(row))
  checkCoverBudget(rows)
  const albums = new Map(snapshot.catalog.albums.map((row) => [row.id, row]))
  const seen = new Set<string>()
  for (const row of rows) {
    const album = albums.get(row.albumId)
    if (
      row.scope !== audioScope(snapshot.identity) ||
      !album ||
      album.coverImage ||
      album.coverUrl !== row.sourceUrl ||
      seen.has(row.albumId)
    )
      throw new CoverError(
        'Una portada no corresponde a su álbum o a esta colección.',
      )
    seen.add(row.albumId)
  }
  return rows
}
export function checkCoverBudget(rows: Pick<CoverAttachment, 'size'>[]) {
  if (
    rows.length > MAX_LOCAL_COVERS ||
    rows.reduce((size, row) => size + row.size, 0) > MAX_LOCAL_COVER_BYTES
  )
    throw new CoverError(
      'No hay espacio para más portadas en esta colección. Las portadas guardadas se conservan.',
    )
}
function jpegDimensions(bytes: Uint8Array) {
  if (bytes[0] !== 255 || bytes[1] !== 216)
    throw new CoverError('La portada no contiene una imagen JPEG válida.')
  for (let cursor = 2; cursor + 3 < bytes.length;) {
    if (bytes[cursor++] !== 255) break
    while (bytes[cursor] === 255) cursor++
    const marker = bytes[cursor++]!
    if (marker === 217 || marker === 218) break
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue
    const length = bytes[cursor]! * 256 + bytes[cursor + 1]!
    if (length < 2 || cursor + length > bytes.length) break
    if (
      [
        192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
      ].includes(marker) &&
      length >= 8
    )
      return {
        height: bytes[cursor + 3]! * 256 + bytes[cursor + 4]!,
        width: bytes[cursor + 5]! * 256 + bytes[cursor + 6]!,
      }
    cursor += length
  }
  throw new CoverError('No pudimos verificar las dimensiones de la portada.')
}
export async function verifyCoverFile(file: CoverFile, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const row = coverAttachmentSchema.parse(file.attachment)
  if (!(file.bytes instanceof Uint8Array) || file.bytes.length !== row.size)
    throw new CoverError('El archivo de portada está incompleto.')
  const dimensions = jpegDimensions(file.bytes)
  if (
    dimensions.width !== row.width ||
    dimensions.height !== row.height ||
    (await audioDigest(file.bytes)) !== row.sha256
  )
    throw new CoverError('La portada no coincide con los datos de su respaldo.')
  signal?.throwIfAborted()
}
