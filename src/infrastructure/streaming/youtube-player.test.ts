import { afterEach, expect, test, vi } from 'vitest'
import type { YouTubeEvents } from './youtube-player'

type Host = Window & { onYouTubeIframeAPIReady?: () => void }
afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as Host).onYouTubeIframeAPIReady
  document
    .querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')
    .forEach((script) => script.remove())
  vi.resetModules()
})
function events(): YouTubeEvents {
  return { ready: vi.fn(), state: vi.fn(), error: vi.fn(), blocked: vi.fn() }
}

test('abortado mientras se carga la API no crea ningún reproductor', async () => {
  const { connectYouTubePlayer } = await import('./youtube-player')
  const controller = new AbortController(),
    Player = vi.fn()
  const connecting = connectYouTubePlayer(
    document.createElement('iframe'),
    events(),
    controller.signal,
  )
  const rejection = expect(connecting).rejects.toMatchObject({
    name: 'AbortError',
  })
  const script = document.querySelector(
    'script[src="https://www.youtube.com/iframe_api"]',
  )!
  expect(script).toHaveAttribute(
    'referrerpolicy',
    'strict-origin-when-cross-origin',
  )
  controller.abort()
  vi.stubGlobal('YT', { Player })
  ;(window as Host).onYouTubeIframeAPIReady?.()
  await rejection
  expect(Player).not.toHaveBeenCalled()
})

test('error de script permite reintentar y destruir una única instancia sin comandos de autoplay', async () => {
  const { connectYouTubePlayer } = await import('./youtube-player')
  const controller = new AbortController(),
    listeners = events(),
    destroy = vi.fn()
  const first = connectYouTubePlayer(
    document.createElement('iframe'),
    listeners,
    controller.signal,
  )
  const rejected = expect(first).rejects.toThrow('No pudimos conectar')
  document
    .querySelector('script[src="https://www.youtube.com/iframe_api"]')!
    .dispatchEvent(new Event('error'))
  await rejected
  expect(
    document.querySelector('script[src="https://www.youtube.com/iframe_api"]'),
  ).toBeNull()
  type Callbacks = {
    onReady: () => void
    onStateChange: (event: { data: number }) => void
    onError: (event: { data: number }) => void
    onAutoplayBlocked: () => void
  }
  let callbacks: Callbacks | undefined
  class FakePlayer {
    constructor(_frame: HTMLIFrameElement, options: { events: Callbacks }) {
      callbacks = options.events
    }
    destroy = destroy
  }
  const second = connectYouTubePlayer(
    document.createElement('iframe'),
    listeners,
    controller.signal,
  )
  vi.stubGlobal('YT', { Player: FakePlayer })
  ;(window as Host).onYouTubeIframeAPIReady?.()
  const dispose = await second
  callbacks!.onReady()
  callbacks!.onStateChange({ data: 1 })
  callbacks!.onError({ data: 100 })
  callbacks!.onAutoplayBlocked()
  expect(listeners.ready).toHaveBeenCalledOnce()
  expect(listeners.state).toHaveBeenCalledWith(1)
  expect(listeners.error).toHaveBeenCalledWith(100)
  expect(listeners.blocked).toHaveBeenCalledOnce()
  controller.abort()
  dispose()
  callbacks!.onReady()
  expect(destroy).toHaveBeenCalledOnce()
  expect(listeners.ready).toHaveBeenCalledOnce()
})
