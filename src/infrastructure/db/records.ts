import { z } from 'zod'
import { localIdentitySchema } from '../../domain/identity'
import { userAlbumSchema, type UserAlbum } from '../../domain/library/schemas'
import { LocalStorageError } from './errors'

export const IDENTITY_KEY = 'local_identity' as const
export const identityRecordSchema = localIdentitySchema.extend({
  key: z.literal(IDENTITY_KEY),
})
export type IdentityRecord = z.output<typeof identityRecordSchema>

const storedUserAlbumSchema = userAlbumSchema.safeExtend({
  activeAlbumKey: z.string().nullable(),
})
export type StoredUserAlbum = z.output<typeof storedUserAlbumSchema>

function activeKey(entry: UserAlbum): string | null {
  return entry.deletedAt === undefined
    ? `${entry.userId}:${entry.albumId}`
    : null
}

export function toStoredUserAlbum(input: unknown): StoredUserAlbum {
  const entry = userAlbumSchema.parse(input)
  return { ...entry, activeAlbumKey: activeKey(entry) }
}

export function fromStoredUserAlbum(input: unknown): UserAlbum {
  const { activeAlbumKey, ...entry } = storedUserAlbumSchema.parse(input)
  if (activeAlbumKey !== activeKey(entry)) {
    throw new LocalStorageError(
      'corrupt_data',
      'El índice de entrada activa no coincide con sus datos.',
    )
  }
  return entry
}
