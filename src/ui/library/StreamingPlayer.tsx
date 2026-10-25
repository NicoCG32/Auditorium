import { useEffect, useRef, useState } from 'react'
import { claimPlayback } from '../../infrastructure/browser/playback-coordinator'
import {
  playbackEmbedUrl,
  youtubePlaybackError,
  type PlaybackTarget,
} from '../../infrastructure/streaming/playback-links'
import { connectYouTubePlayer } from '../../infrastructure/streaming/youtube-player'
import {
  fetchSpotifyResource,
  type SpotifyResource,
} from '../../infrastructure/streaming/spotify-resource'

function ResourceArtwork({ url, title }: { url: string; title: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <p className="text-sm text-muted">Miniatura no disponible.</p>
  ) : (
    <img
      className="streaming-resource-image"
      src={url}
      alt={`Miniatura del recurso: ${title}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

function SpotifyReference({ target }: { target: PlaybackTarget }) {
  const [resource, setResource] = useState<SpotifyResource>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const controller = useRef<AbortController | null>(null)
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(
    () => () => {
      controller.current?.abort()
      controller.current = null
      clearTimeout(deadline.current)
    },
    [],
  )
  async function query() {
    if (controller.current) return
    const active = new AbortController()
    controller.current = active
    setBusy(true)
    setResource(undefined)
    setMessage('Consultando la referencia del enlace…')
    const timer = setTimeout(() => {
      if (controller.current !== active) return
      active.abort()
      controller.current = null
      setBusy(false)
      setMessage(
        'La consulta tardó demasiado. Puedes reintentar o continuar manualmente.',
      )
    }, 12000)
    deadline.current = timer
    try {
      const value = await fetchSpotifyResource(target, active.signal)
      if (controller.current !== active || active.signal.aborted) return
      setResource(value)
      setMessage(
        'Referencia temporal de Spotify. Revisa a qué recurso corresponde.',
      )
    } catch {
      if (controller.current !== active || active.signal.aborted) return
      setMessage(
        'No pudimos obtener la referencia. Puedes reintentar o editar la ficha manualmente.',
      )
    } finally {
      clearTimeout(timer)
      if (controller.current === active) {
        controller.current = null
        setBusy(false)
      }
    }
  }
  return (
    <details className="streaming-reference">
      <summary>Revisar los datos del recurso (opcional)</summary>
      <p className="mt-3 text-sm text-muted">
        La consulta sólo envía este enlace a Spotify. El título y la miniatura
        identifican el recurso; no confirman el álbum, la banda ni su edición.
        No se copian a tu biblioteca. Para corregir sus datos, usa Editar álbum.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          className="action-button"
          disabled={busy}
          onClick={() => void query()}
        >
          Consultar referencia de Spotify
        </button>
        {busy ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              controller.current?.abort()
              controller.current = null
              clearTimeout(deadline.current)
              setBusy(false)
              setMessage('Consulta cancelada. La ficha se conserva.')
            }}
          >
            Cancelar consulta
          </button>
        ) : null}
      </div>
      <p role="status" className="mt-3 text-sm">
        {message}
      </p>
      {resource ? (
        <div className="streaming-resource">
          {resource.thumbnail ? (
            <ResourceArtwork
              key={resource.thumbnail}
              url={resource.thumbnail}
              title={resource.title}
            />
          ) : null}
          <div>
            <p className="font-semibold wrap-anywhere">{resource.title}</p>
            <a
              className="text-button"
              href={target.canonical}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver recurso en Spotify
            </a>
          </div>
        </div>
      ) : null}
    </details>
  )
}

function PlaybackFrame({ target }: { target: PlaybackTarget }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const offline = navigator.onLine === false
  const [state, setState] = useState({
    status: offline ? 'error' : 'loading',
    message: offline
      ? 'No hay conexión. Puedes reintentar cuando vuelvas a estar en línea.'
      : 'Conectando con el servicio…',
  })
  useEffect(() => {
    if (offline) return
    const active = new AbortController()
    let failed = false
    let dispose: (() => void) | undefined
    const update = (status: string, message: string) => {
      if (active.signal.aborted || failed) return
      if (status === 'error') failed = true
      setState({ status, message })
    }
    const timer = setTimeout(() => {
      const error = {
        status: 'error',
        message:
          'El servicio no confirmó la carga. Puedes cerrar, reintentar o abrir el enlace externo.',
      }
      if (target.provider === 'spotify')
        setState((previous) =>
          previous.status === 'loading' ? error : previous,
        )
      else update(error.status, error.message)
    }, 20000)
    if (target.provider === 'youtube' && frame.current) {
      void connectYouTubePlayer(
        frame.current,
        {
          ready: () => {
            clearTimeout(timer)
            update(
              'ready',
              'YouTube está listo. Pulsa reproducir en sus controles.',
            )
          },
          state: (code) => {
            const message = (
              {
                0: 'La reproducción terminó.',
                1: 'Reproducción iniciada en YouTube.',
                2: 'Reproducción en pausa.',
                3: 'YouTube está preparando el contenido.',
              } as Record<number, string>
            )[code]
            if (message) {
              clearTimeout(timer)
              update(code === 1 ? 'playing' : 'ready', message)
            }
          },
          error: (code) => {
            clearTimeout(timer)
            update('error', youtubePlaybackError(code))
          },
          blocked: () => {
            clearTimeout(timer)
            update(
              'ready',
              'El navegador bloqueó el inicio. Usa los controles de YouTube o abre el servicio.',
            )
          },
        },
        active.signal,
      )
        .then((release) => {
          dispose = release
          if (active.signal.aborted) release()
        })
        .catch(() => {
          clearTimeout(timer)
          update(
            'error',
            'No pudimos conectar con YouTube. Puedes reintentar o abrir el servicio.',
          )
        })
    }
    return () => {
      clearTimeout(timer)
      active.abort()
      dispose?.()
    }
  }, [offline, target.provider])
  const provider = target.provider === 'spotify' ? 'Spotify' : 'YouTube'
  return (
    <div className="streaming-active">
      {!offline ? (
        <iframe
          ref={frame}
          className={`streaming-frame streaming-frame-${target.provider}`}
          src={playbackEmbedUrl(target, window.location.origin)}
          title={`Reproductor de ${provider}`}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => {
            if (target.provider === 'spotify')
              setState((previous) =>
                previous.status === 'loading'
                  ? {
                      status: 'ready',
                      message:
                        'Marco de Spotify cargado. Esto no confirma que pueda reproducirse el contenido completo.',
                    }
                  : previous,
              )
          }}
        />
      ) : null}
      <p
        role="status"
        data-playback-state={state.status}
        className="mt-3 text-sm"
      >
        {state.message}
      </p>
      {target.provider === 'spotify' ? (
        <>
          <p className="mt-3 text-sm text-muted">
            Spotify puede ofrecer sólo una muestra. La reproducción completa
            depende del servicio, cuenta, región y contenido.
          </p>
          <SpotifyReference target={target} />
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">
          El título y la imagen del vídeo o lista se muestran en YouTube. No se
          usan como datos del álbum. La disponibilidad depende del titular, tu
          región y el servicio.
        </p>
      )}
    </div>
  )
}

export function StreamingPlayer({
  target,
  disabled,
}: {
  target: PlaybackTarget
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const loadButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    return claimPlayback(() => setOpen(false))
  }, [open])
  const provider = target.provider === 'spotify' ? 'Spotify' : 'YouTube'
  return (
    <div className="streaming-player" aria-label={`Conexión con ${provider}`}>
      <p className="text-sm text-muted">
        Al cargar el reproductor, conectas con {provider}: recibe el enlace
        elegido, tu IP y datos del navegador, y puede usar cookies y mostrar
        anuncios. La reproducción empieza con sus controles.
      </p>
      <p className="mt-2 text-sm streaming-policy-links">
        {target.provider === 'spotify' ? (
          <>
            Al continuar aceptas las{' '}
            <a
              href="https://www.spotify.com/legal/end-user-agreement/"
              target="_blank"
              rel="noopener noreferrer"
            >
              condiciones de Spotify
            </a>
            . Consulta su{' '}
            <a
              href="https://www.spotify.com/legal/privacy-policy/"
              target="_blank"
              rel="noopener noreferrer"
            >
              privacidad
            </a>{' '}
            y{' '}
            <a
              href="https://www.spotify.com/legal/cookies-policy/"
              target="_blank"
              rel="noopener noreferrer"
            >
              política de cookies
            </a>
            .
          </>
        ) : (
          <>
            Al continuar aceptas las{' '}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
            >
              condiciones de YouTube
            </a>
            . Consulta la{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              privacidad de Google
            </a>
            .
          </>
        )}
      </p>
      <details className="streaming-data-notice mt-3 text-sm text-muted">
        <summary>Cómo se usan tus datos</summary>
        <p className="mt-3">
          Auditorium usa el enlace elegido para solicitar el reproductor. Tu
          biblioteca, notas, calificaciones y cuenta de Auditorium no se envían
          a este servicio. El proveedor y sus terceros pueden recoger datos
          técnicos, colocar cookies de navegación y asociar la actividad a tu
          sesión en ellos. Gestiona esas cookies en los ajustes del navegador y
          del proveedor.
        </p>
        <p className="mt-3">
          Cerrar reproductor retira el marco y detiene su reproducción. El
          código de YouTube ya cargado permanece en la página hasta recargarla.
          La referencia de Spotify sólo se muestra temporalmente junto al
          widget; no entra en la biblioteca, sincronización ni respaldos.
        </p>
        <p className="mt-3">
          El uso de esta función es personal y respeta los controles del
          servicio. No se descargan ni convierten sus contenidos. Puedes
          mantener el servicio fuera de Auditorium con Abrir en el servicio, o
          seguir usando el registro manual.
        </p>
        <a
          className="text-button"
          href="https://github.com/NicoCG32/Auditorium/blob/main/docs/REPRODUCCION.md#privacidad-y-condiciones-de-uso"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacidad y condiciones de esta función
        </a>
      </details>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          ref={loadButton}
          type="button"
          className="primary-button"
          disabled={disabled}
          onClick={() => {
            setAttempt((value) => value + 1)
            setOpen(true)
          }}
        >
          {open
            ? `Reintentar reproductor de ${provider}`
            : `Cargar reproductor de ${provider}`}
        </button>
        {open ? (
          <button
            type="button"
            className="action-button"
            onClick={() => {
              setOpen(false)
              requestAnimationFrame(() => loadButton.current?.focus())
            }}
          >
            Cerrar reproductor
          </button>
        ) : null}
      </div>
      {open ? (
        <PlaybackFrame key={target.canonical + attempt} target={target} />
      ) : null}
    </div>
  )
}
