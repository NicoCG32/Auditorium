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
import {
  personalLinksInputSchema,
  normalizedLinkUrl,
} from '../domain/library/personal-links'
import {
  personalLinksExpectedSchema,
  personalLinksFrom,
  samePersonalLinks,
  updatedPersonalLinks,
} from './personal-links'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../domain/repositories/local-repository'
import { entityIdSchema } from '../domain/shared/scalars'
import { capitalizeCatalogName, catalogNameKey } from './catalog-names'
import {
  addReleaseInputSchema,
  addTrackInputSchema,
  createAlbumInputSchema,
  manualAlbumInputSchema,
  personalExperienceInputSchema,
  type CreateAlbumInput,
} from './inputs'
import { albumCandidates, type AlbumCandidate } from './album-candidates'
import { saveTrackList, saveTrackListInputSchema } from './track-lists'
import { addOwnedItemInputSchema } from './inputs'
import { ownedItemSchema, type OwnedItem } from '../domain/library/owned-items'
import {
  purchaseWishSchema,
  wishStatusSchema,
  type PurchaseWish,
} from '../domain/library/purchase-wishes'
import { purchaseWishInputSchema } from './inputs'
import {
  buildAlbumEditExpected,
  editedAlbumFields,
  sameAlbumEditExpected,
  updateAlbumInputSchema,
} from './album-edit'

export class MusicUseCaseError extends Error {
  readonly code:
    | 'missing_reference'
    | 'wrong_album'
    | 'outdated_experience'
    | 'outdated_album'
    | 'outdated_links'
  constructor(
    code:
      | 'missing_reference'
      | 'wrong_album'
      | 'outdated_experience'
      | 'outdated_album'
      | 'outdated_links',
    message: string,
  ) {
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
        existing.name = capitalizeCatalogName(existing.name)
        return existing
      }
      const artist = artistSchema.parse({
        id: this.createId(),
        name: credit.name,
        sortName: credit.sortName,
        country: credit.country,
        createdBy: snapshot.identity.userId,
      })
      snapshot.catalog.artists.push(artist)
      return artist
    })
    const {
      artists: requestedArtists,
      addToLibrary,
      personalLinks,
      ...albumFields
    } = request
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
    if (addToLibrary) {
      const entry = this.addEntry(snapshot, album.id)
      result.userAlbum = personalLinks
        ? updatedPersonalLinks(entry, personalLinks, entry.updatedAt)
        : entry
      snapshot.library.userAlbums[
        snapshot.library.userAlbums.findIndex((row) => row.id === entry.id)
      ] = result.userAlbum
    } else if (personalLinks?.links.length)
      throw new Error(
        'Los enlaces personales requieren añadir el álbum a la biblioteca.',
      )
    return result
  }

  async updateAlbum(input: unknown): Promise<Album> {
    const request = updateAlbumInputSchema.parse(input)
    return this.repository.mutate((snapshot) => {
      const album = snapshot.catalog.albums.find(
        (row) => row.id === request.albumId,
      )
      const active = snapshot.library.userAlbums.some(
        (entry) =>
          entry.albumId === request.albumId &&
          entry.userId === snapshot.identity.userId &&
          entry.deletedAt === undefined,
      )
      if (!album || !active)
        throw new MusicUseCaseError(
          'missing_reference',
          'El álbum ya no está en la biblioteca activa.',
        )
      const current = buildAlbumEditExpected(snapshot, album.id)
      if (!sameAlbumEditExpected(current, request.expected))
        throw new MusicUseCaseError(
          'outdated_album',
          'Los datos del álbum cambiaron después de abrir el formulario. Vuelve a cargarlo antes de guardar.',
        )
      if (request.personalLinks) {
        const entry = snapshot.library.userAlbums.find(
          (row) =>
            row.albumId === album.id &&
            row.userId === snapshot.identity.userId &&
            !row.deletedAt,
        )!
        if (
          !request.expectedLinks ||
          !samePersonalLinks(personalLinksFrom(entry), request.expectedLinks)
        )
          throw new MusicUseCaseError(
            'outdated_links',
            'Los enlaces cambiaron después de abrir el formulario. Tu borrador se conserva; vuelve a cargar los datos guardados.',
          )
        const updatedEntry = updatedPersonalLinks(
          entry,
          request.personalLinks,
          this.now().toISOString(),
        )
        snapshot.library.userAlbums[
          snapshot.library.userAlbums.findIndex((row) => row.id === entry.id)
        ] = updatedEntry
      }
      const previousArtists = new Map(
        current.artists.map((artist) => [artist.id, artist]),
      )
      const renamedArtists = new Map<string, Artist>()
      const artists = request.artists.map((credit) => {
        const existing = credit.artistId
          ? previousArtists.get(credit.artistId)
          : undefined
        if (credit.artistId && !existing)
          throw new MusicUseCaseError(
            'missing_reference',
            'El artista seleccionado no pertenece a los créditos que se están editando.',
          )
        if (
          existing &&
          catalogNameKey(existing.name) === catalogNameKey(credit.name)
        ) {
          const updated = artistSchema.parse({
            ...existing,
            name: credit.name,
            country: credit.country,
          })
          if (updated.country === undefined) delete updated.country
          snapshot.catalog.artists[
            snapshot.catalog.artists.findIndex(
              (artist) => artist.id === existing.id,
            )
          ] = updated
          return updated
        }
        const renameKey = existing
          ? JSON.stringify([existing.id, credit.name])
          : undefined
        const renamed = renameKey ? renamedArtists.get(renameKey) : undefined
        if (renamed) return renamed
        const created = artistSchema.parse({
          id: this.createId(),
          name: credit.name,
          country: credit.country,
          createdBy: snapshot.identity.userId,
        })
        snapshot.catalog.artists.push(created)
        if (renameKey) renamedArtists.set(renameKey, created)
        return created
      })
      const updated = editedAlbumFields(
        { ...request, expected: current },
        album,
      )
      snapshot.catalog.albums[
        snapshot.catalog.albums.findIndex((row) => row.id === album.id)
      ] = updated
      snapshot.catalog.albumArtists = snapshot.catalog.albumArtists.filter(
        (credit) => credit.albumId !== album.id,
      )
      snapshot.catalog.albumArtists.push(
        ...request.artists.map((credit, index) =>
          albumArtistSchema.parse({
            albumId: album.id,
            artistId: artists[index]!.id,
            role: credit.role,
            position: index + 1,
            creditedAs: credit.creditedAs,
          }),
        ),
      )
      return { snapshot, result: updated }
    })
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

  async addAlbumToLibrary(
    albumId: unknown,
    linksInput?: unknown,
    expectedInput?: unknown,
  ): Promise<UserAlbum> {
    const id = entityIdSchema.parse(albumId)
    const input =
      linksInput === undefined
        ? undefined
        : personalLinksInputSchema.parse(linksInput)
    const expected =
      expectedInput === undefined
        ? undefined
        : personalLinksExpectedSchema.parse(expectedInput)
    return this.repository.mutate((snapshot) => {
      const previous = snapshot.library.userAlbums.find(
        (row) =>
          row.albumId === id &&
          row.userId === snapshot.identity.userId &&
          !row.deletedAt,
      )
      if (
        input?.links.length &&
        previous &&
        (!expected || !samePersonalLinks(personalLinksFrom(previous), expected))
      )
        throw new MusicUseCaseError(
          'outdated_links',
          'Los enlaces del álbum seleccionado cambiaron. Conservamos tu formulario; vuelve a revisar la coincidencia.',
        )
      const entry = this.addEntry(snapshot, id)
      if (!input?.links.length) return { snapshot, result: entry }
      const links = [...(entry.links ?? [])]
      const mappedIds = new Map<string, string>()
      for (const link of input.links) {
        const duplicate = links.find(
          (row) =>
            row.purpose === link.purpose &&
            normalizedLinkUrl(row.url) === link.url,
        )
        if (duplicate) mappedIds.set(link.id, duplicate.id)
        else
          links.push({
            ...link,
            createdAt: entry.updatedAt,
            updatedAt: entry.updatedAt,
          })
      }
      const preference = input.preferredPlaybackLinkId
        ? (mappedIds.get(input.preferredPlaybackLinkId) ??
          input.preferredPlaybackLinkId)
        : entry.preferredPlaybackLinkId
      const result = updatedPersonalLinks(
        entry,
        {
          links: links.map(({ id: linkId, purpose, url, label }) => ({
            id: linkId,
            purpose,
            url,
            ...(label ? { label } : {}),
          })),
          ...(preference ? { preferredPlaybackLinkId: preference } : {}),
        },
        this.now().toISOString(),
      )
      snapshot.library.userAlbums[
        snapshot.library.userAlbums.findIndex((row) => row.id === entry.id)
      ] = result
      return { snapshot, result }
    })
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

  async saveTrackList(input: unknown): Promise<void> {
    const request = saveTrackListInputSchema.parse(input)
    await this.repository.mutate((snapshot) => {
      snapshot.catalog = saveTrackList(snapshot.catalog, request, this.createId)
      return { snapshot, result: undefined }
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

  async updatePersonalExperience(
    userAlbumId: unknown,
    input: unknown,
  ): Promise<UserAlbum> {
    const id = entityIdSchema.parse(userAlbumId)
    const request = personalExperienceInputSchema.parse(input)
    const updatedAt = this.now().toISOString()
    return this.repository.mutate((snapshot) => {
      const current = snapshot.library.userAlbums.find(
        (entry) => entry.id === id,
      )
      if (
        current &&
        request.expected &&
        (current.updatedAt !== request.expected.updatedAt ||
          current.listeningStatus !== request.expected.listeningStatus ||
          current.personalNotes !== request.expected.personalNotes)
      )
        throw new MusicUseCaseError(
          'outdated_experience',
          'La experiencia cambió después de leerla.',
        )
      snapshot.library = applyLibraryChange(
        { catalog: snapshot.catalog, localUserId: snapshot.identity.userId },
        snapshot.library,
        {
          type: 'set_personal_experience',
          userAlbumId: id,
          listeningStatus: request.listeningStatus,
          updatedAt,
          ...(request.personalNotes === undefined
            ? {}
            : { personalNotes: request.personalNotes }),
        },
      )
      const updated = snapshot.library.userAlbums.find(
        (entry) => entry.id === id,
      )
      if (!updated)
        throw new MusicUseCaseError(
          'missing_reference',
          'No existe la entrada personal.',
        )
      return { snapshot, result: updated }
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

  async addOwnedItem(userAlbumId: unknown, input: unknown): Promise<OwnedItem> {
    const entryId = entityIdSchema.parse(userAlbumId)
    const request = addOwnedItemInputSchema.parse(input)
    const item = ownedItemSchema.parse({
      ...request,
      userAlbumId: entryId,
      id: this.createId(),
      createdAt: this.now().toISOString(),
    })
    if (item.notes === undefined) delete item.notes
    await this.changeLibrary({ type: 'add_owned_item', ...item })
    return item
  }

  async addPurchaseWish(
    userAlbumId: unknown,
    input: unknown,
  ): Promise<PurchaseWish> {
    const request = purchaseWishInputSchema.parse(input)
    const wish = purchaseWishSchema.parse({
      ...request,
      id: this.createId(),
      userAlbumId: entityIdSchema.parse(userAlbumId),
      status: 'active',
      createdAt: this.now().toISOString(),
    })
    if (wish.notes === undefined) delete wish.notes
    await this.changeLibrary({ type: 'add_purchase_wish', ...wish })
    return wish
  }

  async updatePurchaseWish(
    expected: unknown,
    input: unknown,
  ): Promise<PurchaseWish> {
    const wish = purchaseWishSchema.parse(expected)
    const request = purchaseWishInputSchema.parse(input)
    await this.changeLibrary({
      type: 'update_purchase_wish',
      userAlbumId: wish.userAlbumId,
      wishId: wish.id,
      expected: wish,
      ...request,
    })
    return purchaseWishSchema.parse({
      id: wish.id,
      userAlbumId: wish.userAlbumId,
      status: wish.status,
      createdAt: wish.createdAt,
      ...Object.fromEntries(
        Object.entries(request).filter(([, value]) => value !== undefined),
      ),
    })
  }

  async setPurchaseWishStatus(
    expected: unknown,
    statusInput: unknown,
    ownedItemId?: unknown,
  ): Promise<PurchaseWish> {
    const wish = purchaseWishSchema.parse(expected)
    const status = wishStatusSchema.parse(statusInput)
    const change: LibraryChange = {
      type: 'set_wish_status',
      userAlbumId: wish.userAlbumId,
      wishId: wish.id,
      status,
      expectedStatus: wish.status,
      ...(ownedItemId === undefined
        ? {}
        : { ownedItemId: entityIdSchema.parse(ownedItemId) }),
    }
    return this.repository.mutate((snapshot) => {
      snapshot.library = applyLibraryChange(
        { catalog: snapshot.catalog, localUserId: snapshot.identity.userId },
        snapshot.library,
        change,
      )
      const updated = snapshot.library.purchaseWishes.find(
        (row) => row.id === wish.id,
      )
      if (!updated)
        throw new MusicUseCaseError(
          'missing_reference',
          'No existe el deseo seleccionado.',
        )
      return { snapshot, result: updated }
    })
  }

  async removeOwnedItem(
    userAlbumId: unknown,
    ownedItemId: unknown,
  ): Promise<void> {
    await this.changeLibrary({
      type: 'remove_owned_item',
      userAlbumId: entityIdSchema.parse(userAlbumId),
      ownedItemId: entityIdSchema.parse(ownedItemId),
    })
  }

  async removePersonalAlbum(
    userAlbumId: unknown,
    expectedToken: string,
  ): Promise<void> {
    await this.changeLibrary({
      type: 'remove_personal_album',
      userAlbumId: entityIdSchema.parse(userAlbumId),
      expectedToken,
      updatedAt: this.now().toISOString(),
    })
  }

  async restorePersonalAlbum(
    userAlbumId: unknown,
    expectedToken: string,
  ): Promise<void> {
    await this.changeLibrary({
      type: 'restore_personal_album',
      userAlbumId: entityIdSchema.parse(userAlbumId),
      expectedToken,
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
  async removeAlbumRating(
    userAlbumId: unknown,
    expectedScore?: unknown,
  ): Promise<void> {
    return this.changeLibrary({
      type: 'remove_album_rating',
      userAlbumId: entityIdSchema.parse(userAlbumId),
      ...(expectedScore === undefined
        ? {}
        : { expectedScoreUnits: scoreToUnits(expectedScore) }),
    })
  }
  async removeTrackRating(
    userAlbumId: unknown,
    trackId: unknown,
    expectedScore?: unknown,
  ): Promise<void> {
    return this.changeLibrary({
      type: 'remove_track_rating',
      userAlbumId: entityIdSchema.parse(userAlbumId),
      trackId: entityIdSchema.parse(trackId),
      ...(expectedScore === undefined
        ? {}
        : { expectedScoreUnits: scoreToUnits(expectedScore) }),
    })
  }
}
