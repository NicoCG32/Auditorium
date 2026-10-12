import {
  albumArtistSchema,
  albumSchema,
  artistSchema,
  coreTrackSchema,
  releaseSchema,
  releaseTrackSchema,
  trackSchema,
  type Album,
  type AlbumArtist,
  type Artist,
  type CoreTrack,
  type Release,
  type ReleaseTrack,
  type Track,
} from '../domain/catalog/schemas'
import { applyLibraryChange } from '../domain/library/library'
import {
  userAlbumSchema,
  type LibraryChange,
  type UserAlbum,
} from '../domain/library/schemas'
import { scoreToUnits } from '../domain/library/scores'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../domain/repositories/local-repository'
import { entityIdSchema } from '../domain/shared/scalars'
import {
  addReleaseInputSchema,
  addTrackInputSchema,
  createAlbumInputSchema,
  manualAlbumInputSchema,
  type CreateAlbumInput,
} from './inputs'
import { albumCandidates, type AlbumCandidate } from './album-candidates'

export class MusicUseCaseError extends Error {
  readonly code: 'missing_reference' | 'wrong_album'
  constructor(code: 'missing_reference' | 'wrong_album', message: string) {
    super(message)
    this.name = 'MusicUseCaseError'
    this.code = code
  }
}

export interface CreateAlbumResult {
  album: Album
  artists: Artist[]
  credits: AlbumArtist[]
  userAlbum?: UserAlbum
}
export interface AddTrackResult {
  track: Track
  releaseTrack: ReleaseTrack
  coreTrack?: CoreTrack
}
export type RegisterAlbumResult =
  | { status: 'review'; candidates: AlbumCandidate[] }
  | { status: 'created'; album: Album; userAlbum: UserAlbum }

export class MusicLibrary {
  private readonly repository: TransactionalLocalRepository
  private readonly createId: () => string
  private readonly now: () => Date
  constructor(
    repository: TransactionalLocalRepository,
    options: { createId?: () => string; now?: () => Date } = {},
  ) {
    this.repository = repository
    this.createId = options.createId ?? (() => globalThis.crypto.randomUUID())
    this.now = options.now ?? (() => new Date())
  }

  private addEntry(snapshot: LocalSnapshot, albumId: string): UserAlbum {
    if (!snapshot.catalog.albums.some((album) => album.id === albumId)) {
      throw new MusicUseCaseError(
        'missing_reference',
        'No existe el álbum seleccionado.',
      )
    }
    const existing = snapshot.library.userAlbums.find(
      (entry) =>
        entry.albumId === albumId &&
        entry.userId === snapshot.identity.userId &&
        entry.deletedAt === undefined,
    )
    if (existing) return existing
    const timestamp = this.now().toISOString()
    const entry = userAlbumSchema.parse({
      id: this.createId(),
      userId: snapshot.identity.userId,
      albumId,
      addedAt: timestamp,
      updatedAt: timestamp,
    })
    snapshot.library.userAlbums.push(entry)
    return entry
  }

  async createAlbum(input: unknown): Promise<CreateAlbumResult> {
    const request = createAlbumInputSchema.parse(input)
    return this.repository.mutate((snapshot) => ({
      snapshot,
      result: this.createAlbumInside(snapshot, request),
    }))
  }

  private createAlbumInside(
    snapshot: LocalSnapshot,
    request: CreateAlbumInput,
  ): CreateAlbumResult {
    const artists = request.artists.map((credit) => {
      if ('artistId' in credit) {
        const existing = snapshot.catalog.artists.find(
          (artist) => artist.id === credit.artistId,
        )
        if (!existing)
          throw new MusicUseCaseError(
            'missing_reference',
            'No existe el artista seleccionado.',
          )
        return existing
      }
      const artist = artistSchema.parse({
        id: this.createId(),
        name: credit.name,
        sortName: credit.sortName,
        createdBy: snapshot.identity.userId,
      })
      snapshot.catalog.artists.push(artist)
      return artist
    })
    const { artists: requestedArtists, addToLibrary, ...albumFields } = request
    const album = albumSchema.parse({
      ...albumFields,
      id: this.createId(),
      createdBy: snapshot.identity.userId,
    })
    snapshot.catalog.albums.push(album)
    const credits = requestedArtists.map((credit, index) => {
      const artist = artists[index]
      if (!artist)
        throw new MusicUseCaseError(
          'missing_reference',
          'Falta un artista para el crédito.',
        )
      return albumArtistSchema.parse({
        albumId: album.id,
        artistId: artist.id,
        role: credit.role,
        position: index + 1,
        creditedAs: credit.creditedAs,
      })
    })
    snapshot.catalog.albumArtists.push(...credits)
    const result: CreateAlbumResult = { album, artists, credits }
    if (addToLibrary) result.userAlbum = this.addEntry(snapshot, album.id)
    return result
  }

  async registerAlbum(
    input: unknown,
    acknowledgedCandidates: string[] = [],
  ): Promise<RegisterAlbumResult> {
    const request: CreateAlbumInput = {
      ...manualAlbumInputSchema.parse(input),
      addToLibrary: true,
    }
    const acknowledged = new Set(
      acknowledgedCandidates.map((id) => entityIdSchema.parse(id)),
    )
    return this.repository.mutate<RegisterAlbumResult>((snapshot) => {
      const candidates = albumCandidates(snapshot, request)
      if (
        candidates.some((candidate) => !acknowledged.has(candidate.album.id))
      ) {
        return { snapshot, result: { status: 'review', candidates } }
      }
      const created = this.createAlbumInside(snapshot, request)
      if (!created.userAlbum)
        throw new Error(
          'El registro manual requiere una entrada de biblioteca.',
        )
      return {
        snapshot,
        result: {
          status: 'created',
          album: created.album,
          userAlbum: created.userAlbum,
        },
      }
    })
  }

  async addAlbumToLibrary(albumId: unknown): Promise<UserAlbum> {
    const id = entityIdSchema.parse(albumId)
    return this.repository.mutate((snapshot) => ({
      snapshot,
      result: this.addEntry(snapshot, id),
    }))
  }

  async addRelease(input: unknown): Promise<Release> {
    const { copyCoreTracks, ...request } = addReleaseInputSchema.parse(input)
    return this.repository.mutate((snapshot) => {
      if (
        !snapshot.catalog.albums.some((album) => album.id === request.albumId)
      ) {
        throw new MusicUseCaseError(
          'missing_reference',
          'No existe el álbum de la edición.',
        )
      }
      const release = releaseSchema.parse({ ...request, id: this.createId() })
      snapshot.catalog.releases.push(release)
      if (copyCoreTracks) {
        const rows = snapshot.catalog.coreTracks
          .filter((row) => row.albumId === release.albumId)
          .map((row) =>
            releaseTrackSchema.parse({
              id: this.createId(),
              releaseId: release.id,
              trackId: row.trackId,
              discNumber: row.discNumber,
              trackNumber: row.trackNumber,
            }),
          )
        snapshot.catalog.releaseTracks.push(...rows)
      }
      return { snapshot, result: release }
    })
  }

  async addTrackToRelease(input: unknown): Promise<AddTrackResult> {
    const request = addTrackInputSchema.parse(input)
    return this.repository.mutate((snapshot) => {
      const release = snapshot.catalog.releases.find(
        (row) => row.id === request.releaseId,
      )
      if (!release)
        throw new MusicUseCaseError(
          'missing_reference',
          'No existe la edición seleccionada.',
        )
      let track: Track
      if ('trackId' in request) {
        const existing = snapshot.catalog.tracks.find(
          (row) => row.id === request.trackId,
        )
        if (!existing)
          throw new MusicUseCaseError(
            'missing_reference',
            'No existe la pista seleccionada.',
          )
        if (existing.albumId !== release.albumId)
          throw new MusicUseCaseError(
            'wrong_album',
            'La pista pertenece a otro álbum.',
          )
        track = existing
      } else {
        track = trackSchema.parse({
          ...request.track,
          id: this.createId(),
          albumId: release.albumId,
        })
        snapshot.catalog.tracks.push(track)
      }
      const releaseTrack = releaseTrackSchema.parse({
        id: this.createId(),
        releaseId: release.id,
        trackId: track.id,
        discNumber: request.discNumber,
        trackNumber: request.trackNumber,
        durationMs: request.durationMs,
        contentRole: request.contentRole,
        displayTitleOverride: request.displayTitleOverride,
      })
      snapshot.catalog.releaseTracks.push(releaseTrack)
      const result: AddTrackResult = { track, releaseTrack }
      if (request.corePosition) {
        const coreTrack = coreTrackSchema.parse({
          albumId: release.albumId,
          trackId: track.id,
          ...request.corePosition,
        })
        snapshot.catalog.coreTracks.push(coreTrack)
        result.coreTrack = coreTrack
      }
      return { snapshot, result }
    })
  }

  private changeLibrary(change: LibraryChange): Promise<void> {
    return this.repository.mutate((snapshot) => {
      snapshot.library = applyLibraryChange(
        { catalog: snapshot.catalog, localUserId: snapshot.identity.userId },
        snapshot.library,
        change,
      )
      return { snapshot, result: undefined }
    })
  }

  async rateAlbum(userAlbumId: unknown, score: unknown): Promise<void> {
    return this.changeLibrary({
      type: 'set_album_rating',
      userAlbumId: entityIdSchema.parse(userAlbumId),
      scoreUnits: scoreToUnits(score),
      updatedAt: this.now().toISOString(),
    })
  }
  async rateTrack(
    userAlbumId: unknown,
    trackId: unknown,
    score: unknown,
  ): Promise<void> {
    return this.changeLibrary({
      type: 'set_track_rating',
      userAlbumId: entityIdSchema.parse(userAlbumId),
      trackId: entityIdSchema.parse(trackId),
      scoreUnits: scoreToUnits(score),
      updatedAt: this.now().toISOString(),
    })
  }
  async removeAlbumRating(userAlbumId: unknown): Promise<void> {
    return this.changeLibrary({
      type: 'remove_album_rating',
      userAlbumId: entityIdSchema.parse(userAlbumId),
    })
  }
  async removeTrackRating(
    userAlbumId: unknown,
    trackId: unknown,
  ): Promise<void> {
    return this.changeLibrary({
      type: 'remove_track_rating',
      userAlbumId: entityIdSchema.parse(userAlbumId),
      trackId: entityIdSchema.parse(trackId),
    })
  }
}
