import type {
  DiscographyAlbum,
  DiscographyArtist,
  DiscographyCatalog,
} from './discography-catalog'
import { catalogCoverUrl } from './edition-catalog'
import { metadataKey } from '../domain/catalog/metadata'
import { audioScope } from '../domain/audio'
import {
  coverSourceSchema,
  coverTarget,
  type CoverFile,
  type CoverLocalRepository,
} from '../domain/covers'
import type { Album } from '../domain/catalog/schemas'
import type { LocalSnapshot } from '../domain/repositories/local-repository'

export interface CoverImageSource {
  download(
    url: string,
    signal: AbortSignal,
  ): Promise<
    | (Omit<CoverFile, 'attachment'> & {
        size: number
        width: number
        height: number
        sha256: string
      })
    | undefined
  >
}
export interface CoverChoice {
  target: string
  albumId: string
  title: string
  artist: string
  candidates: DiscographyAlbum[]
}
export interface CoverProgress {
  total: number
  done: number
  saved: number
  missing: number
  failed: number
  skipped: number
  choices: CoverChoice[]
  current: string
}
function nameKey(value: string) {
  return metadataKey(value).replace(/\s+/gu, ' ')
}
function namesKey(names: string[]) {
  return names.map(nameKey).sort().join('\0')
}
function groupId(album: Album) {
  return (
    album.musicBrainz?.id ?? album.catalogReference?.musicBrainzReleaseGroupId
  )
}
export function eligibleCover(album: Album, stored: Set<string>) {
  return (
    !album.coverImage &&
    !stored.has(album.id) &&
    (!album.coverUrl || coverSourceSchema.safeParse(album.coverUrl).success)
  )
}
export class AlbumCovers {
  private readonly repository: CoverLocalRepository
  private readonly catalog: DiscographyCatalog
  private readonly images: CoverImageSource
  constructor(
    repository: CoverLocalRepository,
    catalog: DiscographyCatalog,
    images: CoverImageSource,
  ) {
    this.repository = repository
    this.catalog = catalog
    this.images = images
  }
  async complete(
    ids: string[],
    signal: AbortSignal,
    onProgress: (progress: CoverProgress) => void,
    resolveManual = true,
  ) {
    const snapshot = await this.repository.readSnapshot()
    const stored = new Set(
      (await this.repository.readCoverAttachments()).map((row) => row.albumId),
    )
    const requested = new Set(ids)
    const albums = snapshot.catalog.albums.filter(
      (row) => requested.has(row.id) && eligibleCover(row, stored),
    )
    const progress: CoverProgress = {
      total: albums.length,
      done: 0,
      saved: 0,
      missing: 0,
      failed: 0,
      skipped: 0,
      choices: [],
      current: '',
    }
    const searches = new Map<string, Promise<DiscographyArtist[]>>()
    const discographies = new Map<string, Promise<DiscographyAlbum[]>>()
    const publish = () =>
      onProgress({ ...progress, choices: [...progress.choices] })
    publish()
    for (const album of albums) {
      signal.throwIfAborted()
      progress.current = album.title
      publish()
      try {
        const expected = coverTarget(snapshot, album.id)
        let url = album.coverUrl
        const group = groupId(album)
        if (!url && group) url = catalogCoverUrl('release-group', group)
        if (!url && resolveManual && this.catalog.available) {
          const candidates = await this.candidates(
            snapshot,
            album,
            signal,
            searches,
            discographies,
          )
          const artists = this.artists(snapshot, album)
          if (candidates.albums.length === 1 && !candidates.ambiguousArtist)
            url = catalogCoverUrl('release-group', candidates.albums[0]!.id)
          else if (candidates.albums.length)
            progress.choices.push({
              target: expected,
              albumId: album.id,
              title: album.title,
              artist: artists.map((row) => row.name).join(', '),
              candidates: candidates.albums,
            })
        }
        if (url) {
          const saved = await this.save(
            snapshot,
            album.id,
            expected,
            url,
            signal,
          )
          if (saved === 'saved') progress.saved++
          else if (saved === 'missing') progress.missing++
          else progress.skipped++
        } else if (!progress.choices.some((row) => row.albumId === album.id)) {
          if (resolveManual && !this.catalog.available) progress.failed++
          else progress.missing++
        }
      } catch (error) {
        signal.throwIfAborted()
        // Space errors stop the batch; repeating downloads cannot fix them.
        if (
          error instanceof Error &&
          (('code' in error && error.code === 'quota_exceeded') ||
            error.name === 'CoverError')
        )
          throw error
        progress.failed++
      }
      progress.done++
      publish()
    }
    progress.current = ''
    publish()
    return progress
  }
  async choose(choice: CoverChoice, candidateId: string, signal: AbortSignal) {
    if (!choice.candidates.some((row) => row.id === candidateId))
      throw new Error('Elige una de las coincidencias mostradas.')
    const snapshot = await this.repository.readSnapshot()
    if (coverTarget(snapshot, choice.albumId) !== choice.target)
      return 'skipped'
    return this.save(
      snapshot,
      choice.albumId,
      choice.target,
      catalogCoverUrl('release-group', candidateId),
      signal,
    )
  }
  private async save(
    snapshot: LocalSnapshot,
    albumId: string,
    expected: string,
    sourceUrl: string,
    signal: AbortSignal,
  ) {
    coverSourceSchema.parse(sourceUrl)
    const image = await this.images.download(sourceUrl, signal)
    if (!image) return 'missing' as const
    const { bytes, ...metadata } = image
    const saved = await this.repository.saveCover(
      {
        bytes,
        attachment: {
          ...metadata,
          scope: audioScope(snapshot.identity),
          albumId,
          sourceUrl,
          mime: 'image/jpeg',
        },
      },
      expected,
      signal,
    )
    return saved ? ('saved' as const) : ('skipped' as const)
  }
  private artists(snapshot: LocalSnapshot, album: Album) {
    const credits = snapshot.catalog.albumArtists
      .filter((row) => row.albumId === album.id && row.role === 'primary')
      .sort((a, b) => a.position - b.position)
    return credits.flatMap((credit) =>
      snapshot.catalog.artists.filter((row) => row.id === credit.artistId),
    )
  }
  private async candidates(
    snapshot: LocalSnapshot,
    album: Album,
    signal: AbortSignal,
    searches: Map<string, Promise<DiscographyArtist[]>>,
    discographies: Map<string, Promise<DiscographyAlbum[]>>,
  ) {
    const artists = this.artists(snapshot, album)
    if (!artists.length) return { albums: [], ambiguousArtist: false }
    const first = artists[0]!
    let matches: DiscographyArtist[]
    if (first.musicBrainz)
      matches = [{ id: first.musicBrainz.id, name: first.name }]
    else {
      const key = nameKey(first.name)
      if (!searches.has(key))
        searches.set(key, this.catalog.searchArtists(first.name, signal))
      matches = (await searches.get(key)!).filter(
        (row) => nameKey(row.name) === key,
      )
    }
    const result = new Map<string, DiscographyAlbum>()
    for (const artist of matches) {
      if (!discographies.has(artist.id))
        discographies.set(artist.id, this.readDiscography(artist.id, signal))
      for (const candidate of await discographies.get(artist.id)!) {
        if (
          nameKey(candidate.title) === nameKey(album.title) &&
          namesKey(candidate.artists.map((row) => row.name)) ===
            namesKey(artists.map((row) => row.name)) &&
          (!album.originalYear ||
            candidate.firstReleaseDate?.slice(0, 4) ===
              String(album.originalYear)) &&
          artists.every(
            (local) =>
              !local.musicBrainz ||
              candidate.artists.some(
                (credit) => credit.id === local.musicBrainz?.id,
              ),
          )
        )
          result.set(candidate.id, candidate)
      }
    }
    return {
      albums: [...result.values()],
      ambiguousArtist: matches.length !== 1,
    }
  }
  private async readDiscography(artistId: string, signal: AbortSignal) {
    const result: DiscographyAlbum[] = []
    let offset = 0
    for (let page = 0; page < 100; page++) {
      const current = await this.catalog.browseAlbums(artistId, offset, signal)
      result.push(...current.albums)
      if (current.nextOffset === undefined) return result
      if (current.nextOffset <= offset)
        throw new Error('La búsqueda no pudo completar la discografía.')
      offset = current.nextOffset
    }
    throw new Error(
      'La discografía es demasiado extensa para completarla en esta búsqueda.',
    )
  }
}
