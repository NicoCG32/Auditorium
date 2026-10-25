// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectAudioHeader, MAX_AUDIO_FILE_BYTES } from '../../domain/audio'
import { syntheticWav } from '../../test/audio.fixture'
import { preparePersonalAudio } from './audio-file'

class NativeAudio extends EventTarget {
  static last: NativeAudio
  static mode: 'ready' | 'error' | 'pending' = 'ready'
  duration = 0.1
  preload = ''
  src = ''
  error = { code: 4 }
  play = vi.fn()
  pause = vi.fn()
  removeAttribute = vi.fn(() => {
    this.src = ''
  })
  constructor() {
    super()
    NativeAudio.last = this
  }
  load = vi.fn(() => {
    if (this.src && NativeAudio.mode !== 'pending')
      queueMicrotask(() =>
        this.dispatchEvent(
          new Event(NativeAudio.mode === 'ready' ? 'loadeddata' : 'error'),
        ),
      )
  })
}
const createUrl = vi.fn(() => 'blob:synthetic'),
  revokeUrl = vi.fn()
function file(name = 'audio.wav') {
  return new File([new Uint8Array(syntheticWav()).buffer], name, {
    type: 'application/octet-stream',
  })
}
describe('selección de audio: límites, cabecera, validación nativa y limpieza', () => {
  it('un nombre de códec en el contenido posterior no altera la clasificación de la cabecera Ogg', () => {
    const bytes = new Uint8Array(256)
    bytes.set(new TextEncoder().encode('OggS'))
    bytes.set(new TextEncoder().encode('OpusHead'), 200)
    expect(detectAudioHeader(bytes)).toEqual({
      container: 'Ogg',
      mime: 'audio/ogg',
    })
  })
  beforeEach(() => {
    NativeAudio.mode = 'ready'
    vi.clearAllMocks()
    vi.stubGlobal('Audio', NativeAudio)
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createUrl)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeUrl)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  it('usa la cabecera real, normaliza sólo el basename y nunca reproduce durante la selección', async () => {
    const result = await preparePersonalAudio(
      file('C:\\carpeta\\tono.txt'),
      new AbortController().signal,
    )
    expect(result).toMatchObject({
      name: 'tono.txt',
      mime: 'audio/wav',
      container: 'WAV',
      size: 1644,
      duration: 0.1,
    })
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.bytes).toEqual(syntheticWav())
    expect(NativeAudio.last.play).not.toHaveBeenCalled()
    expect(NativeAudio.last.pause).toHaveBeenCalledOnce()
    expect(NativeAudio.last.src).toBe('')
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:synthetic')
  })
  it('rechaza tamaño y firma inválidos antes de crear un recurso multimedia', async () => {
    const oversized = file()
    vi.spyOn(oversized, 'size', 'get').mockReturnValue(MAX_AUDIO_FILE_BYTES + 1)
    await expect(
      preparePersonalAudio(oversized, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'limit' })
    await expect(
      preparePersonalAudio(
        new File(['not audio'], 'fake.wav', { type: 'audio/wav' }),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'invalid_file' })
    expect(createUrl).not.toHaveBeenCalled()
  })
  it('un fallo nativo rechaza el borrador y revoca su URL', async () => {
    NativeAudio.mode = 'error'
    await expect(
      preparePersonalAudio(file(), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unsupported' })
    expect(NativeAudio.last.src).toBe('')
    expect(revokeUrl).toHaveBeenCalledOnce()
  })
  it('cancelar antes o durante la validación no deja recursos ni acepta eventos tardíos', async () => {
    const pre = new AbortController()
    pre.abort()
    await expect(
      preparePersonalAudio(file(), pre.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(createUrl).not.toHaveBeenCalled()
    NativeAudio.mode = 'pending'
    const controller = new AbortController(),
      operation = preparePersonalAudio(file(), controller.signal)
    const rejected = expect(operation).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.waitFor(() => expect(createUrl).toHaveBeenCalledOnce())
    controller.abort()
    await rejected
    NativeAudio.last.dispatchEvent(new Event('loadeddata'))
    expect(NativeAudio.last.src).toBe('')
    expect(revokeUrl).toHaveBeenCalledOnce()
  })
  it('un decodificador que no responde vence el plazo y libera la URL', async () => {
    NativeAudio.mode = 'pending'
    vi.useFakeTimers()
    const operation = preparePersonalAudio(
        file(),
        new AbortController().signal,
      ),
      rejected = expect(operation).rejects.toMatchObject({
        code: 'unsupported',
      })
    await vi.waitFor(() => expect(createUrl).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(5001)
    await rejected
    expect(NativeAudio.last.src).toBe('')
    expect(revokeUrl).toHaveBeenCalledOnce()
  })
})
