import { inspectLink, fetchMetadata, embedUrl, youtubeError } from './media.mjs'

const byId = (id) => document.getElementById(id)
let link,
  proposal,
  controller,
  player,
  generation = 0,
  apiPromise
function status(id, text, state) {
  byId(id).textContent = text
  byId(id).dataset.state = state
}
function closePlayer() {
  generation++
  player?.destroy()
  player = undefined
  byId('player').replaceChildren()
  byId('close-player').disabled = true
  byId('play').disabled = true
  status('player-status', 'Reproductor cerrado.', 'closed')
}
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timer = setTimeout(
      () => reject(new Error('Tiempo de espera de la API agotado.')),
      12000,
    )
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer)
      resolve()
    }
    script.onerror = () => {
      clearTimeout(timer)
      reject(new Error('No se pudo cargar la API oficial.'))
    }
    script.src = 'https://www.youtube.com/iframe_api'
    script.referrerPolicy = 'strict-origin-when-cross-origin'
    document.head.append(script)
  })
  return apiPromise
}
byId('inspect').addEventListener('submit', (event) => {
  event.preventDefault()
  controller?.abort()
  controller = undefined
  closePlayer()
  proposal = undefined
  byId('result').textContent = ''
  byId('apply').hidden = true
  byId('cover').hidden = true
  byId('image').replaceChildren()
  byId('cancel').disabled = true
  status('metadata-status', '', 'idle')
  try {
    link = inspectLink(byId('source').value.trim())
    byId('external').href = link.external
    byId('actions').hidden = false
    byId('metadata').disabled = !link.metadataUrl
    byId('embed').disabled = link.provider === 'external'
    status(
      'classification',
      `${link.provider} · ${link.kind}. La identidad del álbum requiere revisión.`,
      'ready',
    )
  } catch (error) {
    link = undefined
    byId('actions').hidden = true
    status('classification', error.message, 'error')
  }
})
byId('metadata').addEventListener('click', async () => {
  if (!link?.metadataUrl || controller) return
  const current = link
  const pending = new AbortController()
  controller = pending
  proposal = undefined
  byId('result').textContent = ''
  byId('apply').hidden = true
  byId('cover').hidden = true
  byId('image').replaceChildren()
  byId('cancel').disabled = false
  status('metadata-status', 'Consultando únicamente este enlace…', 'loading')
  const timer = setTimeout(() => pending.abort(), 12000)
  try {
    const result = await fetchMetadata(current, pending.signal)
    if (link !== current || pending.signal.aborted) return
    proposal = result
    byId('result').textContent = JSON.stringify(result, null, 2)
    byId('apply').hidden = false
    byId('cover').hidden = !result.thumbnail
    status(
      'metadata-status',
      'Datos recibidos. Revisa el título antes de utilizarlo.',
      'ready',
    )
  } catch (error) {
    if (link !== current) return
    status(
      'metadata-status',
      pending.signal.aborted
        ? 'Consulta cancelada o agotada. El borrador manual se conserva.'
        : `No se pudieron consultar los datos: ${error.message} Conserva el enlace y el registro manual.`,
      'error',
    )
  } finally {
    clearTimeout(timer)
    if (controller === pending) {
      controller = undefined
      byId('cancel').disabled = true
    }
  }
})
byId('cancel').addEventListener('click', () => controller?.abort())
byId('apply').addEventListener('click', () => {
  if (proposal) byId('album-title').value = proposal.title
})
byId('cover').addEventListener('click', () => {
  if (!proposal?.thumbnail) return
  const image = document.createElement('img')
  image.alt = 'Miniatura del enlace, no portada de álbum verificada'
  image.referrerPolicy = 'no-referrer'
  image.onload = () => (image.dataset.state = 'ready')
  image.onerror = () => {
    image.dataset.state = 'error'
    image.alt = 'La miniatura no está disponible; conserva el registro manual.'
  }
  image.src = proposal.thumbnail
  byId('image').replaceChildren(image)
})
byId('embed').addEventListener('click', async () => {
  if (!link || link.provider === 'external') return
  closePlayer()
  const current = link,
    token = generation
  const frame = document.createElement('iframe')
  frame.title = `Reproductor oficial de ${current.provider}`
  frame.allow =
    'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'
  frame.allowFullscreen = true
  frame.referrerPolicy = 'strict-origin-when-cross-origin'
  frame.id = 'official-player'
  frame.onload = () => {
    if (
      token === generation &&
      byId('player-status').dataset.state === 'loading'
    )
      status(
        'player-status',
        'Marco cargado. Esto no confirma la reproducción ni contenido completo.',
        'frame_loaded',
      )
  }
  frame.src = embedUrl(current, window.location.origin)
  byId('player').append(frame)
  byId('close-player').disabled = false
  status('player-status', 'Cargando el reproductor oficial…', 'loading')
  if (current.provider !== 'youtube') return
  try {
    await loadYouTube()
    if (token !== generation) return
    player = new window.YT.Player(frame.id, {
      events: {
        onReady: () => {
          if (token === generation) {
            status(
              'player-status',
              'API del reproductor lista; la reproducción aún no se ha comprobado.',
              'ready',
            )
            byId('play').disabled = false
          }
        },
        onError: ({ data }) => {
          if (token !== generation) return
          byId('play').disabled = true
          status(
            'player-status',
            `${youtubeError(data)} Abre el servicio externo.`,
            `error_${data}`,
          )
        },
        onStateChange: ({ data }) => {
          if (token === generation && data === 1)
            status(
              'player-status',
              'Reproducción iniciada. No acredita escuchar el contenido completo.',
              'playing',
            )
        },
      },
    })
  } catch (error) {
    if (token === generation)
      status(
        'player-status',
        `${error.message} Abre el servicio externo.`,
        'api_error',
      )
  }
})
byId('close-player').addEventListener('click', closePlayer)
byId('play').addEventListener('click', () => player?.playVideo())
