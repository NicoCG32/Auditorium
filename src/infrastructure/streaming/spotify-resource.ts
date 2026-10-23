import { z } from 'zod'
import { inspectPlaybackLink, type PlaybackTarget } from './playback-links'

export interface SpotifyResource {
  title: string
  thumbnail?: string
}
const responseSchema = z.object({
  provider_name: z.literal('Spotify'),
  title: z.string().trim().min(1).max(500),
  thumbnail_url: z.string().max(2048).optional(),
})
export function readSpotifyResource(value: unknown): SpotifyResource {
  const parsed = responseSchema.safeParse(value)
  if (!parsed.success)
    throw new Error('Spotify no devolvió una referencia válida.')
  const { title, thumbnail_url } = parsed.data
  if (thumbnail_url) {
    try {
      const image = new URL(thumbnail_url)
      if (
        image.protocol === 'https:' &&
        !image.username &&
        !image.password &&
        !image.port &&
        (image.hostname === 'i.scdn.co' ||
          image.hostname.endsWith('.spotifycdn.com'))
      )
        return { title, thumbnail: image.href }
    } catch {
      /* A missing or unsupported image does not invalidate the title. */
    }
  }
  return { title }
}

/** Transient resource information for the widget; never an Album update. */
export async function fetchSpotifyResource(
  target: PlaybackTarget,
  signal: AbortSignal,
): Promise<SpotifyResource> {
  const checked = inspectPlaybackLink(target.canonical)
  if (checked?.provider !== 'spotify')
    throw new Error('La referencia sólo está disponible para Spotify.')
  const response = await fetch(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(checked.canonical)}`,
    {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'strict-origin-when-cross-origin',
      signal,
    },
  )
  if (!response.ok)
    throw new Error(
      'Spotify no pudo ofrecer la referencia. Puedes usar el enlace externo o editar la ficha manualmente.',
    )
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      response.headers.get('content-type') ?? '',
    )
  )
    throw new Error('Spotify no devolvió JSON.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('La respuesta no contiene datos.')
  const decoder = new TextDecoder()
  let text = '',
    size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536)
        throw new Error('La referencia supera el límite permitido.')
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
  return readSpotifyResource(JSON.parse(text))
}
