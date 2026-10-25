import {
  AudioError,
  bindAudioDraft,
  prepareAudioDraft,
  verifyAudioFile,
  type AudioDraft,
  type AudioAttachment,
  type AudioLocalRepository,
} from '../domain/audio'

export class LocalAudio {
  readonly repository: AudioLocalRepository
  constructor(repository: AudioLocalRepository) {
    this.repository = repository
  }
  async list() {
    return this.repository.readAudioAttachments()
  }
  async read(
    id: string,
    signal?: AbortSignal,
    expected?: Pick<
      AudioAttachment,
      'scope' | 'userAlbumId' | 'sha256' | 'size' | 'name'
    >,
  ) {
    signal?.throwIfAborted()
    const file = await this.repository.readAudioFile(id)
    if (expected && expected.scope !== file.attachment.scope)
      throw new AudioError(
        'scope',
        'La biblioteca cambió. Vuelve a abrir el álbum correcto.',
      )
    if (
      expected &&
      (expected.userAlbumId !== file.attachment.userAlbumId ||
        expected.sha256 !== file.attachment.sha256 ||
        expected.size !== file.attachment.size ||
        expected.name !== file.attachment.name)
    )
      throw new AudioError(
        'conflict',
        'El archivo cambió en otra ventana. Actualiza la lista de audio antes de reproducirlo.',
      )
    await verifyAudioFile(file, signal)
    return file
  }
  async save(entryId: string, draft: AudioDraft) {
    const prepared = (await prepareAudioDraft(draft))!
    await this.repository.mutate((snapshot) => ({
      snapshot,
      result: undefined,
      audio: bindAudioDraft(snapshot, entryId, prepared),
    }))
  }
}
