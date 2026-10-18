import { useEffect, useId, useRef, useState } from 'react'
import {
  CatalogLookupError,
  normalizeCatalogText,
  type CatalogCandidate,
  type CatalogLookupClient,
} from '../../application/catalog-lookup'
import { wikidataCatalogClient } from '../../infrastructure/catalog/wikidata-client'
import { releaseTypeLabels } from '../library/labels'

export interface CatalogLookupPanelProps {
  title: string
  artist: string
  onSelect: (candidate: CatalogCandidate) => void
  disabled?: boolean
  client?: CatalogLookupClient
}

interface SearchState {
  status: 'idle' | 'loading' | 'done' | 'error' | 'manual'
  candidates: CatalogCandidate[]
  message: string
}

const initial: SearchState = { status: 'idle', candidates: [], message: '' }

export function CatalogLookupPanel(props: CatalogLookupPanelProps) {
  return (
    <CatalogSearchSession
      key={JSON.stringify([props.title, props.artist, props.disabled ?? false])}
      {...props}
    />
  )
}

function CatalogSearchSession({
  title,
  artist,
  onSelect,
  disabled = false,
  client = wikidataCatalogClient,
}: CatalogLookupPanelProps) {
  const headingId = useId()
  const [state, setState] = useState<SearchState>(initial)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)

  useEffect(
    () => () => {
      generation.current += 1
      controller.current?.abort()
    },
    [],
  )
  function manual() {
    generation.current += 1
    controller.current?.abort()
    controller.current = null
    setState({
      status: 'manual',
      candidates: [],
      message: 'Puedes continuar con el registro manual.',
    })
  }

  async function search() {
    if (controller.current || disabled) return
    const active = new AbortController()
    controller.current = active
    const current = ++generation.current
    setState({
      status: 'loading',
      candidates: [],
      message: 'Consultando Wikidata…',
    })
    try {
      const candidates = await client.search({
        title,
        artist,
        signal: active.signal,
      })
      if (current !== generation.current || active.signal.aborted) return
      setState({
        status: 'done',
        candidates,
        message: candidates.length
          ? `${candidates.length} referencias para revisar. Confirma artista y álbum.`
          : 'No encontramos referencias en esta consulta. Puedes registrar el álbum manualmente.',
      })
    } catch (error) {
      if (current !== generation.current) return
      if (active.signal.aborted) {
        setState(initial)
        return
      }
      setState({
        status: 'error',
        candidates: [],
        message:
          error instanceof CatalogLookupError
            ? error.message
            : 'No pudimos consultar Wikidata. Puedes continuar con el registro manual.',
      })
    } finally {
      if (current === generation.current) controller.current = null
    }
  }

  return (
    <section className="catalog-lookup" aria-labelledby={headingId}>
      <h3 id={headingId}>Buscar referencia de catálogo</h3>
      <p className="muted">
        Consulta opcional a Wikidata: se envía el título a ese servicio. Su
        catálogo puede estar incompleto; el guardado manual siempre está
        disponible.
      </p>
      <div className="form-actions">
        <button
          type="button"
          disabled={disabled || state.status === 'loading' || !title.trim()}
          onClick={() => void search()}
        >
          Buscar en Wikidata
        </button>
        {state.status === 'loading' ? (
          <button type="button" disabled={disabled} onClick={manual}>
            Cancelar búsqueda
          </button>
        ) : null}
        <button type="button" disabled={disabled} onClick={manual}>
          Continuar con el registro manual
        </button>
      </div>
      <p
        role="status"
        className={state.status === 'error' ? 'field-error' : 'muted'}
      >
        {state.message}
      </p>
      {state.candidates.length ? (
        <ul className="catalog-candidates">
          {state.candidates.map((candidate) => {
            const artistMatches = candidate.artists.some(
              (name) =>
                normalizeCatalogText(name) === normalizeCatalogText(artist),
            )
            return (
              <li key={candidate.id} className="catalog-candidate">
                <h4>{candidate.title}</h4>
                <p>{candidate.artists.join(' · ')}</p>
                <p className="muted">
                  {releaseTypeLabels[candidate.releaseType]}
                  {candidate.originalYear ? ` · ${candidate.originalYear}` : ''}
                </p>
                {candidate.description ? <p>{candidate.description}</p> : null}
                {artist.trim() && !artistMatches ? (
                  <p>
                    El artista no coincide con el texto escrito. Revisa esta
                    referencia.
                  </p>
                ) : null}
                {candidate.warnings?.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
                <p>
                  <a
                    href={`https://www.wikidata.org/wiki/${encodeURIComponent(candidate.catalogReference.entityId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    Ver fuente Wikidata · {candidate.id}
                  </a>
                </p>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setState({
                      status: 'done',
                      candidates: [],
                      message:
                        'Referencia seleccionada. Revisa el borrador antes de guardar.',
                    })
                    onSelect(candidate)
                  }}
                >
                  Revisar {candidate.title}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
