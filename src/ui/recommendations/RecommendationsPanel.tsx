import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { LibraryAlbum } from '../../application/library-query'
import {
  buildRecommendationContext,
  recommendationPayload,
  type Recommendation,
  type RecommendationProvider,
} from '../../application/recommendations'
import {
  recommendationModels,
  RecommendationRequestError,
  requestRecommendations,
} from '../../infrastructure/ai/recommendation-client'
import { formatScore, listeningLabels } from '../library/labels'

export interface RecommendationsPanelProps {
  albums: LibraryAlbum[]
  provider: RecommendationProvider
  apiKey: string
  onProviderChange: (provider: RecommendationProvider) => void
  onKeyChange: (key: string) => void
  onOpenAlbum: (entryId: string) => void
  onClose: () => void
  request?: typeof requestRecommendations
}

interface ResultState {
  status: 'idle' | 'loading' | 'done' | 'error' | 'cancelled'
  items: Recommendation[]
  message: string
}

const initial: ResultState = { status: 'idle', items: [], message: '' }

const providerDetails = {
  groq: {
    name: 'Groq',
    privacy: 'https://console.groq.com/docs/your-data',
    pricing: 'https://console.groq.com/docs/rate-limits',
    disclosure:
      'Groq puede conservar contenido para fiabilidad o prevención de abuso y conserva metadatos de uso. Consulta su política antes de enviar.',
  },
  gemini: {
    name: 'Gemini',
    privacy: 'https://ai.google.dev/gemini-api/terms',
    pricing: 'https://ai.google.dev/gemini-api/docs/pricing',
    disclosure:
      'Gemini gratuito puede usar entradas y respuestas para mejorar sus productos y para revisión humana, según los términos aplicables a tu región. No envíes información personal, sensible o confidencial.',
  },
} as const

export function RecommendationsPanel({
  albums,
  provider,
  apiKey,
  onProviderChange,
  onKeyChange,
  onOpenAlbum,
  onClose,
  request = requestRecommendations,
}: RecommendationsPanelProps) {
  const headingId = useId()
  const keyId = useId()
  const providerId = useId()
  const [consent, setConsent] = useState(false)
  const [state, setState] = useState<ResultState>(initial)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const context = useMemo(() => buildRecommendationContext(albums), [albums])
  const albumsById = useMemo(
    () => new Map(albums.map((album) => [album.id, album])),
    [albums],
  )
  const payload = context.candidates.length
    ? recommendationPayload(context)
    : undefined
  const details = providerDetails[provider]
  const loading = state.status === 'loading'

  useEffect(
    () => () => {
      generation.current += 1
      controller.current?.abort()
      controller.current = null
    },
    [apiKey, provider],
  )

  function cancel(message = '') {
    generation.current += 1
    controller.current?.abort()
    controller.current = null
    setState({
      ...initial,
      status: message ? 'cancelled' : 'idle',
      message,
    })
  }

  async function generate() {
    if (!consent || !apiKey.trim() || !payload || controller.current) return
    const active = new AbortController()
    controller.current = active
    const current = ++generation.current
    setState({ status: 'loading', items: [], message: 'Solicitando un orden…' })
    try {
      const items = await request({
        provider,
        apiKey,
        context,
        signal: active.signal,
      })
      if (active.signal.aborted || current !== generation.current) return
      setState({
        status: 'done',
        items,
        message: 'Orden sugerido. Tú decides qué escuchar o revalorar.',
      })
    } catch (error) {
      if (active.signal.aborted || current !== generation.current) return
      setState({
        status: 'error',
        items: [],
        message:
          error instanceof RecommendationRequestError
            ? new RecommendationRequestError(error.code).message
            : 'No pudimos obtener recomendaciones. Puedes volver a intentarlo.',
      })
    } finally {
      if (current === generation.current) controller.current = null
    }
  }

  return (
    <section className="integration-panel" aria-labelledby={headingId}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Tu biblioteca</p>
          <h2 id={headingId}>Recomendaciones de escucha</h2>
        </div>
        <button
          type="button"
          className="action-button"
          onClick={() => {
            cancel()
            onClose()
          }}
        >
          Volver a la biblioteca
        </button>
      </div>
      <p>
        Una sugerencia para volver a escuchar o revalorar álbumes que ya has
        guardado, tomando tus últimas incorporaciones como contexto. No cambia
        tus calificaciones ni tu estado de escucha.
      </p>
      <div className="form-field">
        <label className="field-label" htmlFor={providerId}>
          Proveedor
        </label>
        <select
          id={providerId}
          value={provider}
          onChange={(event) => {
            cancel()
            setConsent(false)
            onProviderChange(event.target.value as RecommendationProvider)
          }}
        >
          <option value="groq">Groq</option>
          <option value="gemini">Gemini</option>
        </select>
      </div>
      <p className="text-muted">Modelo: {recommendationModels[provider]}</p>
      <p className="text-muted">
        Compatible con el nivel gratuito, sujeto a disponibilidad y cuotas de tu
        cuenta. Mantén tu cuenta en Free; Auditorium no activa facturación ni
        comprueba el plan asociado a tu clave. El servicio requiere una cuenta
        propia y cumplir las condiciones del proveedor.
      </p>
      <p className="text-muted">
        {details.disclosure}{' '}
        <a href={details.privacy} target="_blank" rel="noopener noreferrer">
          Privacidad de {details.name}
        </a>{' '}
        ·{' '}
        <a href={details.pricing} target="_blank" rel="noopener noreferrer">
          Nivel gratuito y límites de {details.name}
        </a>
      </p>
      <div className="form-field">
        <label className="field-label" htmlFor={keyId}>
          Clave API de {details.name}
        </label>
        <input
          id={keyId}
          type="password"
          value={apiKey}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          onChange={(event) => {
            cancel()
            setConsent(false)
            onKeyChange(event.target.value)
          }}
        />
      </div>
      <p className="text-muted">
        La clave permanece sólo en la memoria de esta pestaña hasta recargar,
        cerrarla o pulsar «Olvidar clave». Tu navegador y sus extensiones con
        permisos pueden acceder a ella. No se incluye en los respaldos.
      </p>
      <button
        type="button"
        className="action-button"
        disabled={!apiKey}
        onClick={() => {
          cancel('Clave olvidada. No se enviarán más solicitudes con ella.')
          setConsent(false)
          onKeyChange('')
        }}
      >
        Olvidar clave
      </button>

      {payload ? (
        <>
          <details className="recommendation-preview">
            <summary>
              {context.candidates.length === 1
                ? 'Revisar el álbum que se enviará'
                : `Revisar los ${context.candidates.length} álbumes que se enviarán`}
            </summary>
            <p className="text-muted">
              Se enviarán título, artista, año, puntuación, estado manual de
              escucha, orden de incorporación y referencias temporales. Los
              primeros ocho como máximo son las últimas incorporaciones; se
              completa con pendientes, sin puntuar y antiguos hasta 24. No se
              envían fechas exactas, identificadores locales, notas, compras,
              deseos, fotos ni tu identidad.
            </p>
            <ol className="recommendation-candidates">
              {payload.candidates.map((candidate) => (
                <li key={candidate.reference}>
                  <strong>{candidate.title}</strong> · {candidate.artist}
                  <span className="text-muted">
                    {' '}
                    · Año: {candidate.year ?? 'sin registrar'} · Puntuación:{' '}
                    {candidate.score === null
                      ? 'sin puntuar'
                      : `${formatScore(candidate.score)}/10`}{' '}
                    · {listeningLabels[candidate.listeningStatus]} · Orden de
                    incorporación: {candidate.addedOrder} · Referencia:{' '}
                    {candidate.reference}
                    {payload.recentReferences.includes(candidate.reference)
                      ? ' · Incorporación reciente'
                      : ''}
                  </span>
                </li>
              ))}
            </ol>
          </details>
          <label className="consent-label">
            <input
              type="checkbox"
              checked={consent}
              disabled={loading}
              onChange={(event) => setConsent(event.target.checked)}
            />{' '}
            Acepto enviar estos datos a {details.name} para generar este orden,
            según sus condiciones de privacidad.
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="primary-button"
              disabled={loading || !consent || !apiKey.trim()}
              onClick={() => void generate()}
            >
              Generar recomendaciones
            </button>
            {loading ? (
              <button
                type="button"
                className="action-button"
                onClick={() =>
                  cancel('Solicitud cancelada. Puedes volver a intentarlo.')
                }
              >
                Cancelar solicitud
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p>Guarda algún álbum para obtener recomendaciones de tu biblioteca.</p>
      )}
      <p
        role="status"
        className={state.status === 'error' ? 'field-error' : 'text-muted'}
      >
        {state.message}
      </p>
      {state.items.length ? (
        <ol className="recommendation-results" aria-label="Orden recomendado">
          {state.items.map((item) => {
            const album = albumsById.get(item.entryId)
            if (!album) return null
            return (
              <li key={item.entryId}>
                <h3>{album.title}</h3>
                <p>{album.artist}</p>
                <p className="eyebrow">
                  {item.action === 'reevaluate'
                    ? 'Revalorar'
                    : 'Volver a escuchar'}
                </p>
                <p>{item.reason}</p>
                <button
                  type="button"
                  className="action-button"
                  onClick={() => {
                    cancel()
                    onOpenAlbum(item.entryId)
                  }}
                >
                  Abrir álbum {album.title}
                </button>
              </li>
            )
          })}
        </ol>
      ) : null}
    </section>
  )
}
