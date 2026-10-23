// Isolated research contracts. Nothing here reads or writes a music library.
export function inspectLink(value) {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\s<>"]/u.test(value) ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error('Usa una URL HTTPS válida sin credenciales ni HTML.')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new Error('Usa una URL HTTPS válida sin credenciales ni puertos.')
  const external = url.href
  const segments = url.pathname.split('/').filter(Boolean)
  if (url.hostname === 'open.spotify.com') {
    if (/^intl-[a-z]{2}$/i.test(segments[0] ?? '')) segments.shift()
    if (segments[0] === 'embed') segments.shift()
    const [kind, id] = segments
    if (
      segments.length === 2 &&
      ['album', 'track', 'playlist'].includes(kind) &&
      /^[A-Za-z0-9]{22}$/.test(id)
    ) {
      const canonical = `https://open.spotify.com/${kind}/${id}`
      return {
        provider: 'spotify',
        kind,
        id,
        external,
        canonical,
        metadataUrl: `https://open.spotify.com/oembed?url=${encodeURIComponent(canonical)}`,
      }
    }
  }
  const youtube = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
  ].includes(url.hostname)
  const video =
    url.hostname === 'youtu.be' && segments.length === 1
      ? segments[0]
      : youtube && url.pathname === '/watch'
        ? url.searchParams.get('v')
        : youtube &&
            ['shorts', 'embed'].includes(segments[0]) &&
            segments.length === 2
          ? segments[1]
          : undefined
  if (video && /^[A-Za-z0-9_-]{11}$/.test(video)) {
    const canonical = `https://www.youtube.com/watch?v=${video}`
    return {
      provider: 'youtube',
      kind: 'video',
      id: video,
      external,
      canonical,
      metadataUrl: `https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`,
    }
  }
  const playlist =
    youtube && url.pathname === '/playlist'
      ? url.searchParams.get('list')
      : undefined
  if (playlist && /^[A-Za-z0-9_-]{10,100}$/.test(playlist)) {
    return {
      provider: 'youtube',
      kind: 'playlist',
      id: playlist,
      external,
      canonical: `https://www.youtube.com/playlist?list=${playlist}`,
    }
  }
  return { provider: 'external', kind: 'link', external }
}

export function readMetadata(value, provider) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Respuesta no válida.')
  const expected = provider === 'spotify' ? 'Spotify' : 'YouTube'
  if (
    value.provider_name !== expected ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 500
  )
    throw new Error('La respuesta no identifica un título y proveedor válidos.')
  let thumbnail
  if (
    typeof value.thumbnail_url === 'string' &&
    value.thumbnail_url.length <= 2048
  ) {
    let image
    try {
      image = new URL(value.thumbnail_url)
    } catch {
      return { title: value.title.trim() }
    }
    const hosts =
      provider === 'spotify'
        ? ['i.scdn.co', 'image-cdn-ak.spotifycdn.com']
        : ['i.ytimg.com', 'img.youtube.com']
    if (
      image.protocol === 'https:' &&
      !image.username &&
      !image.password &&
      !image.port &&
      (hosts.includes(image.hostname) ||
        (provider === 'spotify' && image.hostname.endsWith('.spotifycdn.com')))
    )
      thumbnail = image.href
  }
  return { title: value.title.trim(), ...(thumbnail ? { thumbnail } : {}) }
}

export async function fetchMetadata(link, signal) {
  if (!link.metadataUrl)
    throw new Error('Este tipo de enlace conserva la revisión manual.')
  const response = await fetch(link.metadataUrl, {
    mode: 'cors',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'strict-origin-when-cross-origin',
    signal,
  })
  if (!response.ok)
    throw new Error(
      `El proveedor respondió HTTP ${response.status}. Conserva el enlace y completa los datos manualmente.`,
    )
  if (!/application\/json/i.test(response.headers.get('content-type') ?? ''))
    throw new Error('El proveedor no devolvió JSON.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Respuesta sin cuerpo.')
  const decoder = new TextDecoder()
  let text = '',
    size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536)
        throw new Error('La respuesta excede el límite de 64 KiB.')
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
  return readMetadata(JSON.parse(text), link.provider)
}

export function embedUrl(link, origin) {
  const parent = new URL(origin)
  if (
    !['http:', 'https:'].includes(parent.protocol) ||
    parent.origin !== origin
  )
    throw new Error('Origen no válido.')
  if (link.provider === 'spotify')
    return `https://open.spotify.com/embed/${link.kind}/${link.id}`
  if (link.provider === 'youtube') {
    const url = new URL(
      `https://www.youtube.com/embed/${link.kind === 'video' ? link.id : ''}`,
    )
    if (link.kind === 'playlist') {
      url.searchParams.set('listType', 'playlist')
      url.searchParams.set('list', link.id)
    }
    url.searchParams.set('enablejsapi', '1')
    url.searchParams.set('origin', origin)
    url.searchParams.set('playsinline', '1')
    url.searchParams.set('autoplay', '0')
    return url.href
  }
  return undefined
}

export function youtubeError(code) {
  return (
    {
      2: 'Identificador o parámetro no válido.',
      5: 'El navegador no pudo reproducir este contenido.',
      100: 'Vídeo privado, retirado o no disponible.',
      101: 'El titular no permite insertar el vídeo.',
      150: 'El titular no permite insertar el vídeo.',
      153: 'YouTube no recibió la identificación del origen (Referer).',
    }[code] ?? 'El reproductor no está disponible en este contexto.'
  )
}
