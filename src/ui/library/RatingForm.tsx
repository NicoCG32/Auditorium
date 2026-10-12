import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { formatScore } from './labels'
import { parseRating } from './parse-rating'

interface Props {
  kind: 'album' | 'track'
  title: string
  score: number | undefined
  onChangeScore: (score: number | undefined) => Promise<void>
  onCommitted: () => Promise<unknown>
  onClose?: () => void
  onBusyChange: (busy: boolean) => void
  blocked: boolean
}
export function RatingForm({
  kind,
  title,
  score,
  onChangeScore,
  onCommitted,
  onBusyChange,
  blocked,
  onClose,
}: Props) {
  const isTrack = kind === 'track'
  const prefix = `${kind}-rating`
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
    if (kind === 'track') input.current?.focus()
  }, [kind])
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
      await onChangeScore(next)
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
    setNotice(
      next === undefined
        ? isTrack
          ? 'Nota de pista quitada.'
          : 'Nota quitada.'
        : isTrack
          ? 'Nota de pista guardada.'
          : 'Nota guardada.',
    )
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
    <section className="rating-panel" aria-labelledby={`${prefix}-title`}>
      <h3
        id={`${prefix}-title`}
        className="text-lg font-semibold wrap-anywhere"
      >
        {title}
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
          <label className="field-label" htmlFor={`${kind}-score`}>
            {isTrack ? 'Nota de la pista' : 'Nota del álbum'}
          </label>
          <input
            ref={input}
            id={`${kind}-score`}
            type="text"
            inputMode="decimal"
            value={draft}
            placeholder="Por ejemplo, 9,5"
            aria-invalid={Boolean(validation)}
            aria-describedby={
              validation
                ? `${prefix}-help ${prefix}-validation`
                : `${prefix}-help`
            }
            onChange={(event) => {
              setDraft(event.target.value)
              setValidation('')
              setFailure('')
              setNotice('')
            }}
          />
          <p
            id={`${prefix}-help`}
            className="mt-2 text-xs leading-relaxed text-muted"
          >
            De 1 a 10, en pasos de 0,5. Puedes usar coma o punto.{' '}
            {isTrack
              ? 'La nota se comparte entre las apariciones de esta pista. Las variantes tienen nota propia y la del álbum no cambia.'
              : 'La nota del álbum es independiente de las pistas.'}
          </p>
          {validation ? (
            <p id={`${prefix}-validation`} className="field-error" role="alert">
              {validation}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="submit" className="primary-button">
              {isTrack ? 'Guardar nota de pista' : 'Guardar nota'}
            </button>
            <button
              type="button"
              className="action-button"
              disabled={current === undefined}
              onClick={() => {
                void change(undefined)
              }}
            >
              {isTrack ? 'Quitar nota de pista' : 'Quitar nota'}
            </button>
            {onClose ? (
              <button type="button" className="text-button" onClick={onClose}>
                Cerrar valoración de pista
              </button>
            ) : null}
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
          {isTrack
            ? 'Reintentar lectura de nota de pista'
            : 'Reintentar lectura'}
        </button>
      ) : null}
    </section>
  )
}
