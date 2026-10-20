import Dexie, { type Table, type Transaction } from 'dexie'
import { localSnapshotSchema } from '../../domain/backup'
import { fromStoredUserAlbum, identityRecordSchema } from './records'
import { LocalStorageError } from './errors'
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
import type { OwnedItem } from '../../domain/library/owned-items'
import type { PurchaseWish } from '../../domain/library/purchase-wishes'
import type { IdentityRecord, StoredUserAlbum } from './records'
import type { SyncCheckpoint } from '../../domain/sync'

export const DATABASE_NAME = 'auditorium'
export const DATABASE_VERSION = 7
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

export const SCHEMA_V2 = {
  ...SCHEMA_V1,
  ownedItems: 'id, userAlbumId, releaseId, medium, format, createdAt',
} as const

export const SCHEMA_V3 = {
  ...SCHEMA_V2,
  purchaseWishes:
    'id, userAlbumId, targetReleaseId, targetFormat, status, createdAt',
} as const

// La nueva versión evita que clientes anteriores lean campos que no conocen.
export const SCHEMA_V4 = { ...SCHEMA_V3 } as const
export const SCHEMA_V5 = { ...SCHEMA_V4 } as const
export const SCHEMA_V6 = { ...SCHEMA_V5, syncCheckpoint: 'key' } as const
export const SCHEMA_V7 = { ...SCHEMA_V6 } as const

async function validateBeforeSyncUpgrade(transaction: Transaction) {
  const rows = new Map<string, unknown[]>()
  for (const name of Object.keys(SCHEMA_V5)) {
    const values: unknown[] = await transaction.table(name).toArray()
    rows.set(name, values)
  }
  if ([...rows.values()].every((values) => values.length === 0)) return
  const stored = rows
    .get('metadata')
    ?.find(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        'key' in row &&
        row.key === 'local_identity',
    )
  if (stored === undefined)
    throw new LocalStorageError(
      'identity_missing',
      'Falta la identidad local antes de migrar. Los datos se conservan.',
    )
  const { userId, createdAt } = identityRecordSchema.parse(stored)
  localSnapshotSchema.parse({
    identity: { userId, createdAt },
    catalog: Object.fromEntries(
      [
        'artists',
        'albums',
        'albumArtists',
        'tracks',
        'coreTracks',
        'releases',
        'releaseTracks',
      ].map((name) => [name, rows.get(name)]),
    ),
    library: {
      ...Object.fromEntries(
        ['albumRatings', 'trackRatings', 'ownedItems', 'purchaseWishes'].map(
          (name) => [name, rows.get(name)],
        ),
      ),
      userAlbums: rows.get('userAlbums')!.map(fromStoredUserAlbum),
    },
  })
}

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
  readonly ownedItems: Table<OwnedItem, string>
  readonly purchaseWishes: Table<PurchaseWish, string>
  readonly syncCheckpoint: Table<SyncCheckpoint, string>

  constructor(
    name = DATABASE_NAME,
    options?: { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange },
  ) {
    super(name, options)
    this.nativeFactory = options?.indexedDB ?? globalThis.indexedDB
    this.version(1).stores(SCHEMA_V1)
    this.version(2).stores(SCHEMA_V2)
    this.version(3).stores(SCHEMA_V3)
    this.version(4).stores(SCHEMA_V4)
    this.version(5).stores(SCHEMA_V5)
    this.version(6).stores(SCHEMA_V6).upgrade(validateBeforeSyncUpgrade)
    this.version(7).stores(SCHEMA_V7).upgrade(validateBeforeSyncUpgrade)
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
    this.ownedItems = this.table<OwnedItem, string>('ownedItems')
    this.purchaseWishes = this.table<PurchaseWish, string>('purchaseWishes')
    this.syncCheckpoint = this.table<SyncCheckpoint, string>('syncCheckpoint')
  }
}
