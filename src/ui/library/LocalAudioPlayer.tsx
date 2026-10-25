import { useCallback, useEffect, useRef, useState } from 'react'
import { claimPlayback } from '../../infrastructure/browser/playback-coordinator'

interface Session {
  controller: AbortController
  url?: string
  release?: () => void
  timer?: ReturnType<typeof setTimeout>
}
function playbackTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`
}
export function LocalAudioPlayer({
  name,
  load,
  disabled = false,
}: {
  name: string
  load: (signal: AbortSignal) => Promise<{ bytes: Uint8Array; mime: string }>
  disabled?: boolean
}) {
  const [state, setState] = useState<{
    status: 'closed' | 'loading' | 'ready' | 'error'
    url?: string
    message?: string
    playing?: boolean
    position?: number
    duration?: number
  }>({ status: 'closed' })
  const active = useRef<Session | undefined>(undefined)
  const player = useRef<HTMLAudioElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const release = useCallback(() => {
    const session = active.current
    active.current = undefined
    if (!session) return
    session.controller.abort()
    clearTimeout(session.timer)
    if (player.current) {
      player.current.pause()
      player.current.removeAttribute('src')
      player.current.load()
    }
    if (session.url) URL.revokeObjectURL(session.url)
    session.release?.()
  }, [])
  useEffect(() => () => release(), [release])
  async function prepare() {
    release()
    const session: Session = { controller: new AbortController() }
    active.current = session
    session.release = claimPlayback(() => {
      if (active.current === session) {
        release()
        setState({ status: 'closed' })
      }
    })
    session.timer = setTimeout(() => {
      if (active.current !== session) return
      release()
      setState({
        status: 'error',
        message:
          'El audio tardó demasiado en prepararse. Puedes reintentar; el archivo guardado se conserva.',
      })
    }, 10000)
    setState({
      status: 'loading',
      message: 'Preparando audio de este dispositivo…',
    })
    try {
      const file = await load(session.controller.signal)
      if (active.current !== session || session.controller.signal.aborted)
        return
      session.url = URL.createObjectURL(
        new Blob([new Uint8Array(file.bytes).buffer], { type: file.mime }),
      )
      setState({
        status: 'loading',
        url: session.url,
        message: 'Comprobando el reproductor local…',
      })
    } catch (error) {
      if (active.current !== session) return
      release()
      setState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'No se pudo leer el archivo. Vuelve a seleccionarlo o restaura un respaldo completo.',
      })
    }
  }
  async function toggle() {
    const element = player.current,
      session = active.current
    if (!element || !session) return
    if (!element.paused) {
      element.pause()
      return
    }
    try {
      await element.play()
    } catch {
      if (active.current === session)
        setState((previous) => ({
          ...previous,
          message:
            'El navegador no permitió iniciar el audio. Pulsa reproducir en sus controles nativos.',
        }))
    }
  }
  function seek(position: number) {
    const element = player.current
    if (
      !element ||
      !active.current ||
      !Number.isFinite(position) ||
      !Number.isFinite(element.duration)
    )
      return
    const next = Math.min(element.duration, Math.max(0, position))
    try {
      element.currentTime = next
      setState((previous) => ({ ...previous, position: next }))
    } catch {
      setState((previous) => ({
        ...previous,
        message:
          'No se pudo cambiar la posición. Puedes usar los controles nativos o volver a cargar el audio.',
      }))
    }
  }
  return (
    <div className="local-audio-player">
      <div className="flex flex-wrap gap-3">
        <button
          ref={button}
          type="button"
          className="action-button"
          disabled={disabled || state.status === 'loading'}
          onClick={() => void prepare()}
        >
          Cargar audio: {name}
        </button>
        {state.status === 'ready' ? (
          <button
            type="button"
            className="primary-button"
            disabled={disabled}
            onClick={() => void toggle()}
          >
            {state.playing ? 'Pausar audio' : 'Reproducir audio'}
          </button>
        ) : null}
        {state.status === 'loading' || state.url ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              release()
              setState({ status: 'closed' })
              button.current?.focus()
            }}
          >
            Cerrar audio
          </button>
        ) : null}
      </div>
      {state.url ? (
        <audio
          ref={player}
          controls
          preload="auto"
          src={state.url}
          aria-label={`Audio personal: ${name}`}
          onTimeUpdate={(event) => {
            const element = event.currentTarget
            if (active.current?.url !== element.src) return
            const position = element.currentTime
            setState((previous) => ({ ...previous, position }))
          }}
          onPlay={(event) => {
            if (active.current?.url === event.currentTarget.src)
              setState((previous) => ({
                ...previous,
                playing: true,
                message: 'Reproduciendo audio personal.',
              }))
          }}
          onPause={(event) => {
            if (active.current?.url === event.currentTarget.src)
              setState((previous) => ({
                ...previous,
                playing: false,
                message: 'Audio en pausa.',
              }))
          }}
          onEnded={(event) => {
            if (active.current?.url === event.currentTarget.src)
              setState((previous) => ({
                ...previous,
                playing: false,
                message: 'La reproducción del archivo terminó.',
              }))
          }}
          onLoadedData={(event) => {
            const session = active.current
            if (!session || session.url !== event.currentTarget.src) return
            if (
              !Number.isFinite(event.currentTarget.duration) ||
              event.currentTarget.duration <= 0
            ) {
              release()
              setState({
                status: 'error',
                message:
                  'Este navegador no confirmó una duración válida. El archivo guardado se conserva.',
              })
              return
            }
            clearTimeout(session.timer)
            const duration = event.currentTarget.duration,
              position = event.currentTarget.currentTime
            setState((previous) => ({
              ...previous,
              status: 'ready',
              duration,
              position,
              message: 'Audio listo. Pulsa reproducir en sus controles.',
            }))
          }}
          onError={() => {
            if (!active.current || active.current.url !== state.url) return
            release()
            setState({
              status: 'error',
              message:
                'Este navegador no pudo reproducir el formato. El archivo guardado se conserva; puedes usar otro navegador o reemplazarlo.',
            })
          }}
        />
      ) : null}
      {state.status === 'ready' && state.duration ? (
        <label className="mt-3 block">
          <span className="field-label">
            Posición · {playbackTime(state.position ?? 0)} de{' '}
            {playbackTime(state.duration)}
          </span>
          <input
            className="w-full"
            type="range"
            min={0}
            max={state.duration}
            step={Math.min(0.1, state.duration / 100)}
            value={Math.min(state.duration, Math.max(0, state.position ?? 0))}
            aria-label={`Posición del audio: ${name}`}
            aria-valuetext={`${playbackTime(state.position ?? 0)} de ${playbackTime(state.duration)}`}
            disabled={disabled}
            onChange={(event) => seek(event.currentTarget.valueAsNumber)}
          />
        </label>
      ) : null}
      {state.message ? (
        <p
          role={state.status === 'error' ? 'alert' : 'status'}
          className="mt-2 text-sm wrap-anywhere"
        >
          {state.message}
        </p>
      ) : null}
    </div>
  )
}
