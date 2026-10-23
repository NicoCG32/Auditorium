export type PlaybackTarget = {
  provider: 'spotify' | 'youtube'
  kind: 'album' | 'track' | 'video' | 'playlist'
  id: string
  canonical: string
}

/** Inspect locally. Only recognized public resource URLs can become embeds. */
export function inspectPlaybackLink(value: string): PlaybackTarget | undefined {
  if (
    value.length > 2048 ||
    /[\s<>"]/u.test(value) ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return undefined
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return undefined
  const parts = url.pathname.split('/').filter(Boolean)
  if (url.hostname === 'open.spotify.com') {
    if (/^intl-[a-z]{2}$/i.test(parts[0] ?? '')) parts.shift()
    if (parts[0] === 'embed') parts.shift()
    const [kind, id] = parts
    if (
      parts.length === 2 &&
      (kind === 'album' || kind === 'track' || kind === 'playlist') &&
      id &&
      /^[A-Za-z0-9]{22}$/.test(id)
    )
      return {
        provider: 'spotify',
        kind,
        id,
        canonical: `https://open.spotify.com/${kind}/${id}`,
      }
  }
  const youtube = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
  ].includes(url.hostname)
  const video =
    url.hostname === 'youtu.be' && parts.length === 1
      ? parts[0]
      : youtube && url.pathname === '/watch'
        ? url.searchParams.get('v')
        : youtube &&
            ['shorts', 'embed'].includes(parts[0] ?? '') &&
            parts.length === 2
          ? parts[1]
          : undefined
  if (video && /^[A-Za-z0-9_-]{11}$/.test(video))
    return {
      provider: 'youtube',
      kind: 'video',
      id: video,
      canonical: `https://www.youtube.com/watch?v=${video}`,
    }
  const playlist =
    youtube && url.pathname === '/playlist'
      ? url.searchParams.get('list')
      : undefined
  if (playlist && /^[A-Za-z0-9_-]{10,100}$/.test(playlist))
    return {
      provider: 'youtube',
      kind: 'playlist',
      id: playlist,
      canonical: `https://www.youtube.com/playlist?list=${playlist}`,
    }
  return undefined
}

export function playbackEmbedUrl(
  target: PlaybackTarget,
  origin: string,
): string {
  const parent = new URL(origin)
  const checked = inspectPlaybackLink(target.canonical)
  if (
    !['http:', 'https:'].includes(parent.protocol) ||
    parent.origin !== origin ||
    !checked ||
    checked.provider !== target.provider ||
    checked.kind !== target.kind ||
    checked.id !== target.id
  )
    throw new Error('No se puede construir el reproductor para este enlace.')
  if (target.provider === 'spotify')
    return `https://open.spotify.com/embed/${target.kind}/${target.id}`
  const url = new URL(
    `https://www.youtube.com/embed/${target.kind === 'video' ? target.id : ''}`,
  )
  if (target.kind === 'playlist') {
    url.searchParams.set('listType', 'playlist')
    url.searchParams.set('list', target.id)
  }
  url.searchParams.set('enablejsapi', '1')
  url.searchParams.set('origin', origin)
  url.searchParams.set('playsinline', '1')
  url.searchParams.set('autoplay', '0')
  return url.href
}

export function youtubePlaybackError(code: number): string {
  return (
    (
      {
        2: 'YouTube no reconoce el enlace o sus parámetros.',
        5: 'Este navegador no pudo reproducir el vídeo.',
        100: 'El vídeo es privado, fue retirado o no está disponible.',
        101: 'El titular no permite reproducir este vídeo dentro de Auditorium.',
        150: 'El titular no permite reproducir este vídeo dentro de Auditorium.',
        153: 'YouTube no recibió la identificación del origen. Abre el servicio para continuar.',
      } as Record<number, string>
    )[code] ?? 'YouTube no pudo reproducir este contenido.'
  )
}
