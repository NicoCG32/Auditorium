import { audioDigest, audioScope } from '../domain/audio'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { makeBackup } from '../domain/backup.fixture'
import type { CoverFile } from '../domain/covers'

// Structural JPEG fixture for hash/dimension/storage checks. Browser journeys
// generate decodable images using a real canvas instead.
export async function syntheticCover(albumId = ids.album): Promise<CoverFile> {
  const bytes = new Uint8Array([
    255, 216, 255, 192, 0, 11, 8, 0, 2, 0, 2, 1, 1, 17, 0, 255, 217,
  ])
  return {
    bytes,
    attachment: {
      scope: audioScope(makeBackup().data.identity),
      albumId,
      sourceUrl: `https://coverartarchive.org/release-group/${fixtureId(99000)}/front-500`,
      mime: 'image/jpeg',
      size: bytes.length,
      width: 2,
      height: 2,
      sha256: await audioDigest(bytes),
    },
  }
}
