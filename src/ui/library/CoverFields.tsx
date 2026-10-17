import { useEffect, useId, useRef, useState } from 'react'
import {
  CoverImageError,
  readCoverImage,
} from '../../infrastructure/browser/cover-image'
import { AlbumCover } from './AlbumCover'

interface CoverFieldsProps {
  url: string
  image?: string | undefined
  onChange: (value: {
    coverUrl: string
    coverImage: string | undefined
  }) => void
  onBusyChange?: (busy: boolean) => void
  disabled?: boolean | undefined
  error?: string | undefined
}

const fileErrors = {
  type: 'Elige un archivo JPG o PNG.',
  size: 'La portada puede ocupar como máximo 2 MiB.',
  invalid: 'El archivo no contiene una imagen JPG o PNG válida.',
  dimensions:
    'La imagen es demasiado grande. Usa hasta 8192 píxeles por lado y 32 megapíxeles.',
  aborted: '',
}

function httpsUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'https:' ? parsed.href : undefined
  } catch {
    return undefined
  }
}

export function CoverFields({
  url,
  image,
  onChange,
  onBusyChange,
  disabled,
  error,
}: CoverFieldsProps) {
  const id = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const pending = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileError, setFileError] = useState('')
  const validUrl = httpsUrl(url)
  const [previewUrl, setPreviewUrl] = useState(validUrl)

  useEffect(() => {
    const timer = setTimeout(() => setPreviewUrl(validUrl), 500)
    return () => clearTimeout(timer)
  }, [validUrl])

  useEffect(() => {
    return () => pending.current?.abort()
  }, [url, image])

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    return () => onBusyChange?.(false)
  }, [onBusyChange])

  const cancelRead = () => {
    pending.current?.abort()
    pending.current = null
    setBusy(false)
  }

  const chooseFile = async (file: File) => {
    cancelRead()
    const controller = new AbortController()
    pending.current = controller
    setFileError('')
    setBusy(true)
    try {
      const result = await readCoverImage(file, { signal: controller.signal })
      if (pending.current !== controller || controller.signal.aborted) return
      onChange({ coverUrl: '', coverImage: result })
    } catch (cause) {
      if (pending.current !== controller || controller.signal.aborted) return
      setFileError(
        cause instanceof CoverImageError
          ? fileErrors[cause.code]
          : fileErrors.invalid,
      )
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setBusy(false)
      }
    }
  }

  const displayedError = fileError || error
  return (
    <div className="cover-fields">
      <label htmlFor={`${id}-url`}>Enlace a portada (HTTPS)</label>
      <input
        id={`${id}-url`}
        name="coverUrl"
        type="url"
        value={url}
        disabled={disabled}
        aria-describedby={`${id}-help${displayedError ? ` ${id}-error` : ''}`}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          cancelRead()
          setFileError('')
          if (fileInput.current) fileInput.current.value = ''
          onChange({ coverUrl: event.target.value, coverImage: undefined })
        }}
      />
      <label htmlFor={`${id}-file`}>Archivo de portada (JPG o PNG)</label>
      <input
        ref={fileInput}
        id={`${id}-file`}
        name="coverImage"
        type="file"
        accept="image/jpeg,image/png"
        disabled={disabled}
        aria-describedby={`${id}-help${displayedError ? ` ${id}-error` : ''}`}
        aria-invalid={Boolean(fileError)}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void chooseFile(file)
        }}
      />
      <p id={`${id}-help`} className="text-xs text-muted">
        Máximo 2 MiB. El archivo queda en esta biblioteca y sus respaldos. Un
        enlace carga la imagen desde su sitio de origen.
      </p>
      {busy && <p role="status">Preparando portada…</p>}
      {displayedError && (
        <p id={`${id}-error`} className="form-error" role="alert">
          {displayedError}
        </p>
      )}
      {(url || image) && (
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => {
            cancelRead()
            setFileError('')
            if (fileInput.current) fileInput.current.value = ''
            onChange({ coverUrl: '', coverImage: undefined })
          }}
        >
          Quitar portada
        </button>
      )}
      {(image || (validUrl && previewUrl === validUrl)) && (
        <div className="cover-fields-preview">
          <p className="text-xs text-muted">Vista previa de portada</p>
          <AlbumCover
            title="vista previa"
            url={previewUrl === validUrl ? previewUrl : undefined}
            image={image}
          />
        </div>
      )}
    </div>
  )
}
