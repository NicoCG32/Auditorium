export const MAX_FILE_BYTES = 16 * 1024 * 1024
export const MAX_TOTAL_BYTES = 32 * 1024 * 1024
export const MAX_FILES = 4
export const demoEntries = [
  { id: 'entry-a', albumId: 'album-a', label: 'Álbum ficticio A' },
  { id: 'entry-b', albumId: 'album-b', label: 'Álbum ficticio B' },
]
export const demoTracks = [
  { id: 'track-a', albumId: 'album-a', label: 'Pista ficticia A' },
  { id: 'track-b', albumId: 'album-b', label: 'Pista ficticia B' },
]

export function validateAssociation(association) {
  const entry = demoEntries.find((row) => row.id === association.userAlbumId)
  if (
    !entry ||
    (association.trackId &&
      !demoTracks.some(
        (row) =>
          row.id === association.trackId && row.albumId === entry.albumId,
      ))
  )
    throw new Error('Elige una entrada personal y una pista del mismo álbum.')
  return {
    userAlbumId: entry.id,
    ...(association.trackId ? { trackId: association.trackId } : {}),
  }
}
export function validateSelection(file, items = [], replaceId) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0)
    throw new Error('El archivo está vacío o no es válido.')
  if (file.size > MAX_FILE_BYTES) throw new Error('Máximo 16 MiB por archivo.')
  const remaining = items.filter((row) => row.id !== replaceId)
  if (remaining.length >= MAX_FILES)
    throw new Error('Máximo cuatro archivos temporales.')
  if (
    remaining.reduce((sum, row) => sum + row.file.size, 0) + file.size >
    MAX_TOTAL_BYTES
  )
    throw new Error('Máximo 32 MiB en la sesión.')
}
export function inspectHeader(bytes) {
  const text = new TextDecoder('latin1').decode(bytes)
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
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0)
  )
    return { container: 'MPEG audio', mime: 'audio/mpeg' }
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0)
    return { container: 'ADTS/AAC', mime: 'audio/aac' }
  throw new Error(
    'No se reconoce un contenedor de audio admitido. La extensión no basta.',
  )
}

function abortError() {
  return new DOMException('Selección cancelada.', 'AbortError')
}
export class AudioSession {
  items = []
  activeId = undefined
  player = undefined
  metrics = { createdUrls: 0, revokedUrls: 0 }
  pending = undefined
  release = undefined

  cancel() {
    this.pending?.abort()
    this.pending = undefined
  }
  async choose(file, association, replaceId) {
    this.cancel()
    validateSelection(file, this.items, replaceId)
    const link = validateAssociation(association)
    if (replaceId && !this.items.some((row) => row.id === replaceId))
      throw new Error('El adjunto que ibas a reemplazar ya no existe.')
    const current = new AbortController()
    this.pending = current
    let staged
    try {
      const bytes = new Uint8Array(await file.slice(0, 128).arrayBuffer())
      if (current.signal.aborted || this.pending !== current) throw abortError()
      const detected = inspectHeader(bytes)
      staged = await this.prepare(file, detected, current.signal)
      if (current.signal.aborted || this.pending !== current) {
        staged.release()
        throw abortError()
      }
      validateSelection(file, this.items, replaceId)
      const item = {
        id: replaceId ?? crypto.randomUUID(),
        file,
        association: link,
        container: detected.container,
        duration: staged.player.duration,
      }
      this.release?.()
      this.items = [...this.items.filter((row) => row.id !== replaceId), item]
      this.activeId = item.id
      this.player = staged.player
      this.release = staged.release
      return item
    } catch (error) {
      staged?.release()
      throw error
    } finally {
      if (this.pending === current) this.pending = undefined
    }
  }
  async prepare(file, detected, signal) {
    const player = new Audio()
    player.controls = true
    player.preload = 'auto'
    const url = URL.createObjectURL(file.slice(0, file.size, detected.mime))
    this.metrics.createdUrls++
    let released = false
    const release = () => {
      if (released) return
      released = true
      player.pause()
      player.removeAttribute('src')
      player.load()
      player.remove()
      URL.revokeObjectURL(url)
      this.metrics.revokedUrls++
    }
    try {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer)
          player.removeEventListener('loadeddata', ready)
          player.removeEventListener('error', failed)
          signal.removeEventListener('abort', cancelled)
        }
        const ready = () => {
          if (!Number.isFinite(player.duration) || player.duration <= 0) {
            failed()
            return
          }
          cleanup()
          resolve()
        }
        const failed = () => {
          cleanup()
          reject(
            new Error(
              `El navegador no pudo decodificar este archivo (código ${player.error?.code ?? 'sin confirmar'}).`,
            ),
          )
        }
        const cancelled = () => {
          cleanup()
          reject(abortError())
        }
        const timer = setTimeout(() => {
          cleanup()
          reject(
            new Error('No se confirmó la decodificación en cinco segundos.'),
          )
        }, 5000)
        player.addEventListener('loadeddata', ready)
        player.addEventListener('error', failed)
        signal.addEventListener('abort', cancelled, { once: true })
        if (signal.aborted) {
          cancelled()
          return
        }
        player.src = url
        player.load()
      })
      return { player, release }
    } catch (error) {
      release()
      throw error
    }
  }
  async activate(id) {
    const item = this.items.find((row) => row.id === id)
    if (!item) throw new Error('El adjunto ya no está en esta sesión.')
    return this.choose(item.file, item.association, item.id)
  }
  remove(id) {
    this.cancel()
    if (this.activeId === id) {
      this.release?.()
      this.release = undefined
      this.player = undefined
      this.activeId = undefined
    }
    this.items = this.items.filter((row) => row.id !== id)
  }
  dispose() {
    this.cancel()
    this.release?.()
    this.release = undefined
    this.player = undefined
    this.activeId = undefined
    this.items = []
  }
}
