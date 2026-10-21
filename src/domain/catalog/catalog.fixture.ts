import type { CatalogInput } from './schemas'

export function fixtureId(value: number) {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`
}

export const ids = {
  artist: fixtureId(1),
  collaborator: fixtureId(2),
  album: fixtureId(3),
  otherAlbum: fixtureId(4),
  overture: fixtureId(5),
  eclipse: fixtureId(6),
  ashes: fixtureId(7),
  demo: fixtureId(8),
  original: fixtureId(9),
  deluxe: fixtureId(10),
  missing: fixtureId(999),
}

export function makeCatalog(): CatalogInput {
  const originals = [ids.overture, ids.eclipse, ids.ashes]
  return {
    artists: [{ id: ids.artist, name: 'Umbral Eléctrico' }],
    albums: [
      {
        id: ids.album,
        title: 'Eclipse',
        primaryType: 'full_length',
        originalYear: 1998,
      },
    ],
    albumArtists: [
      {
        albumId: ids.album,
        artistId: ids.artist,
        role: 'primary',
        position: 1,
      },
    ],
    tracks: [
      { id: ids.overture, albumId: ids.album, title: 'Overture' },
      { id: ids.eclipse, albumId: ids.album, title: 'Eclipse' },
      { id: ids.ashes, albumId: ids.album, title: 'Ashes' },
      {
        id: ids.demo,
        albumId: ids.album,
        title: 'Eclipse (Demo)',
        variantOfTrackId: ids.eclipse,
        versionLabel: 'Demo',
      },
    ],
    coreTracks: originals.map((trackId, index) => ({
      albumId: ids.album,
      trackId,
      discNumber: 1,
      trackNumber: index + 1,
    })),
    releases: [
      { id: ids.original, albumId: ids.album, format: 'cd', releaseYear: 1998 },
      {
        id: ids.deluxe,
        albumId: ids.album,
        format: 'vinyl',
        editionLabel: 'Deluxe',
        releaseYear: 2024,
      },
    ],
    releaseTracks: [
      ...originals.map((trackId, index) => ({
        id: fixtureId(100 + index),
        releaseId: ids.original,
        trackId,
        discNumber: 1,
        trackNumber: index + 1,
      })),
      ...originals.map((trackId, index) => ({
        id: fixtureId(200 + index),
        releaseId: ids.deluxe,
        trackId,
        discNumber: 1,
        trackNumber: index + 1,
      })),
      {
        id: fixtureId(203),
        releaseId: ids.deluxe,
        trackId: ids.demo,
        discNumber: 1,
        trackNumber: 4,
        contentRole: 'bonus',
      },
    ],
  }
}
