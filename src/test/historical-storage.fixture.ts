import { makeBackup } from '../domain/backup.fixture'
import type { LocalSnapshot } from '../domain/repositories/local-repository'

export interface NativeIndexFixture {
  name: string
  keyPath: string | string[]
  unique?: boolean
  multiEntry?: boolean
}
export interface NativeStoreFixture {
  name: string
  keyPath: string | string[]
  indexes: NativeIndexFixture[]
}
function store(
  name: string,
  keyPath: string | string[],
  indexes: NativeIndexFixture[] = [],
): NativeStoreFixture {
  return { name, keyPath, indexes }
}
function index(
  name: string,
  keyPath: string | string[] = name,
  unique = false,
): NativeIndexFixture {
  return { name, keyPath, unique }
}

// Frozen historical contracts: deliberately independent of current Dexie declarations.
const versionOne = [
  store('metadata', 'key'),
  store('artists', 'id', [index('name')]),
  store('albums', 'id', [
    index('title'),
    index('releaseType'),
    index('originalYear'),
  ]),
  store(
    'albumArtists',
    ['albumId', 'artistId', 'role'],
    [
      index('[albumId+position]', ['albumId', 'position'], true),
      index('artistId'),
    ],
  ),
  store('tracks', 'id', [
    index('albumId'),
    index('title'),
    index('variantOfTrackId'),
  ]),
  store(
    'coreTracks',
    ['albumId', 'discNumber', 'trackNumber'],
    [index('[albumId+trackId]', ['albumId', 'trackId'])],
  ),
  store('releases', 'id', [index('albumId'), index('format')]),
  store('releaseTracks', 'id', [
    index(
      '[releaseId+discNumber+trackNumber]',
      ['releaseId', 'discNumber', 'trackNumber'],
      true,
    ),
    index('[releaseId+trackId]', ['releaseId', 'trackId']),
    index('trackId'),
  ]),
  store('userAlbums', 'id', [
    index('activeAlbumKey', 'activeAlbumKey', true),
    index('[userId+albumId]', ['userId', 'albumId']),
    index('albumId'),
    index('listeningStatus'),
    index('addedAt'),
  ]),
  store('albumRatings', 'userAlbumId'),
  store('trackRatings', ['userAlbumId', 'trackId'], [index('trackId')]),
]
const versionTwo = [
  ...versionOne,
  store('ownedItems', 'id', [
    index('userAlbumId'),
    index('releaseId'),
    index('medium'),
    index('format'),
    index('createdAt'),
  ]),
]
const versionThree = [
  ...versionTwo,
  store('purchaseWishes', 'id', [
    index('userAlbumId'),
    index('targetReleaseId'),
    index('targetFormat'),
    index('status'),
    index('createdAt'),
  ]),
]

export function historicalStores(version: 1 | 2 | 3) {
  return structuredClone(
    { 1: versionOne, 2: versionTwo, 3: versionThree }[version],
  )
}
export function historicalSnapshot(version: 1 | 2 | 3): LocalSnapshot {
  const snapshot = makeBackup().data
  if (version < 2) snapshot.library.ownedItems = []
  if (version < 3) snapshot.library.purchaseWishes = []
  return snapshot
}
export function historicalRows(
  snapshot: LocalSnapshot,
  stores: NativeStoreFixture[],
) {
  const rows: Record<string, unknown[]> = {
    metadata: [{ key: 'local_identity', ...snapshot.identity }],
    ...snapshot.catalog,
    ...snapshot.library,
    userAlbums: snapshot.library.userAlbums.map((entry) => ({
      ...entry,
      activeAlbumKey:
        entry.deletedAt === undefined
          ? `${entry.userId}:${entry.albumId}`
          : null,
    })),
  }
  return Object.fromEntries(stores.map(({ name }) => [name, rows[name] ?? []]))
}

interface SeedInput {
  name: string
  version: number
  stores: NativeStoreFixture[]
  rows: Record<string, unknown[]>
  factory?: IDBFactory
}
// Self-contained functions also run in a real browser via Playwright.evaluate.
export function seedNativeStorage(input: SeedInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = (input.factory ?? globalThis.indexedDB).open(
      input.name,
      input.version,
    )
    request.onupgradeneeded = () => {
      try {
        for (const definition of input.stores) {
          const table = request.result.createObjectStore(definition.name, {
            keyPath: definition.keyPath,
          })
          for (const spec of definition.indexes) {
            table.createIndex(spec.name, spec.keyPath, {
              unique: spec.unique ?? false,
              multiEntry: spec.multiEntry ?? false,
            })
          }
          for (const row of input.rows[definition.name] ?? []) table.add(row)
        }
      } catch (error) {
        request.transaction?.abort()
        reject(
          error instanceof Error
            ? error
            : new Error('Could not seed fictitious storage'),
        )
      }
    }
    request.onerror = () =>
      reject(request.error ?? new Error('Could not seed fictitious storage'))
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }
  })
}

export function inspectNativeStorage(input: {
  name: string
  factory?: IDBFactory
}) {
  return new Promise<{
    version: number
    stores: {
      name: string
      keyPath: string | string[] | null
      autoIncrement: boolean
      indexes: {
        name: string
        keyPath: string | string[]
        unique: boolean
        multiEntry: boolean
      }[]
    }[]
    rows: Record<string, unknown[]>
  }>((resolve, reject) => {
    const request = (input.factory ?? globalThis.indexedDB).open(input.name)
    request.onupgradeneeded = () => {
      request.transaction?.abort()
      reject(new Error('Missing fictitious database'))
    }
    request.onerror = () =>
      reject(request.error ?? new Error('Could not inspect fictitious storage'))
    request.onsuccess = () => {
      const database = request.result
      const names = Array.from(database.objectStoreNames).sort()
      const transaction = database.transaction(names, 'readonly')
      const rows: Record<string, unknown[]> = {}
      const stores = names.map((name) => {
        const table = transaction.objectStore(name)
        const reading = table.getAll()
        reading.onsuccess = () => {
          rows[name] = reading.result as unknown[]
        }
        return {
          name,
          keyPath: table.keyPath,
          autoIncrement: table.autoIncrement,
          indexes: Array.from(table.indexNames).map((name) => {
            const spec = table.index(name)
            return {
              name,
              keyPath: spec.keyPath,
              unique: spec.unique,
              multiEntry: spec.multiEntry,
            }
          }),
        }
      })
      transaction.oncomplete = () => {
        database.close()
        resolve({ version: database.version, stores, rows })
      }
      transaction.onabort = transaction.onerror = () => {
        database.close()
        reject(
          transaction.error ?? new Error('Could not read fictitious storage'),
        )
      }
    }
  })
}
