import type { MusicLibrary } from '../../application/music-library'
import { RatingForm } from './RatingForm'

export function AlbumRatingForm({
  entryId,
  score,
  library,
  onCommitted,
  onBusyChange,
  blocked,
}: {
  entryId: string
  score: number | undefined
  library: MusicLibrary
  onCommitted: () => Promise<void>
  onBusyChange: (busy: boolean) => void
  blocked: boolean
}) {
  return (
    <RatingForm
      kind="album"
      title="Tu valoración del álbum"
      score={score}
      onChangeScore={(next, expected) =>
        next === undefined
          ? library.removeAlbumRating(entryId, expected)
          : library.rateAlbum(entryId, next)
      }
      onCommitted={onCommitted}
      onBusyChange={onBusyChange}
      blocked={blocked}
    />
  )
}
