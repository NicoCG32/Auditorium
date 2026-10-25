import { z } from 'zod'
import {
  AudioError,
  audioDigest,
  audioAttachmentSchema,
  audioItem,
  audioScope,
  MAX_AUDIO_ARCHIVE_BYTES,
  MAX_AUDIO_ATTACHMENTS,
  MAX_AUDIO_MANIFEST_BYTES,
  validateAudioAttachments,
  verifyAudioFile,
  type AudioLocalRepository,
  type CompleteAudioState,
} from '../domain/audio'
import {
  BACKUP_SCHEMA_VERSION,
  parseBackupDocument,
  parseBackupText,
  serializeBackup,
  type LibraryBackup,
} from '../domain/backup'
import { localIdentitySchema, type LocalIdentity } from '../domain/identity'
import {
  createStoredZip,
  readStoredZip,
} from '../infrastructure/browser/stored-zip'
import { sameSnapshot } from '../domain/sync'

const encoder = new TextEncoder()
const manifestSchema = z.strictObject({
  format: z.literal('auditorium-audio-backup'),
  version: z.literal(1),
  identity: localIdentitySchema,
  librarySha256: z.string().regex(/^[a-f0-9]{64}$/u),
  attachments: z
    .array(
      audioAttachmentSchema
        .omit({ scope: true })
        .extend({ path: z.string().regex(/^audio\/[a-f0-9-]{36}\.bin$/u) }),
    )
    .max(MAX_AUDIO_ATTACHMENTS),
})
export interface PreparedAudioBackup {
  document: LibraryBackup
  state: CompleteAudioState
}
export class CompleteAudioBackups {
  private readonly repository: AudioLocalRepository
  private readonly now: () => Date
  constructor(
    repository: AudioLocalRepository,
    now: () => Date = () => new Date(),
  ) {
    this.repository = repository
    this.now = now
  }
  async export(signal?: AbortSignal) {
    signal?.throwIfAborted()
    const state = await this.repository.readCompleteAudio()
    validateAudioAttachments(
      state.snapshot,
      state.files.map((file) => file.attachment),
    )
    for (const file of state.files) await verifyAudioFile(file, signal)
    const document = parseBackupDocument({
      format: 'auditorium-backup',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: this.now().toISOString(),
      data: state.snapshot,
    })
    const library = encoder.encode(serializeBackup(document))
    const manifest = manifestSchema.parse({
      format: 'auditorium-audio-backup',
      version: 1,
      identity: state.snapshot.identity,
      librarySha256: await audioDigest(library),
      attachments: state.files.map(({ attachment }) => ({
        ...audioItem(attachment),
        userAlbumId: attachment.userAlbumId,
        path: `audio/${attachment.id}.bin`,
      })),
    })
    const metadata = encoder.encode(JSON.stringify(manifest))
    if (metadata.length > MAX_AUDIO_MANIFEST_BYTES)
      throw new AudioError('limit', 'El manifiesto de audio supera 1 MiB.')
    const bytes = await createStoredZip(
      [
        { name: 'audio-manifest.json', data: metadata },
        { name: 'library.json', data: library },
        ...state.files.map((file) => ({
          name: `audio/${file.attachment.id}.bin`,
          data: file.bytes,
        })),
      ],
      signal,
    )
    return { bytes, exportedAt: document.exportedAt }
  }
  async readFile(
    file: Pick<Blob, 'size' | 'arrayBuffer'>,
    signal?: AbortSignal,
  ): Promise<PreparedAudioBackup> {
    if (file.size > MAX_AUDIO_ARCHIVE_BYTES)
      throw new AudioError('limit', 'Máximo 160 MiB para el respaldo completo.')
    signal?.throwIfAborted()
    const entries = await readStoredZip(
      new Uint8Array(await file.arrayBuffer()),
      signal,
    )
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true })
      const manifest = manifestSchema.parse(
        JSON.parse(decoder.decode(entries.get('audio-manifest.json'))),
      )
      const library = entries.get('library.json')!
      if ((await audioDigest(library)) !== manifest.librarySha256)
        throw new AudioError(
          'integrity',
          'El hash de la biblioteca no coincide con el manifiesto.',
        )
      const document = parseBackupText(decoder.decode(library))
      if (
        JSON.stringify(manifest.identity) !==
        JSON.stringify(document.data.identity)
      )
        throw new AudioError(
          'scope',
          'El manifiesto y la biblioteca tienen identidades diferentes.',
        )
      if (entries.size !== manifest.attachments.length + 2)
        throw new AudioError(
          'invalid_archive',
          'El paquete contiene archivos que no están declarados en el manifiesto.',
        )
      const scope = audioScope(document.data.identity)
      const files = manifest.attachments.map(({ path, ...metadata }) => {
        if (path !== `audio/${metadata.id}.bin` || !entries.has(path))
          throw new AudioError(
            'invalid_archive',
            'Falta un archivo declarado o su ruta no coincide.',
          )
        return {
          attachment: audioAttachmentSchema.parse({ ...metadata, scope }),
          bytes: entries.get(path)!,
        }
      })
      validateAudioAttachments(
        document.data,
        files.map((item) => item.attachment),
      )
      for (const item of files) await verifyAudioFile(item, signal)
      signal?.throwIfAborted()
      return { document, state: { snapshot: document.data, files } }
    } catch (error) {
      if (
        error instanceof AudioError ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        throw error
      throw new AudioError(
        'invalid_archive',
        'El manifiesto o la biblioteca del respaldo completo no es válido. No se restauró ningún dato.',
      )
    }
  }
  async restore(
    backup: PreparedAudioBackup,
    expected: LocalIdentity,
    signal?: AbortSignal,
  ) {
    const document = parseBackupDocument(backup.document)
    serializeBackup(document)
    if (!sameSnapshot(document.data, backup.state.snapshot))
      throw new AudioError(
        'integrity',
        'La biblioteca preparada cambió después de validar el respaldo. Vuelve a seleccionar el ZIP.',
      )
    return this.repository.restoreCompleteAudio(backup.state, expected, signal)
  }
}
