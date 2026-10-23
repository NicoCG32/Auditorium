export interface YouTubeEvents {
  ready: () => void
  state: (code: number) => void
  error: (code: number) => void
  blocked: () => void
}
interface Player {
  destroy: () => void
}
interface YouTubeApi {
  Player: new (
    frame: HTMLIFrameElement,
    options: {
      events: {
        onReady: () => void
        onStateChange: (event: { data: number }) => void
        onError: (event: { data: number }) => void
        onAutoplayBlocked: () => void
      }
    },
  ) => Player
}
type YouTubeWindow = Window & {
  YT?: YouTubeApi
  onYouTubeIframeAPIReady?: (() => void) | undefined
}
let pendingApi: Promise<YouTubeApi> | undefined

function loadApi(): Promise<YouTubeApi> {
  const host = window as YouTubeWindow
  if (host.YT?.Player) return Promise.resolve(host.YT)
  if (pendingApi) return pendingApi
  pendingApi = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = host.onYouTubeIframeAPIReady
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    const cleanup = () => {
      clearTimeout(timer)
      script.onerror = null
      if (host.onYouTubeIframeAPIReady === ready)
        host.onYouTubeIframeAPIReady = previous
    }
    const fail = () => {
      cleanup()
      script.remove()
      reject(
        new Error(
          'No pudimos conectar con YouTube. Puedes reintentar o abrir el servicio.',
        ),
      )
    }
    const ready = () => {
      if (!host.YT?.Player) {
        fail()
        return
      }
      cleanup()
      resolve(host.YT)
      previous?.()
    }
    const timer = setTimeout(fail, 12000)
    host.onYouTubeIframeAPIReady = ready
    script.onerror = fail
    document.head.append(script)
  }).catch((error: unknown) => {
    pendingApi = undefined
    throw error
  })
  return pendingApi
}

/** Loaded only after the explicit connection action; no playback command. */
export async function connectYouTubePlayer(
  frame: HTMLIFrameElement,
  events: YouTubeEvents,
  signal: AbortSignal,
): Promise<() => void> {
  const api = await loadApi()
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  let disposed = false
  const player = new api.Player(frame, {
    events: {
      onReady: () => {
        if (!disposed && !signal.aborted) events.ready()
      },
      onStateChange: ({ data }) => {
        if (!disposed && !signal.aborted) events.state(data)
      },
      onError: ({ data }) => {
        if (!disposed && !signal.aborted) events.error(data)
      },
      onAutoplayBlocked: () => {
        if (!disposed && !signal.aborted) events.blocked()
      },
    },
  })
  const dispose = () => {
    if (disposed) return
    disposed = true
    signal.removeEventListener('abort', dispose)
    player.destroy()
  }
  signal.addEventListener('abort', dispose, { once: true })
  if (signal.aborted) dispose()
  return dispose
}
