import { z } from 'zod'
import type { LocalIdentity } from './identity'
import type {
  BackupLocalRepository,
  TransactionalLocalRepository,
  LocalSnapshot,
} from './repositories/local-repository'

export const MAX_AUDIO_FILE_BYTES = 16 * 1024 * 1024
export const MAX_AUDIO_BYTES = 128 * 1024 * 1024
export const MAX_AUDIO_ATTACHMENTS = 128
export const MAX_AUDIO_ARCHIVE_BYTES = 160 * 1024 * 1024
export const MAX_AUDIO_MANIFEST_BYTES = 1024 * 1024

export class AudioError extends Error {
  readonly code:
    | 'invalid_file'
    | 'limit'
    | 'conflict'
    | 'reference'
    | 'missing'
    | 'integrity'
    | 'scope'
    | 'unsupported'
    | 'invalid_archive'
  constructor(code: AudioError['code'], message: string) {
    super(message)
    this.code = code
    this.name = 'AudioError'
  }
}
export const audioItemSchema = z.strictObject({
  id: z.uuid(),
  name: z
    .string()
    .min(1)
    .max(255)
    .refine((value) =>
      [...value].every(
        (char) =>
          char.charCodeAt(0) >= 32 &&
          char.charCodeAt(0) !== 127 &&
          char.charCodeAt(0) !== 92 &&
          char !== '/',
      ),
    ),
  size: z.number().int().positive().max(MAX_AUDIO_FILE_BYTES),
  mime: z.enum([
    'audio/wav',
    'audio/mpeg',
    'audio/flac',
    'audio/ogg',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
  ]),
  container: z.enum([
    'WAV',
    'MPEG audio',
    'FLAC',
    'Ogg',
    'Ogg/Opus',
    'WebM',
    'MP4',
    'ADTS/AAC',
  ]),
  duration: z.number().finite().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  trackId: z.uuid().optional(),
})
export const audioAttachmentSchema = audioItemSchema.extend({
  scope: z.string().min(1).max(150),
  userAlbumId: z.uuid(),
})
export type AudioItem = z.output<typeof audioItemSchema>
export type AudioAttachment = z.output<typeof audioAttachmentSchema>
export type AudioDraftItem = AudioItem & { bytes?: Uint8Array }
export interface AudioDraft {
  scope: string
  base: AudioAttachment[]
  items: AudioDraftItem[]
}
export interface AudioChange {
  scope: string
  userAlbumId: string
  expected: AudioAttachment[]
  items: AudioDraftItem[]
  mode: 'replace' | 'append'
}
export interface AudioFileRecord {
  scope: string
  id: string
  bytes: Uint8Array
}
export interface AudioFile {
  attachment: AudioAttachment
  bytes: Uint8Array
}
export interface CompleteAudioState {
  snapshot: LocalSnapshot
  files: AudioFile[]
}
export interface AudioLocalRepository extends BackupLocalRepository {
  readAudioAttachments(): Promise<AudioAttachment[]>
  readAudioFile(id: string): Promise<AudioFile>
  readCompleteAudio(): Promise<CompleteAudioState>
  restoreCompleteAudio(
    state: CompleteAudioState,
    expected: LocalIdentity,
    signal?: AbortSignal,
  ): Promise<LocalSnapshot>
  clearLocalAudio(expected: LocalIdentity, signal?: AbortSignal): Promise<void>
}
export function hasAudioRepository(
  repository: TransactionalLocalRepository,
): repository is AudioLocalRepository {
  return (
    'restoreEmpty' in repository &&
    typeof repository.restoreEmpty === 'function' &&
    'readAudioAttachments' in repository &&
    typeof repository.readAudioAttachments === 'function' &&
    'readCompleteAudio' in repository &&
    typeof repository.readCompleteAudio === 'function' &&
    'restoreCompleteAudio' in repository &&
    typeof repository.restoreCompleteAudio === 'function' &&
    'readAudioFile' in repository &&
    typeof repository.readAudioFile === 'function' &&
    'clearLocalAudio' in repository &&
    typeof repository.clearLocalAudio === 'function'
  )
}
export function audioScope(identity: LocalIdentity) {
  return `${identity.userId}:${identity.createdAt}`
}
export function audioItem(attachment: AudioItem): AudioItem {
  return audioItemSchema.parse(
    Object.fromEntries(
      Object.entries(attachment).filter(
        ([key]) => !['scope', 'userAlbumId', 'bytes'].includes(key),
      ),
    ),
  )
}
export function audioToken(items: AudioItem[]) {
  return JSON.stringify(
    items
      .map((item) => audioItemSchema.parse(item))
      .sort((a, b) => a.id.localeCompare(b.id)),
  )
}
export function audioDraftDirty(draft: AudioDraft) {
  return (
    audioToken(draft.base.map(audioItem)) !==
    audioToken(draft.items.map(audioItem))
  )
}
export function bindAudioDraft(
  snapshot: LocalSnapshot,
  entry: string,
  draft: AudioDraft,
  mode: AudioChange['mode'] = 'replace',
): AudioChange {
  if (draft.scope !== audioScope(snapshot.identity))
    throw new AudioError(
      'scope',
      'La biblioteca cambió mientras preparabas los archivos. Tu borrador se conserva; vuelve a abrir el álbum correcto.',
    )
  return {
    scope: audioScope(snapshot.identity),
    userAlbumId: entry,
    expected: draft.base,
    items: draft.items,
    mode,
  }
}
export function validateAudioBudget(items: Pick<AudioItem, 'size'>[]) {
  if (
    items.length > MAX_AUDIO_ATTACHMENTS ||
    items.reduce((sum, item) => sum + item.size, 0) > MAX_AUDIO_BYTES
  )
    throw new AudioError(
      'limit',
      'Máximo 128 adjuntos y 128 MiB de audio por biblioteca en este dispositivo.',
    )
  if (
    items.some(
      (item) =>
        !Number.isSafeInteger(item.size) ||
        item.size <= 0 ||
        item.size > MAX_AUDIO_FILE_BYTES,
    )
  )
    throw new AudioError(
      'limit',
      'El archivo debe tener contenido y ocupar como máximo 16 MiB.',
    )
}
export function validateAudioAttachments(
  snapshot: LocalSnapshot,
  input: AudioAttachment[],
) {
  const attachments = input.map((row) => audioAttachmentSchema.parse(row))
  validateAudioBudget(attachments)
  const ids = new Set<string>()
  for (const row of attachments) {
    if (row.scope !== audioScope(snapshot.identity))
      throw new AudioError(
        'scope',
        'Hay audio de otra identidad local. Guarda un respaldo completo y resuelve los archivos antes de cambiar la biblioteca.',
      )
    const entry = snapshot.library.userAlbums.find(
      (item) => item.id === row.userAlbumId,
    )
    if (
      !entry ||
      (row.trackId &&
        !snapshot.catalog.tracks.some(
          (track) =>
            track.id === row.trackId && track.albumId === entry.albumId,
        ))
    )
      throw new AudioError(
        'reference',
        'Un archivo de audio perdería su álbum o pista. Resuelve su asociación en Audio en este dispositivo antes de continuar.',
      )
    if (ids.has(row.id))
      throw new AudioError(
        'integrity',
        'Hay identificadores de audio repetidos.',
      )
    ids.add(row.id)
  }
  return attachments
}
export async function audioDigest(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer),
    ),
  ]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}
export async function verifyAudioFile(file: AudioFile, signal?: AbortSignal) {
  signal?.throwIfAborted()
  audioAttachmentSchema.parse(file.attachment)
  if (
    !(file.bytes instanceof Uint8Array) ||
    file.bytes.byteLength !== file.attachment.size ||
    (await audioDigest(file.bytes)) !== file.attachment.sha256
  )
    throw new AudioError(
      'integrity',
      'El audio está incompleto o no coincide con su hash. Vuelve a seleccionar el archivo o restaura un respaldo completo.',
    )
  const detected = detectAudioHeader(file.bytes.subarray(0, 128))
  if (
    detected.container !== file.attachment.container ||
    detected.mime !== file.attachment.mime
  )
    throw new AudioError(
      'integrity',
      'El formato del archivo no coincide con su manifiesto.',
    )
  signal?.throwIfAborted()
}
export async function prepareAudioDraft(
  draft: AudioDraft | undefined,
): Promise<AudioDraft | undefined> {
  if (!draft) return undefined
  const base = draft.base.map((row) => audioAttachmentSchema.parse(row))
  const items: AudioDraftItem[] = []
  validateAudioBudget(draft.items)
  for (const input of draft.items) {
    const { bytes, ...metadata } = input
    const item = audioItemSchema.parse(metadata)
    if (bytes !== undefined) {
      const copy = new Uint8Array(bytes)
      if (
        copy.byteLength !== item.size ||
        (await audioDigest(copy)) !== item.sha256
      )
        throw new AudioError(
          'integrity',
          'El archivo seleccionado cambió o está incompleto. Vuelve a seleccionarlo.',
        )
      items.push({ ...item, bytes: copy })
    } else items.push(item)
  }
  return { scope: draft.scope, base, items }
}
export function detectAudioHeader(
  bytes: Uint8Array,
): Pick<AudioItem, 'container' | 'mime'> {
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, 128))
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE')
    return { container: 'WAV', mime: 'audio/wav' }
  if (text.startsWith('fLaC')) return { container: 'FLAC', mime: 'audio/flac' }
  if (text.startsWith('OggS'))
    return {
      container: text.includes('OpusHead') ? 'Ogg/Opus' : 'Ogg',
      mime: 'audio/ogg',
    }
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return { container: 'WebM', mime: 'audio/webm' }
  if (text.slice(4, 8) === 'ftyp')
    return { container: 'MP4', mime: 'audio/mp4' }
  if (
    text.startsWith('ID3') ||
    (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 6) !== 0)
  )
    return { container: 'MPEG audio', mime: 'audio/mpeg' }
  if (bytes[0] === 0xff && (bytes[1]! & 0xf6) === 0xf0)
    return { container: 'ADTS/AAC', mime: 'audio/aac' }
  throw new AudioError(
    'invalid_file',
    'No se reconoce un contenedor de audio compatible. La extensión del archivo no basta.',
  )
}
