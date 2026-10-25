import { audioDigest, type AudioDraftItem } from '../domain/audio'
import { fixtureId } from '../domain/catalog/catalog.fixture'

export function syntheticWav(size = 1644) {
  const bytes = new Uint8Array(size),
    view = new DataView(bytes.buffer)
  for (const [offset, text] of [
    [0, 'RIFF'],
    [8, 'WAVE'],
    [12, 'fmt '],
    [36, 'data'],
  ] as const)
    bytes.set(new TextEncoder().encode(text), offset)
  view.setUint32(4, size - 8, true)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 16000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  view.setUint32(40, size - 44, true)
  return bytes
}
export async function syntheticAudio(
  id = fixtureId(99001),
): Promise<AudioDraftItem & { bytes: Uint8Array }> {
  const bytes = syntheticWav()
  return {
    id,
    bytes,
    name: 'Tono Sintético.wav',
    size: bytes.length,
    mime: 'audio/wav',
    container: 'WAV',
    duration: 0.1,
    sha256: await audioDigest(bytes),
  }
}
