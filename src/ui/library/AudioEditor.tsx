import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocalAudio } from '../../application/local-audio'
import {
  AudioError,
  validateAudioBudget,
  type AudioAttachment,
  type AudioDraft,
} from '../../domain/audio'
import type { Track } from '../../domain/catalog/schemas'
import { preparePersonalAudio } from '../../infrastructure/browser/audio-file'
import { LocalAudioPlayer } from './LocalAudioPlayer'

export function AudioEditor({
  value,
  onChange,
  service,
  tracks,
  disabled,
  onBusyChange,
  outside = [],
  ready = true,
  error = '',
  onReload,
}: {
  value: AudioDraft
  onChange: (value: AudioDraft) => void
  service: LocalAudio
  tracks: Track[]
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  outside?: AudioAttachment[]
  ready?: boolean
  error?: string
  onReload: () => void
}) {
  const [message, setMessage] = useState(''),
    [preparing, setPreparing] = useState(false),
    [replacement, setReplacement] = useState('')
  const controller = useRef<AbortController | undefined>(undefined)
  const input = useRef<HTMLInputElement>(null)
  useEffect(
    () => () => {
      const active = controller.current
      controller.current = undefined
      active?.abort()
    },
    [],
  )
  const cancel = useCallback(() => {
    const active = controller.current
    controller.current = undefined
    active?.abort()
    setPreparing(false)
    onBusyChange(false)
    setMessage('Selección cancelada. Los archivos anteriores se conservan.')
  }, [onBusyChange])
  useEffect(() => {
    const element = input.current
    element?.addEventListener('cancel', cancel)
    return () => element?.removeEventListener('cancel', cancel)
  }, [cancel])
  async function select(file: File | undefined) {
    if (!file) {
      cancel()
      return
    }
    controller.current?.abort()
    const active = new AbortController()
    controller.current = active
    setPreparing(true)
    onBusyChange(true)
    setMessage('Comprobando el archivo local…')
    try {
      validateAudioBudget([
        ...outside,
        ...value.items.filter((row) => row.id !== replacement),
        { size: file.size },
      ])
      const item = await preparePersonalAudio(file, active.signal)
      if (controller.current !== active) return
      const previous = value.items.find((row) => row.id === replacement)
      if (replacement && !previous)
        throw new AudioError(
          'conflict',
          'El archivo que querías reemplazar ya no está en el borrador.',
        )
      onChange({
        ...value,
        items: [
          ...value.items.filter((row) => row.id !== replacement),
          {
            ...item,
            ...(previous
              ? {
                  id: previous.id,
                  ...(previous.trackId ? { trackId: previous.trackId } : {}),
                }
              : {}),
          },
        ],
      })
      setReplacement('')
      setMessage(
        'Archivo validado y añadido al borrador. Guarda los cambios para conservarlo en este dispositivo.',
      )
    } catch (error) {
      if (controller.current === active)
        setMessage(
          error instanceof Error
            ? error.message
            : 'No se pudo preparar el archivo. El anterior se conserva.',
        )
    } finally {
      if (controller.current === active) {
        controller.current = undefined
        setPreparing(false)
        onBusyChange(false)
      }
    }
  }
  return (
    <fieldset className="audio-editor" disabled={disabled}>
      <legend className="font-semibold">Audio en este dispositivo</legend>
      <p className="mt-3 text-sm text-muted">
        Archivos propios: hasta 16 MiB cada uno, 128 adjuntos y 128 MiB por
        biblioteca local. Se conservarán al guardar. La cuenta y el respaldo
        JSON no incluyen audio; usa el respaldo completo ZIP para trasladarlo o
        recuperarlo. El navegador puede eliminar datos del sitio: conserva tus
        originales.
      </p>
      <p className="mt-2 text-xs text-muted">
        Adjuntar o reproducir audio mantiene independientes tu nota, escucha y
        adquisiciones.
      </p>
      {error ? (
        <div role="alert" className="mt-3">
          <p>{error}</p>
          <button type="button" className="action-button" onClick={onReload}>
            Reintentar lectura de audio
          </button>
          <p className="text-sm">
            Puedes guardar los datos del álbum sin modificar sus archivos.
          </p>
        </div>
      ) : null}
      {!ready && !error ? <p role="status">Leyendo adjuntos locales…</p> : null}
      <label className="mt-4 block">
        <span className="field-label">Destino del audio seleccionado</span>
        <select
          value={replacement}
          disabled={!ready || preparing}
          onChange={(event) => setReplacement(event.target.value)}
        >
          <option value="">Añadir archivo</option>
          {value.items.map((row) => (
            <option key={row.id} value={row.id}>
              Reemplazar {row.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-4 block">
        <span className="field-label">Seleccionar archivo de audio propio</span>
        <input
          ref={input}
          type="file"
          accept="audio/*,.flac,.opus,.m4a,.aac,.webm,.ogg,.wav,.mp3"
          disabled={!ready || preparing}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            void select(file)
          }}
        />
      </label>
      {preparing ? (
        <button type="button" className="text-button mt-3" onClick={cancel}>
          Cancelar selección de audio
        </button>
      ) : null}
      {message ? (
        <p role="status" className="mt-3 text-sm wrap-anywhere">
          {message}
        </p>
      ) : null}
      {value.items.length ? (
        <ul className="audio-items mt-4 grid gap-4">
          {value.items.map((row) => (
            <li key={row.id} className="audio-item">
              <p className="font-semibold wrap-anywhere">{row.name}</p>
              <p className="text-xs text-muted">
                {row.container} · {(row.size / 1024 / 1024).toFixed(2)} MiB
                {row.bytes ? ' · Sin guardar' : ''}
              </p>
              <label className="mt-3 block">
                <span className="field-label">
                  Pista de referencia para {row.name}
                </span>
                <select
                  disabled={preparing}
                  value={row.trackId ?? ''}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      items: value.items.map((item) =>
                        item.id === row.id
                          ? {
                              ...item,
                              trackId: event.target.value || undefined,
                            }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="">Álbum completo / sin pista concreta</option>
                  {tracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.title}
                    </option>
                  ))}
                </select>
              </label>
              <LocalAudioPlayer
                key={`${row.id}:${row.sha256}`}
                name={row.name}
                disabled={disabled || preparing}
                load={async (signal) => {
                  if (row.bytes) {
                    signal.throwIfAborted()
                    return { bytes: row.bytes, mime: row.mime }
                  }
                  const expected = value.base.find((item) => item.id === row.id)
                  if (!expected)
                    throw new AudioError(
                      'conflict',
                      'El archivo no tiene una referencia guardada. Vuelve a seleccionarlo.',
                    )
                  const file = await service.read(row.id, signal, expected)
                  if (file.attachment.scope !== value.scope)
                    throw new AudioError(
                      'scope',
                      'La identidad local cambió. Vuelve a abrir el álbum.',
                    )
                  return { bytes: file.bytes, mime: file.attachment.mime }
                }}
              />
              <button
                type="button"
                className="text-button mt-3"
                disabled={preparing}
                onClick={() => {
                  onChange({
                    ...value,
                    items: value.items.filter((item) => item.id !== row.id),
                  })
                  if (replacement === row.id) setReplacement('')
                  setMessage(
                    'Retirada preparada. Guarda los cambios para eliminar la copia de Auditorium; el original del equipo se conserva.',
                  )
                }}
              >
                Retirar {row.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Sin archivos adjuntos en este álbum.
        </p>
      )}
    </fieldset>
  )
}
