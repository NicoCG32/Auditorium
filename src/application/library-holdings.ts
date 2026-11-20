import type { LocalSnapshot } from '../domain/repositories/local-repository'
import type { OwnedItem } from '../domain/library/owned-items'
import type { LibraryAlbum } from './library-query'

export type CollectionMedium = 'all' | 'physical' | 'digital'
export type AlbumHolding = {
  copies: number
  wishes: number
  physical: number
  digital: number
  formats: OwnedItem['format'][]
}
/** A catalog entry or a playback link does not imply an owned copy. */
export function indexLibraryHoldings(
  snapshot: LocalSnapshot,
  albums: LibraryAlbum[],
) {
  const active = new Set(albums.map((album) => album.id))
  const holdings = new Map<string, AlbumHolding>()
  function holding(id: string) {
    let row = holdings.get(id)
    if (!row) {
      row = { copies: 0, wishes: 0, physical: 0, digital: 0, formats: [] }
      holdings.set(id, row)
    }
    return row
  }
  for (const item of snapshot.library.ownedItems) {
    if (!active.has(item.userAlbumId)) continue
    const row = holding(item.userAlbumId)
    row.copies++
    if (item.medium === 'physical') row.physical++
    else row.digital++
    if (!row.formats.includes(item.format)) row.formats.push(item.format)
  }
  for (const wish of snapshot.library.purchaseWishes) {
    if (wish.status === 'active' && active.has(wish.userAlbumId))
      holding(wish.userAlbumId).wishes++
  }
  return {
    holdings,
    counts: {
      all: albums.length,
      physical: [...holdings.values()].filter((row) => row.physical > 0).length,
      digital: [...holdings.values()].filter((row) => row.digital > 0).length,
    },
  }
}
export function inCollectionMedium(
  holding: AlbumHolding | undefined,
  medium: CollectionMedium,
) {
  return medium === 'all' || (holding?.[medium] ?? 0) > 0
}
