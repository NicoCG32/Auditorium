import { useEffect, useRef, useState } from 'react'
import { projectRemovedAlbums } from '../../application/library-query'
import type { MusicLibrary } from '../../application/music-library'
import {
  personalEntryData,
  personalEntryToken,
} from '../../domain/library/personal-entry'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'
import { formatCount } from './labels'

export function RemovedAlbumsPanel({
  snapshot,
  library,
  blocked,
  onBusyChange,
  onCommitted,
  onRestored,
  onBack,
  onOpenActive,
}: {
  snapshot: LocalSnapshot
  library: MusicLibrary
  blocked: boolean
  onBusyChange: (busy: boolean) => void
  onCommitted: () => Promise<LocalSnapshot>
  onRestored: (entryId: string) => void
  onBack: () => void
  onOpenActive: (entryId: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<string>()
  const [failure, setFailure] = useState('')
  const lock = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const error = useRef<HTMLParagraphElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  useEffect(() => {
    if (busy) return
    if (pending && failure) retry.current?.focus()
    else if (failure) error.current?.focus()
  }, [busy, failure, pending])
  const removed = projectRemovedAlbums(snapshot).filter(
    (row) => row.id !== pending,
  )
  const disabled = busy || blocked || Boolean(pending)
  async function read(entryId: string) {
    try {
      await onCommitted()
      onBusyChange(false)
      onRestored(entryId)
    } catch {
      setFailure(
        'El álbum ya se restauró con sus datos, pero no pudimos actualizar la biblioteca. Reintenta la lectura para continuar.',
      )
    }
  }
  async function restore(entryId: string) {
    if (lock.current || disabled) return
    lock.current = true
    setBusy(true)
    onBusyChange(true)
    setFailure('')
    try {
      await library.restorePersonalAlbum(
        entryId,
        personalEntryToken(snapshot.library, entryId),
      )
    } catch {
      setFailure(
        'No se pudo restaurar. El álbum y sus datos se conservan; actualiza la biblioteca para comprobar si cambiaron o si existe otra entrada activa.',
      )
      onBusyChange(false)
      setBusy(false)
      lock.current = false
      return
    }
    setPending(entryId)
    await read(entryId)
    setBusy(false)
    lock.current = false
  }
  async function retryRead() {
    if (lock.current || !pending) return
    lock.current = true
    setBusy(true)
    await read(pending)
    setBusy(false)
    lock.current = false
  }
  return (
    <section aria-labelledby="removed-albums-title">
      <button
        type="button"
        className="text-button mb-6"
        disabled={disabled}
        onClick={onBack}
      >
        Volver a biblioteca
      </button>
      <h2
        id="removed-albums-title"
        ref={heading}
        tabIndex={-1}
        className="text-3xl font-semibold"
      >
        Álbumes retirados
      </h2>
      <p className="mt-3 text-sm text-muted">
        Sus datos personales siguen guardados. Restaurar recupera la misma
        entrada, con escucha, notas, valoraciones, deseos y ejemplares. No se
        fusionan entradas distintas.
      </p>
      {pending ? (
        <p role="status" className="mt-4 text-sm">
          Álbum restaurado con sus datos personales.
        </p>
      ) : null}
      {failure ? (
        <p
          role="alert"
          ref={error}
          tabIndex={-1}
          className="mt-4 text-sm wrap-anywhere"
        >
          {failure}
        </p>
      ) : null}
      {pending && failure ? (
        <button
          ref={retry}
          type="button"
          className="primary-button mt-4"
          disabled={busy}
          onClick={() => void retryRead()}
        >
          Reintentar lectura tras restaurar
        </button>
      ) : null}
      {removed.length ? (
        <ul aria-label="Álbumes retirados" className="mt-6 grid gap-4">
          {removed.map((album) => {
            const data = personalEntryData(snapshot.library, album.id)
            const active = snapshot.library.userAlbums.find(
              (row) =>
                row.id !== album.id &&
                row.albumId === album.albumId &&
                row.deletedAt === undefined,
            )
            return (
              <li key={album.id} className="owned-card">
                <h3 className="text-xl font-semibold wrap-anywhere">
                  {album.title}
                </h3>
                <p className="mt-2 text-muted wrap-anywhere">
                  {album.artist} · Entrada {album.id.slice(-8)}
                </p>
                <p className="mt-3 text-sm">
                  Datos conservados:{' '}
                  {formatCount(
                    data.ownedItems.length,
                    'ejemplar',
                    'ejemplares',
                  )}
                  , {formatCount(data.purchaseWishes.length, 'deseo', 'deseos')}{' '}
                  y{' '}
                  {formatCount(
                    data.trackRatings.length,
                    'valoración de pista',
                    'valoraciones de pistas',
                  )}
                  {' y '}
                  {formatCount(
                    data.albumGenreRatings.length,
                    'valoración por género',
                    'valoraciones por género',
                  )}
                  .{' '}
                  {data.albumRating
                    ? 'Nota del álbum conservada.'
                    : 'Sin nota del álbum.'}{' '}
                  Escucha y notas personales conservadas.
                </p>
                {active ? (
                  <>
                    <p className="mt-3 text-sm">
                      Ya hay otra entrada activa de este álbum. Ambas se
                      conservan; revisa la activa antes de decidir.
                    </p>
                    <button
                      type="button"
                      className="text-button mt-3"
                      disabled={disabled}
                      onClick={() => onOpenActive(active.id)}
                    >
                      Abrir entrada activa de {album.title}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="primary-button mt-4"
                    disabled={disabled}
                    onClick={() => void restore(album.id)}
                    aria-label={`Restaurar ${album.title}, entrada ${album.id.slice(-8)}`}
                  >
                    Restaurar álbum
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-6 text-muted">No hay álbumes retirados.</p>
      )}
    </section>
  )
}
