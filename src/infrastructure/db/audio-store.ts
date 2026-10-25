import {
  AudioError,
  audioAttachmentSchema,
  audioItem,
  audioItemSchema,
  audioScope,
  audioToken,
  detectAudioHeader,
  validateAudioAttachments,
  type AudioAttachment,
  type AudioChange,
  type AudioFileRecord,
} from '../../domain/audio'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import type { AuditoriumDatabase } from './database'

interface AudioPlan {
  scope: string
  removed: string[]
  attachments: AudioAttachment[]
  files: AudioFileRecord[]
}
export function planAudioChanges(
  snapshot: LocalSnapshot,
  input: AudioAttachment[],
  change?: AudioChange,
): AudioPlan | undefined {
  const current = input.map((row) => audioAttachmentSchema.parse(row))
  if (!change) {
    validateAudioAttachments(snapshot, current)
    return undefined
  }
  if (change.mode !== 'replace' && change.mode !== 'append')
    throw new AudioError(
      'integrity',
      'El modo de actualización del audio no es válido.',
    )
  const scope = audioScope(snapshot.identity)
  if (change.scope !== scope)
    throw new AudioError(
      'scope',
      'La biblioteca cambió mientras preparabas el audio. El borrador se conserva.',
    )
  const old = current.filter(
    (row) => row.scope === scope && row.userAlbumId === change.userAlbumId,
  )
  if (change.mode === 'replace') {
    const normalize = (rows: AudioAttachment[]) =>
      JSON.stringify(
        rows
          .map((row) => audioAttachmentSchema.parse(row))
          .sort((a, b) => a.id.localeCompare(b.id)),
      )
    if (normalize(old) !== normalize(change.expected))
      throw new AudioError(
        'conflict',
        'Los archivos de este álbum cambiaron en otra ventana. Tu borrador se conserva; vuelve a cargar la lista guardada antes de reemplazarla.',
      )
  }
  const files: AudioFileRecord[] = []
  const attachments = change.mode === 'append' ? [...old] : []
  for (const candidate of change.items) {
    const { bytes, ...fields } = candidate
    const item = audioItemSchema.parse(fields)
    const previous = old.find((row) => row.id === item.id)
    if (change.mode === 'append' && current.some((row) => row.id === item.id))
      throw new AudioError(
        'conflict',
        'El identificador del nuevo archivo ya existe.',
      )
    if (bytes === undefined) {
      if (
        !previous ||
        audioToken([{ ...audioItem(previous), trackId: undefined }]) !==
          audioToken([{ ...item, trackId: undefined }])
      )
        throw new AudioError(
          'missing',
          'Faltan los bytes del archivo nuevo o reemplazado. Vuelve a seleccionarlo.',
        )
    } else {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== item.size)
        throw new AudioError(
          'integrity',
          'El tamaño del audio no coincide con su contenido.',
        )
      const detected = detectAudioHeader(bytes.subarray(0, 128))
      if (detected.mime !== item.mime || detected.container !== item.container)
        throw new AudioError(
          'integrity',
          'El contenedor del audio no coincide con sus datos.',
        )
      files.push({ scope, id: item.id, bytes })
    }
    attachments.push(
      audioAttachmentSchema.parse({
        ...item,
        scope,
        userAlbumId: change.userAlbumId,
      }),
    )
  }
  validateAudioAttachments(snapshot, [
    ...current.filter(
      (row) => row.scope !== scope || row.userAlbumId !== change.userAlbumId,
    ),
    ...attachments,
  ])
  return {
    scope,
    removed: old
      .filter((row) => !attachments.some((item) => item.id === row.id))
      .map((row) => row.id),
    attachments,
    files,
  }
}
export async function writeAudioChanges(
  database: AuditoriumDatabase,
  plan: AudioPlan | undefined,
) {
  if (!plan) return
  const keys = plan.removed.map((id): [string, string] => [plan.scope, id])
  if (keys.length) {
    await database.audioAttachments.bulkDelete(keys)
    await database.audioFiles.bulkDelete(keys)
  }
  if (plan.files.length)
    await database.audioFiles.bulkPut(
      plan.files.map((file) => ({
        ...file,
        bytes: new Uint8Array(file.bytes),
      })),
    )
  if (plan.attachments.length)
    await database.audioAttachments.bulkPut(plan.attachments)
}
