import { useEffect, useRef } from 'react'
import type { Album } from '../../domain/catalog/schemas'
import type { LibraryAlbum } from '../../application/library-query'
import { formatScore, listeningLabels, releaseTypeLabels } from './labels'

export function AlbumSummary({
  album,
  entry,
  onBack,
}: {
  album: Album
  entry: LibraryAlbum
  onBack: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [entry.id])
  return (
    <section className="album-summary" aria-labelledby="album-summary-title">
      <button type="button" className="text-button mb-6" onClick={onBack}>
        Volver a biblioteca
      </button>
      <div className="album-summary-grid">
        <div className="album-art" aria-hidden="true">
          <div className="album-disc">
            <span className="album-disc-center" />
          </div>
          <span className="album-initial">{Array.from(album.title)[0]}</span>
        </div>
        <div className="min-w-0">
          <p className="mb-4 text-xs tracking-widest text-accent-text uppercase">
            En tu biblioteca
          </p>
          <h2
            id="album-summary-title"
            ref={heading}
            tabIndex={-1}
            className="text-3xl font-semibold wrap-anywhere"
          >
            {album.title}
          </h2>
          <p className="mt-3 text-lg text-muted wrap-anywhere">
            {entry.artist}
          </p>
          <dl className="mt-6 grid gap-4 text-sm">
            <div>
              <dt className="text-muted">Tipo</dt>
              <dd>{releaseTypeLabels[album.releaseType]}</dd>
            </div>
            <div>
              <dt className="text-muted">Año original</dt>
              <dd>{album.originalYear ?? 'Sin registrar'}</dd>
            </div>
            <div>
              <dt className="text-muted">Escucha</dt>
              <dd>{listeningLabels[entry.listeningStatus]}</dd>
            </div>
            <div>
              <dt className="text-muted">Nota</dt>
              <dd>
                {entry.score === undefined
                  ? 'Sin nota'
                  : `${formatScore(entry.score)} / 10`}
              </dd>
            </div>
          </dl>
          {album.description ? (
            <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed wrap-anywhere">
              {album.description}
            </p>
          ) : null}
          {album.coverUrl ? (
            <a
              className="text-button mt-5 inline-flex items-center"
              href={album.coverUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir enlace de portada
            </a>
          ) : null}
        </div>
      </div>
    </section>
  )
}
