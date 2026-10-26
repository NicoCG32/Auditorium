import { genreKey } from '../../domain/catalog/genre-key'
import type { AlbumGenreRating } from '../../domain/library/schemas'
import { unitsToScore } from '../../domain/library/scores'
import { formatScore } from './labels'

export function GenreRatingsSummary({
  labels,
  ratings,
  releases,
  selected,
}: {
  labels: string[]
  ratings: AlbumGenreRating[]
  releases: Map<string, string>
  selected?: string
}) {
  const genres = [
    ...new Map(labels.map((label) => [genreKey(label), label])).entries(),
  ]
  const description = (key: string) => {
    const note = ratings.find((row) => row.genreKey === key)
    return note
      ? `${formatScore(unitsToScore(note.scoreUnits))} / 10`
      : 'Sin valoración en este género'
  }
  return (
    <div className="mt-4">
      {selected ? (
        <p className="text-sm font-semibold wrap-anywhere">
          Comparación en{' '}
          {genres.find(([key]) => key === selected)?.[1] ?? selected}:{' '}
          {description(selected)}
        </p>
      ) : null}
      {genres.length ? (
        <details className="mt-3">
          <summary>Valoraciones por género ({ratings.length})</summary>
          <dl className="mt-3 grid gap-3">
            {genres.map(([key, label]) => {
              const note = ratings.find((row) => row.genreKey === key)
              return (
                <div key={key} className="genre-rating-row">
                  <dt className="font-semibold wrap-anywhere">{label}</dt>
                  <dd className="mt-2 text-sm">
                    {description(key)}
                    {note?.referenceReleaseId ? (
                      <span className="mt-1 block text-xs text-muted">
                        Edición de referencia:{' '}
                        {releases.get(note.referenceReleaseId)}
                      </span>
                    ) : null}
                  </dd>
                </div>
              )
            })}
          </dl>
        </details>
      ) : null}
    </div>
  )
}
