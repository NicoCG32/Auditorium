import { z } from 'zod'
import { catalogSchema } from '../domain/catalog/catalog'
import {
  coreTrackSchema,
  releaseTrackSchema,
  trackSchema,
  type Catalog,
} from '../domain/catalog/schemas'
import { entityIdSchema } from '../domain/shared/scalars'

const appearance = releaseTrackSchema
  .omit({
    id: true,
    releaseId: true,
    trackId: true,
  })
  .extend({ occurrenceId: entityIdSchema.optional() })
export const saveTrackListInputSchema = z.strictObject({
  albumId: entityIdSchema,
  releaseId: entityIdSchema.optional(),
  expected: z.string(),
  rows: z.array(
    z.union([
      appearance.extend({ trackId: entityIdSchema }),
      appearance.extend({
        track: trackSchema.omit({ id: true, albumId: true }),
      }),
    ]),
  ),
})

export class TrackListConflictError extends Error {
  constructor() {
    super('La lista cambió desde que comenzaste a editarla.')
    this.name = 'TrackListConflictError'
  }
}

export function trackListRows(
  catalog: Catalog,
  albumId: string,
  releaseId?: string,
) {
  return (
    releaseId
      ? catalog.releaseTracks.filter((row) => row.releaseId === releaseId)
      : catalog.coreTracks.filter((row) => row.albumId === albumId)
  ).toSorted(
    (a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber,
  )
}

// Una referencia por lista; cambios en otras ediciones no invalidan el borrador.
export function trackListToken(
  catalog: Catalog,
  albumId: string,
  releaseId?: string,
) {
  const rows = trackListRows(catalog, albumId, releaseId)
  return JSON.stringify({
    rows,
    tracks: rows.map((row) =>
      catalog.tracks.find((track) => track.id === row.trackId),
    ),
  })
}

export function saveTrackList(
  catalog: Catalog,
  input: z.output<typeof saveTrackListInputSchema>,
  createId: () => string,
): Catalog {
  const { albumId, releaseId, rows, expected } = input
  if (!catalog.albums.some((album) => album.id === albumId))
    throw new Error('No existe el álbum de la lista.')
  if (
    releaseId &&
    !catalog.releases.some(
      (release) => release.id === releaseId && release.albumId === albumId,
    )
  )
    throw new Error('La edición no pertenece al álbum de la lista.')
  if (trackListToken(catalog, albumId, releaseId) !== expected)
    throw new TrackListConflictError()
  const tracks = [...catalog.tracks]
  const appearances = rows.map((row) => {
    const track =
      'trackId' in row
        ? tracks.find((candidate) => candidate.id === row.trackId)
        : trackSchema.parse({ ...row.track, id: createId(), albumId })
    if (!track || track.albumId !== albumId)
      throw new Error('La pista debe existir y pertenecer al mismo álbum.')
    if ('track' in row) tracks.push(track)
    if (!releaseId) {
      if (
        row.occurrenceId ||
        row.contentRole !== 'standard' ||
        row.displayTitleOverride ||
        row.durationMs
      )
        throw new Error(
          'Los datos de aparición corresponden solo a una edición.',
        )
      return coreTrackSchema.parse({
        albumId,
        trackId: track.id,
        discNumber: row.discNumber,
        trackNumber: row.trackNumber,
      })
    }
    if (
      row.occurrenceId &&
      !catalog.releaseTracks.some(
        (existing) =>
          existing.id === row.occurrenceId && existing.releaseId === releaseId,
      )
    )
      throw new Error('La aparición no pertenece a la edición.')
    return releaseTrackSchema.parse({
      id: row.occurrenceId ?? createId(),
      releaseId,
      trackId: track.id,
      discNumber: row.discNumber,
      trackNumber: row.trackNumber,
      contentRole: row.contentRole,
      durationMs: row.durationMs,
      displayTitleOverride: row.displayTitleOverride,
    })
  })
  return catalogSchema.parse({
    ...catalog,
    tracks,
    coreTracks: releaseId
      ? catalog.coreTracks
      : [
          ...catalog.coreTracks.filter((row) => row.albumId !== albumId),
          ...appearances,
        ],
    releaseTracks: releaseId
      ? [
          ...catalog.releaseTracks.filter((row) => row.releaseId !== releaseId),
          ...appearances,
        ]
      : catalog.releaseTracks,
  })
}
