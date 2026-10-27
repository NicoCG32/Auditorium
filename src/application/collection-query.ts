import type { LocalSnapshot } from '../domain/repositories/local-repository'
import type { OwnedItem } from '../domain/library/owned-items'
import type { LibraryAlbum } from './library-query'

export interface CollectionFilters {
  search: string
  medium: 'all' | OwnedItem['medium']
  format: 'all' | OwnedItem['format']
}
export const defaultCollectionFilters: CollectionFilters = {
  search: '',
  medium: 'all',
  format: 'all',
}
const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').trim()
const formatTerms: Record<OwnedItem['format'], string> = {
  vinyl: 'vinilo vinyl',
  cd: 'cd',
  cassette: 'casete cassette',
  digital_download: 'descarga digital digital_download',
  other: 'otro other',
}
export function queryCollection(
  snapshot: LocalSnapshot,
  albums: LibraryAlbum[],
  filters: CollectionFilters,
) {
  const byEntry = new Map(albums.map((album) => [album.id, album]))
  const releases = new Map(
    snapshot.catalog.releases.map((release) => [release.id, release]),
  )
  const all = snapshot.library.ownedItems
    .filter((item) => byEntry.has(item.userAlbumId))
    .map((item) => ({
      item,
      album: byEntry.get(item.userAlbumId)!,
      release: item.releaseId ? releases.get(item.releaseId) : undefined,
    }))
    .toSorted(
      (a, b) =>
        a.album.title.localeCompare(b.album.title, 'es', {
          sensitivity: 'base',
          numeric: true,
        }) ||
        a.item.createdAt.localeCompare(b.item.createdAt) ||
        a.item.id.localeCompare(b.item.id),
    )
  const terms = normalize(filters.search).split(/\s+/u).filter(Boolean)
  const visible = all.filter(({ item, album, release }) => {
    const text = normalize(
      [
        album.searchText,
        album.title,
        album.artist,
        formatTerms[item.format],
        release?.editionLabel,
        release?.label,
        release?.catalogNumber,
        release?.releaseYear,
        item.acquiredAt,
        item.notes,
      ]
        .filter((value) => value !== undefined)
        .join(' '),
    )
    return (
      (filters.medium === 'all' || item.medium === filters.medium) &&
      (filters.format === 'all' || item.format === filters.format) &&
      terms.every((term) => text.includes(term))
    )
  })
  return {
    all,
    visible,
    physical: all.filter((row) => row.item.medium === 'physical').length,
    digital: all.filter((row) => row.item.medium === 'purchased_digital')
      .length,
    albumCount: new Set(all.map((row) => row.item.userAlbumId)).size,
  }
}
