import {
  AudioError,
  audioDigest,
  detectAudioHeader,
  validateAudioBudget,
  type AudioDraftItem,
} from '../../domain/audio'

export async function preparePersonalAudio(
  file: File,
  signal: AbortSignal,
): Promise<AudioDraftItem> {
  validateAudioBudget([file])
  signal.throwIfAborted()
  detectAudioHeader(new Uint8Array(await file.slice(0, 128).arrayBuffer()))
  signal.throwIfAborted()
  const bytes = new Uint8Array(await file.arrayBuffer())
  signal.throwIfAborted()
  validateAudioBudget([{ size: bytes.byteLength }])
  const detected = detectAudioHeader(bytes)
  const audio = new Audio()
  audio.preload = 'auto'
  const url = URL.createObjectURL(
    new Blob([bytes.buffer], { type: detected.mime }),
  )
  let duration: number
  try {
    duration = await new Promise<number>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        audio.removeEventListener('loadeddata', ready)
        audio.removeEventListener('error', failed)
        signal.removeEventListener('abort', aborted)
      }
      const ready = () => {
        cleanup()
        if (Number.isFinite(audio.duration) && audio.duration > 0)
          resolve(audio.duration)
        else
          reject(
            new AudioError(
              'invalid_file',
              'El archivo no tiene una duración válida.',
            ),
          )
      }
      const failed = () => {
        cleanup()
        reject(
          new AudioError(
            'unsupported',
            `Este navegador no pudo decodificar el audio (código ${audio.error?.code ?? 'sin confirmar'}). Elige otro archivo o navegador; el anterior se conserva.`,
          ),
        )
      }
      const aborted = () => {
        cleanup()
        reject(new DOMException('Selección cancelada.', 'AbortError'))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(
          new AudioError(
            'unsupported',
            'No se confirmó la decodificación en cinco segundos. El archivo anterior se conserva.',
          ),
        )
      }, 5000)
      audio.addEventListener('loadeddata', ready)
      audio.addEventListener('error', failed)
      signal.addEventListener('abort', aborted, { once: true })
      if (signal.aborted) {
        aborted()
        return
      }
      audio.src = url
      audio.load()
    })
  } finally {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    URL.revokeObjectURL(url)
  }
  signal.throwIfAborted()
  const sha256 = await audioDigest(bytes)
  signal.throwIfAborted()
  return {
    id: crypto.randomUUID(),
    name:
      (file.name.split(/[/\\]/u).at(-1) ?? 'Audio')
        .split('')
        .filter(
          (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
        )
        .join('')
        .trim()
        .slice(0, 255) || 'Audio',
    size: bytes.byteLength,
    ...detected,
    duration,
    sha256,
    bytes,
  }
}
