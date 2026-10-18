import { useState } from 'react'

interface AlbumCoverProps {
  title: string
  url?: string | undefined
  image?: string | undefined
  compact?: boolean
}

export function AlbumCover({
  title,
  url,
  image,
  compact = false,
}: AlbumCoverProps) {
  const source = image || url
  return (
    <CoverImage
      key={source ?? ''}
      title={title}
      source={source}
      compact={compact}
    />
  )
}

function CoverImage({
  title,
  source,
  compact,
}: {
  title: string
  source: string | undefined
  compact: boolean
}) {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  return (
    <div
      className={`cover-container${compact ? ' cover-container-compact' : ''}`}
    >
      {source && !failed ? (
        <img
          key={attempt}
          className="album-cover-image"
          src={source}
          alt={`Portada de ${title}`}
          width={480}
          height={480}
          referrerPolicy="no-referrer"
          decoding="async"
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
      {!compact &&
        (!source ? (
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
                setAttempt((value) => value + 1)
                setFailed(false)
              }}
            >
              Reintentar portada
            </button>
          </>
        ) : null)}
    </div>
  )
}
