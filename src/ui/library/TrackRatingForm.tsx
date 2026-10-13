import type { MusicLibrary } from '../../application/music-library'
import { RatingForm } from './RatingForm'

export function TrackRatingForm({
  entryId,
  trackId,
  title,
  score,
  library,
  onCommitted,
  onBusyChange,
  blocked,
  onClose,
  onConfirmed,
}: {
  entryId: string
  trackId: string
  title: string
  score: number | undefined
  library: MusicLibrary
  onCommitted: () => Promise<unknown>
  onBusyChange: (busy: boolean) => void
  blocked: boolean
  onClose: () => void
  onConfirmed: (score: number | undefined) => void
}) {
  return (
    <RatingForm
      kind="track"
      title={`Tu valoración de ${title}`}
      score={score}
      onChangeScore={async (next, expected) => {
        if (next === undefined)
          await library.removeTrackRating(entryId, trackId, expected)
        else await library.rateTrack(entryId, trackId, next)
        onConfirmed(next)
      }}
      onCommitted={onCommitted}
      onBusyChange={onBusyChange}
      blocked={blocked}
      onClose={onClose}
    />
  )
}
