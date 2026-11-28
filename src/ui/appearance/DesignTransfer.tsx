import { useEffect, useRef, useState } from 'react'
import {
  MAX_DESIGN_BYTES,
  parsePersonalDesign,
  serializePersonalDesign,
  type PersonalDesign,
} from '../../domain/personal-design'
import { downloadBackup } from '../../infrastructure/browser/backup-download'
import { verifyWallpaper } from '../../infrastructure/browser/wallpaper'
import { usePersonalDesign } from './personal-design-context'
import { DesignPreview } from './DesignPreview'

export function DesignTransfer({
  onApply,
  disabled,
}: {
  onApply: () => void
  disabled: boolean
}) {
  const { design, update } = usePersonalDesign()
  const [prepared, setPrepared] = useState<PersonalDesign | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const active = useRef<AbortController | null>(null)
  const confirm = useRef<HTMLButtonElement>(null)
  useEffect(() => () => active.current?.abort(), [])
  useEffect(() => {
    if (prepared) confirm.current?.focus()
  }, [prepared])
  async function select(file: File | undefined) {
    if (!file || disabled) return
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setError('')
    setMessage('')
    setPrepared(null)
    setBusy(true)
    try {
      if (file.size > MAX_DESIGN_BYTES) throw new Error()
      const candidate = parsePersonalDesign(await file.text())
      controller.signal.throwIfAborted()
      if (candidate.wallpaper)
        await verifyWallpaper(candidate.wallpaper, controller.signal)
      controller.signal.throwIfAborted()
      setPrepared(candidate)
    } catch {
      if (!controller.signal.aborted)
        setError(
          'Este archivo no contiene un diseño válido de Auditorium. Tu diseño actual se conserva.',
        )
    } finally {
      if (active.current === controller) {
        active.current = null
        setBusy(false)
      }
    }
  }
  return (
    <details className="design-details">
      <summary>Guardar o abrir un diseño</summary>
      <p className="appearance-note">
        Lleva a otro dispositivo el fondo, los colores, el tema y la
        presentación de tu colección. También se incluyen en el respaldo
        completo.
      </p>
      <div className="design-file-actions">
        <button
          type="button"
          className="action-button"
          disabled={disabled || busy}
          onClick={() => {
            try {
              downloadBackup(
                serializePersonalDesign(design),
                new Date().toISOString(),
                'auditorium-diseno',
              )
              setError('')
              setMessage(
                'Descarga del diseño iniciada. Guarda el archivo en tu equipo.',
              )
            } catch {
              setError('No pudimos descargar el diseño. Vuelve a intentarlo.')
            }
          }}
        >
          Guardar diseño
        </button>
        <label className="design-upload">
          Abrir diseño
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Abrir diseño"
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              void select(file)
            }}
          />
        </label>
      </div>
      {busy && <p role="status">Revisando el diseño…</p>}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {prepared && (
        <div className="design-import-preview">
          <p>
            Así se verá tu colección. Puedes aplicar el diseño o conservar el
            actual.
          </p>
          <DesignPreview design={prepared} />
          <div className="design-file-actions">
            <button
              type="button"
              className="action-button"
              onClick={() => setPrepared(null)}
            >
              Conservar diseño actual
            </button>
            <button
              ref={confirm}
              type="button"
              className="primary-button"
              disabled={disabled}
              onClick={() => {
                onApply()
                if (update(() => prepared, false)) {
                  setPrepared(null)
                  setMessage('Diseño aplicado y guardado.')
                }
              }}
            >
              Aplicar diseño
            </button>
          </div>
        </div>
      )}
    </details>
  )
}
