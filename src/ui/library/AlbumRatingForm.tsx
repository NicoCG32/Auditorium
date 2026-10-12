import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { MusicLibrary } from '../../application/music-library'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { formatScore } from './labels'
import { parseRating } from './parse-rating'

interface Props {
  entryId: string
  score: number | undefined
  library: MusicLibrary
  onCommitted: () => Promise<void>
  onBusyChange: (busy: boolean) => void
  blocked: boolean
}
export function AlbumRatingForm({
  entryId,
  score,
  library,
  onCommitted,
  onBusyChange,
  blocked,
}: Props) {
  const [draft, setDraft] = useState(() =>
    score === undefined ? '' : formatScore(score),
  )
  const [validation, setValidation] = useState('')
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ score: number | undefined }>()
  const input = useRef<HTMLInputElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const locked = useRef(false)
  const focusInput = useRef(false)
  const current = pending ? pending.score : score
  useEffect(() => {
    if (busy) return
    if (pending && failure) retry.current?.focus()
    else if (!pending && focusInput.current) {
      input.current?.focus()
      focusInput.current = false
    }
  }, [busy, pending, failure])
  async function synchronize() {
    try {
      await onCommitted()
      setPending(undefined)
      setFailure('')
      onBusyChange(false)
      focusInput.current = true
    } catch {
      setFailure(
        'El cambio se guardó, pero no pudimos actualizar la ficha. Reintenta la lectura para continuar.',
      )
      // El cambio ya se confirmó; reintentar aquí nunca repite la escritura.
    }
  }
  async function change(next: number | undefined) {
    if (locked.current || pending || blocked) return
    locked.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    setNotice('')
    setValidation('')
    try {
      if (next === undefined) await library.removeAlbumRating(entryId)
      else await library.rateAlbum(entryId, next)
    } catch (error) {
      setFailure(
        error instanceof LocalStorageError && error.code === 'quota_exceeded'
          ? 'No hay espacio para guardar la nota. La nota anterior se conserva; libera espacio y vuelve a intentar.'
          : 'No se pudo cambiar la nota. La nota anterior se conserva; vuelve a intentar.',
      )
      onBusyChange(false)
      setBusy(false)
      locked.current = false
      focusInput.current = true
      return
    }
    setPending({ score: next })
    setDraft(next === undefined ? '' : formatScore(next))
    setNotice(next === undefined ? 'Nota quitada.' : 'Nota guardada.')
    await synchronize()
    setBusy(false)
    locked.current = false
  }
  async function retryRead() {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    await synchronize()
    setBusy(false)
    locked.current = false
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current || pending || blocked) return
    const value = parseRating(draft)
    if (value === undefined) {
      setValidation('Escribe una nota de 1 a 10 en pasos de 0,5.')
      input.current?.focus()
      return
    }
    void change(value)
  }
  return (
    <section className="rating-panel" aria-labelledby="rating-title">
      <h3 id="rating-title" className="text-lg font-semibold">
        Tu valoración del álbum
      </h3>
      <p className="mt-3 text-sm">
        Nota guardada:{' '}
        <strong className="text-accent-text">
          {current === undefined ? 'Sin nota' : `${formatScore(current)} / 10`}
        </strong>
      </p>
      <form onSubmit={submit} noValidate autoComplete="off">
        <fieldset
          disabled={busy || pending !== undefined || blocked}
          className="mt-5 min-w-0"
        >
          <label className="field-label" htmlFor="album-score">
            Nota del álbum
          </label>
          <input
            ref={input}
            id="album-score"
            type="text"
            inputMode="decimal"
            value={draft}
            placeholder="Por ejemplo, 9,5"
            aria-invalid={Boolean(validation)}
            aria-describedby={
              validation ? 'rating-help rating-validation' : 'rating-help'
            }
            onChange={(event) => {
              setDraft(event.target.value)
              setValidation('')
              setFailure('')
              setNotice('')
            }}
          />
          <p
            id="rating-help"
            className="mt-2 text-xs leading-relaxed text-muted"
          >
            De 1 a 10, en pasos de 0,5. Puedes usar coma o punto. La nota del
            álbum es independiente de las pistas.
          </p>
          {validation ? (
            <p id="rating-validation" className="field-error" role="alert">
              {validation}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="submit" className="primary-button">
              Guardar nota
            </button>
            <button
              type="button"
              className="action-button"
              disabled={current === undefined}
              onClick={() => {
                void change(undefined)
              }}
            >
              Quitar nota
            </button>
          </div>
        </fieldset>
      </form>
      {notice ? (
        <p role="status" className="mt-3 text-sm text-accent-text">
          {notice}
        </p>
      ) : null}
      {failure ? (
        <p className="field-error" role="alert">
          {failure}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {pending ? 'Actualizando ficha…' : 'Guardando cambio…'}
        </p>
      ) : null}
      {pending && failure ? (
        <button
          ref={retry}
          type="button"
          className="action-button mt-4"
          disabled={busy}
          onClick={() => {
            void retryRead()
          }}
        >
          Reintentar lectura
        </button>
      ) : null}
    </section>
  )
}
