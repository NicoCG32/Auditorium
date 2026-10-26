import type { Library } from './schemas'

export function personalEntryData(library: Library, entryId: string) {
  return {
    entry: library.userAlbums.find((row) => row.id === entryId),
    albumRating: library.albumRatings.find(
      (row) => row.userAlbumId === entryId,
    ),
    trackRatings: library.trackRatings
      .filter((row) => row.userAlbumId === entryId)
      .toSorted((a, b) => a.trackId.localeCompare(b.trackId)),
    albumGenreRatings: library.albumGenreRatings
      .filter((row) => row.userAlbumId === entryId)
      .toSorted((a, b) => a.genreKey.localeCompare(b.genreKey)),
    ownedItems: library.ownedItems
      .filter((row) => row.userAlbumId === entryId)
      .toSorted((a, b) => a.id.localeCompare(b.id)),
    purchaseWishes: library.purchaseWishes
      .filter((row) => row.userAlbumId === entryId)
      .toSorted((a, b) => a.id.localeCompare(b.id)),
  }
}

export function personalEntryToken(library: Library, entryId: string): string {
  return JSON.stringify(personalEntryData(library, entryId))
}
