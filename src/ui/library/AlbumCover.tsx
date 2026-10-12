import { useState } from 'react'

export function AlbumCover({ title, url }: { title: string; url?: string }) {
  const [requested, setRequested] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div>
      {requested && url && !failed ? (
        <img
          className="album-cover-image"
          src={url}
          alt={`Portada de ${title}`}
          width={480}
          height={480}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="album-art" aria-hidden="true">
          <div className="album-disc">
            <span className="album-disc-center" />
          </div>
          <span className="album-initial">{Array.from(title)[0]}</span>
        </div>
      )}
      {!url ? (
        <p className="mt-3 text-xs text-muted">Sin portada registrada</p>
      ) : failed ? (
        <>
          <p className="mt-3 text-sm text-muted" role="status">
            No pudimos cargar la portada.
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setFailed(false)
              setRequested(true)
            }}
          >
            Reintentar portada
          </button>
        </>
      ) : !requested ? (
        <>
          <button
            type="button"
            className="text-button mt-3"
            onClick={() => setRequested(true)}
          >
            Mostrar portada
          </button>
          <p className="text-xs text-muted">
            Se cargará desde el enlace guardado.
          </p>
        </>
      ) : null}
    </div>
  )
}
