import { catalogSchema } from '../catalog/catalog'
import { fixtureId, ids, makeCatalog } from '../catalog/catalog.fixture'
import type { LibraryContext } from './library'
import type { LibraryInput } from './schemas'

export const libraryIds = {
  user: fixtureId(500),
  otherUser: fixtureId(501),
  entry: fixtureId(502),
  otherEntry: fixtureId(503),
  otherTrack: fixtureId(504),
  historicalEntry: fixtureId(505),
}
export const times = {
  earlier: '2026-01-01T11:00:00.000Z',
  added: '2026-01-01T12:00:00.000Z',
  updated: '2026-01-01T12:05:00.000Z',
  later: '2026-01-01T12:10:00.000Z',
}

export function makeContext(): LibraryContext {
  const input = makeCatalog()
  input.albums.push({ id: ids.otherAlbum, title: 'Otra órbita' })
  input.albumArtists.push({
    albumId: ids.otherAlbum,
    artistId: ids.artist,
    role: 'primary',
    position: 1,
  })
  input.tracks.push({
    id: libraryIds.otherTrack,
    albumId: ids.otherAlbum,
    title: 'Otro horizonte',
  })
  return { catalog: catalogSchema.parse(input), localUserId: libraryIds.user }
}

export function makeLibrary(): LibraryInput {
  return {
    userAlbums: [
      {
        id: libraryIds.entry,
        userId: libraryIds.user,
        albumId: ids.album,
        listeningStatus: 'queued',
        personalNotes: '  Comentario ficticio.\nSegunda línea.  ',
        addedAt: times.added,
        updatedAt: times.updated,
      },
      {
        id: libraryIds.otherEntry,
        userId: libraryIds.user,
        albumId: ids.otherAlbum,
        listeningStatus: 'completed',
        addedAt: times.added,
        updatedAt: times.updated,
      },
    ],
    albumRatings: [
      {
        userAlbumId: libraryIds.entry,
        scoreUnits: 19,
        updatedAt: times.updated,
      },
      {
        userAlbumId: libraryIds.otherEntry,
        scoreUnits: 16,
        updatedAt: times.updated,
      },
    ],
    trackRatings: [
      {
        userAlbumId: libraryIds.entry,
        trackId: ids.eclipse,
        scoreUnits: 18,
        updatedAt: times.updated,
      },
      {
        userAlbumId: libraryIds.entry,
        trackId: ids.demo,
        scoreUnits: 14,
        updatedAt: times.updated,
      },
      {
        userAlbumId: libraryIds.otherEntry,
        trackId: libraryIds.otherTrack,
        scoreUnits: 12,
        updatedAt: times.updated,
      },
    ],
  }
}
