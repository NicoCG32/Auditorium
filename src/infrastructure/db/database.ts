import Dexie, { type Table } from 'dexie'
import type {
  Album,
  AlbumArtist,
  Artist,
  CoreTrack,
  Release,
  ReleaseTrack,
  Track,
} from '../../domain/catalog/schemas'
import type { AlbumRating, TrackRating } from '../../domain/library/schemas'
import type { IdentityRecord, StoredUserAlbum } from './records'

export const DATABASE_NAME = 'auditorium'
export const DATABASE_VERSION = 1
export const SCHEMA_V1 = {
  metadata: 'key',
  artists: 'id, name',
  albums: 'id, title, releaseType, originalYear',
  albumArtists: '[albumId+artistId+role], &[albumId+position], artistId',
  tracks: 'id, albumId, title, variantOfTrackId',
  coreTracks: '[albumId+discNumber+trackNumber], [albumId+trackId]',
  releases: 'id, albumId, format',
  releaseTracks:
    'id, &[releaseId+discNumber+trackNumber], [releaseId+trackId], trackId',
  userAlbums:
    'id, &activeAlbumKey, [userId+albumId], albumId, listeningStatus, addedAt',
  albumRatings: 'userAlbumId',
  trackRatings: '[userAlbumId+trackId], trackId',
} as const

export class AuditoriumDatabase extends Dexie {
  readonly nativeFactory: IDBFactory | undefined
  readonly metadata: Table<IdentityRecord, string>
  readonly artists: Table<Artist, string>
  readonly albums: Table<Album, string>
  readonly albumArtists: Table<AlbumArtist, [string, string, string]>
  readonly tracks: Table<Track, string>
  readonly coreTracks: Table<CoreTrack, [string, number, number]>
  readonly releases: Table<Release, string>
  readonly releaseTracks: Table<ReleaseTrack, string>
  readonly userAlbums: Table<StoredUserAlbum, string>
  readonly albumRatings: Table<AlbumRating, string>
  readonly trackRatings: Table<TrackRating, [string, string]>

  constructor(
    name = DATABASE_NAME,
    options?: { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange },
  ) {
    super(name, options)
    this.nativeFactory = options?.indexedDB ?? globalThis.indexedDB
    this.version(DATABASE_VERSION).stores(SCHEMA_V1)
    this.metadata = this.table<IdentityRecord, string>('metadata')
    this.artists = this.table<Artist, string>('artists')
    this.albums = this.table<Album, string>('albums')
    this.albumArtists = this.table<AlbumArtist, [string, string, string]>(
      'albumArtists',
    )
    this.tracks = this.table<Track, string>('tracks')
    this.coreTracks = this.table<CoreTrack, [string, number, number]>(
      'coreTracks',
    )
    this.releases = this.table<Release, string>('releases')
    this.releaseTracks = this.table<ReleaseTrack, string>('releaseTracks')
    this.userAlbums = this.table<StoredUserAlbum, string>('userAlbums')
    this.albumRatings = this.table<AlbumRating, string>('albumRatings')
    this.trackRatings = this.table<TrackRating, [string, string]>(
      'trackRatings',
    )
  }
}
