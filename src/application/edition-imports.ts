import { z } from 'zod'
import { checkBackupSize, localSnapshotSchema } from '../domain/backup'
import type { Album, Release } from '../domain/catalog/schemas'
import { releaseFormatSchema } from '../domain/catalog/schemas'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../domain/repositories/local-repository'
import { sameSnapshot } from '../domain/sync'
import { entityIdSchema } from '../domain/shared/scalars'
import { catalogNameKey } from './catalog-names'
import {
  discographyArtistSchema,
  type DiscographyArtist,
} from './discography-catalog'
import {
  catalogCoverUrl,
  editionDetailsSchema,
  editionPosition,
  type EditionDetails,
} from './edition-catalog'

export function albumGroupId(album: Album) {
  return (
    album.musicBrainz?.id ??
    album.catalogReference?.musicBrainzReleaseGroupId?.toLowerCase()
  )
}
export function possibleEditions(releases: Release[], source: EditionDetails) {
  return releases.filter(
    (row) =>
      !row.musicBrainz &&
      (Boolean(source.barcode && row.barcode === source.barcode) ||
        Boolean(
          source.catalogNumber && row.catalogNumber === source.catalogNumber,
        ) ||
        Boolean(
          source.description &&
          row.editionLabel &&
          catalogNameKey(row.editionLabel) ===
            catalogNameKey(source.description),
        )),
  )
}
export const editionChoicesSchema = z.strictObject({
  edition: z.union([z.literal('new'), entityIdSchema]),
  format: releaseFormatSchema,
  includeTracks: z.boolean(),
  cover: z.boolean(),
  tracks: z.record(z.string(), entityIdSchema).default({}),
})
export type EditionChoices = z.input<typeof editionChoicesSchema>
export interface PreparedCatalogDetails {
  expected: LocalSnapshot
  next: LocalSnapshot
  releaseId?: string
  added: boolean
  linked: boolean
  tracksAdded: number
  preservedList: boolean
  coverChanged: boolean
}
export class EditionImports {
  private readonly repository: TransactionalLocalRepository
  private readonly now: () => Date
  private readonly createId: () => string
  constructor(
    repository: TransactionalLocalRepository,
    now = () => new Date(),
    createId: () => string = () => crypto.randomUUID(),
  ) {
    this.repository = repository
    this.now = now
    this.createId = createId
  }

  private proposal(
    expected: LocalSnapshot,
    next: LocalSnapshot,
    result: Omit<PreparedCatalogDetails, 'expected' | 'next'>,
  ): PreparedCatalogDetails {
    const validated = localSnapshotSchema.parse(next)
    checkBackupSize(
      new TextEncoder().encode(JSON.stringify(validated)).byteLength,
    )
    return { expected, next: validated, ...result }
  }
  async prepareArtist(artistId: string, sourceInput: DiscographyArtist) {
    const source = discographyArtistSchema.parse(sourceInput)
    const expected = await this.repository.readSnapshot(),
      next = structuredClone(expected)
    const artist = next.catalog.artists.find((row) => row.id === artistId)
    if (!artist || (artist.musicBrainz && artist.musicBrainz.id !== source.id))
      throw new Error(
        'El artista cambió. Vuelve a revisar la identidad del catálogo.',
      )
    if (
      next.catalog.artists.some(
        (row) => row.id !== artistId && row.musicBrainz?.id === source.id,
      )
    )
      throw new Error(
        'Este artista del catálogo ya está vinculado a otro registro local. Abre ese artista para consultar su discografía.',
      )
    if (!artist.musicBrainz)
      artist.musicBrainz = {
        id: source.id,
        retrievedAt: this.now().toISOString(),
      }
    return this.proposal(expected, next, {
      added: false,
      linked: true,
      tracksAdded: 0,
      preservedList: false,
      coverChanged: false,
    })
  }
  async prepareCover(albumId: string) {
    const expected = await this.repository.readSnapshot(),
      next = structuredClone(expected)
    const album = next.catalog.albums.find((row) => row.id === albumId),
      group = album && albumGroupId(album)
    if (!album || !group)
      throw new Error(
        'Vincula el álbum con su referencia de catálogo antes de buscar una portada.',
      )
    const url = catalogCoverUrl('release-group', group)
    const changed = album.coverUrl !== url || Boolean(album.coverImage)
    delete album.coverImage
    album.coverUrl = url
    return this.proposal(expected, next, {
      added: false,
      linked: false,
      tracksAdded: 0,
      preservedList: false,
      coverChanged: changed,
    })
  }
  async prepare(
    albumId: string,
    sourceInput: EditionDetails,
    choicesInput: EditionChoices,
  ): Promise<PreparedCatalogDetails> {
    const source = editionDetailsSchema.parse(sourceInput),
      choices = editionChoicesSchema.parse(choicesInput)
    const expected = await this.repository.readSnapshot(),
      next = structuredClone(expected)
    const album = next.catalog.albums.find((row) => row.id === albumId)
    if (!album || albumGroupId(album) !== source.groupId)
      throw new Error(
        'La edición no corresponde a la referencia de este álbum. Revisa el catálogo antes de continuar.',
      )
    const at = this.now().toISOString()
    const alreadyLinked = next.catalog.releases.find(
      (row) => row.musicBrainz?.id === source.id,
    )
    if (alreadyLinked && alreadyLinked.albumId !== albumId)
      throw new Error('Esta edición está vinculada a otro álbum local.')
    if (
      alreadyLinked &&
      choices.edition !== 'new' &&
      choices.edition !== alreadyLinked.id
    )
      throw new Error(
        'Esta edición ya está vinculada a otro registro local. Revisa la selección.',
      )
    const existing =
      alreadyLinked ??
      next.catalog.releases.find(
        (row) => row.id === choices.edition && row.albumId === albumId,
      )
    if (choices.edition !== 'new' && !existing)
      throw new Error(
        'La edición elegida ya no está disponible. Revisa la selección.',
      )
    if (existing?.musicBrainz && existing.musicBrainz.id !== source.id)
      throw new Error('La edición local ya tiene otra referencia de catálogo.')
    if (existing && !alreadyLinked && existing.format !== choices.format)
      throw new Error(
        'El formato elegido no coincide con el de la edición local.',
      )
    const preservedList = Boolean(
      existing &&
      next.catalog.releaseTracks.some((row) => row.releaseId === existing.id),
    )
    const importTracks =
      choices.includeTracks && !alreadyLinked && !preservedList
    if (importTracks && !source.completeTracks)
      throw new Error(
        'La fuente no ofrece una lista completa que se pueda importar. Guarda la edición sin pistas o complétalas manualmente.',
      )
    if (
      Object.keys(choices.tracks).some(
        (position) =>
          !source.tracks.some((row) => editionPosition(row) === position),
      )
    )
      throw new Error('La selección de pistas no corresponde a esta edición.')
    let release = existing
    if (!release) {
      const year = Number(source.date?.match(/^([0-9]{4})(?:-|$)/u)?.[1])
      release = {
        id: this.createId(),
        albumId,
        format: choices.format,
        musicBrainz: { id: source.id, retrievedAt: at },
        ...(source.description ? { editionLabel: source.description } : {}),
        ...(source.title !== album.title
          ? { releaseTitleOverride: source.title }
          : {}),
        ...(year > 0 && year <= 9999 ? { releaseYear: year } : {}),
        ...(source.label ? { label: source.label } : {}),
        ...(source.catalogNumber
          ? { catalogNumber: source.catalogNumber }
          : {}),
        ...(source.barcode ? { barcode: source.barcode } : {}),
        ...(source.country && /^[A-Z]{2}$/u.test(source.country)
          ? { countryCode: source.country }
          : {}),
        ...(source.formats.length
          ? { mediaDescription: source.formats.join(' · ') }
          : {}),
      }
      next.catalog.releases.push(release)
    } else if (!release.musicBrainz)
      release.musicBrainz = { id: source.id, retrievedAt: at }
    let tracksAdded = 0
    if (importTracks) {
      for (const row of source.tracks) {
        const chosenId = choices.tracks[editionPosition(row)]
        const known = row.recordingId
          ? next.catalog.tracks.find(
              (track) =>
                track.albumId === albumId &&
                track.musicBrainz?.id === row.recordingId,
            )
          : undefined
        let track = chosenId
          ? next.catalog.tracks.find(
              (track) => track.id === chosenId && track.albumId === albumId,
            )
          : known
        if (chosenId && (!track || (known && known.id !== track.id)))
          throw new Error(
            'La pista elegida ya no coincide con esta grabación. Revisa sus vínculos.',
          )
        if (
          track?.musicBrainz &&
          row.recordingId &&
          track.musicBrainz.id !== row.recordingId
        )
          throw new Error(
            'La pista elegida tiene otra grabación vinculada. Conserva sus datos y elige una pista distinta.',
          )
        if (!track) {
          track = {
            id: this.createId(),
            albumId,
            title: row.title,
            ...(row.durationMs ? { referenceDurationMs: row.durationMs } : {}),
            ...(row.recordingId
              ? { musicBrainz: { id: row.recordingId, retrievedAt: at } }
              : {}),
          }
          next.catalog.tracks.push(track)
          tracksAdded++
        } else if (row.recordingId && !track.musicBrainz)
          track.musicBrainz = { id: row.recordingId, retrievedAt: at }
        next.catalog.releaseTracks.push({
          id: this.createId(),
          releaseId: release.id,
          trackId: track.id,
          discNumber: row.discNumber,
          trackNumber: row.trackNumber,
          contentRole: 'standard',
          ...(row.durationMs ? { durationMs: row.durationMs } : {}),
          ...(row.title !== track.title
            ? { displayTitleOverride: row.title }
            : {}),
        })
      }
    }
    const coverUrl = catalogCoverUrl('release', source.id)
    const coverChanged =
      choices.cover &&
      (album.coverUrl !== coverUrl || Boolean(album.coverImage))
    if (choices.cover) {
      delete album.coverImage
      album.coverUrl = coverUrl
    }
    return this.proposal(expected, next, {
      releaseId: release.id,
      added: !existing,
      linked: Boolean(existing && !alreadyLinked),
      tracksAdded,
      preservedList: preservedList || Boolean(alreadyLinked),
      coverChanged,
    })
  }
  async confirm(prepared: PreparedCatalogDetails) {
    const next = localSnapshotSchema.parse(prepared.next)
    return this.repository.mutate((current) => {
      if (!sameSnapshot(current, prepared.expected))
        throw new Error(
          'La biblioteca cambió desde la revisión. No se guardó nada; vuelve a revisar los datos.',
        )
      return { snapshot: next, result: next }
    })
  }
}
