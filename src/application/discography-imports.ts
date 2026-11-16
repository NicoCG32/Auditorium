import { checkBackupSize, localSnapshotSchema } from '../domain/backup'
import type { Album, Artist } from '../domain/catalog/schemas'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../domain/repositories/local-repository'
import { sameSnapshot } from '../domain/sync'
import { catalogNameKey } from './catalog-names'
import {
  discographyAlbumSchema,
  discographyArtistSchema,
  discographyClassification,
  type DiscographyAlbum,
  type DiscographyArtist,
} from './discography-catalog'

export interface DiscographyChoices {
  artists: Record<string, string>
  albums: Record<string, string>
}
export const emptyDiscographyChoices: DiscographyChoices = {
  artists: {},
  albums: {},
}
export interface ArtistMatch {
  source: DiscographyArtist
  linked?: Artist
  candidates: Artist[]
}
export interface AlbumMatch {
  source: DiscographyAlbum
  linked?: Album
  candidates: Album[]
}
function externalAlbumId(album: Album) {
  return (
    album.musicBrainz?.id ?? album.catalogReference?.musicBrainzReleaseGroupId
  )?.toLowerCase()
}
function uniqueArtists(root: DiscographyArtist, albums: DiscographyAlbum[]) {
  return [
    ...new Map(
      [root, ...albums.flatMap((album) => album.artists)].map((artist) => [
        artist.id,
        artist,
      ]),
    ).values(),
  ].map((artist) => (artist.id === root.id ? root : artist))
}
function namesKey(names: string[]) {
  return [...new Set(names.map(catalogNameKey))].sort().join('\0')
}

/** Names suggest candidates; only an explicit choice establishes a new link. */
export function reviewDiscography(
  snapshot: LocalSnapshot,
  artist: DiscographyArtist,
  selected: DiscographyAlbum[],
  choices: DiscographyChoices = emptyDiscographyChoices,
) {
  const linkedAlbums = new Map<string, Album[]>()
  const namedAlbums = new Map<string, Album[]>()
  const localNames = new Map(
    snapshot.catalog.artists.map((row) => [row.id, row.name]),
  )
  const creditNames = new Map<string, string[]>()
  for (const credit of snapshot.catalog.albumArtists) {
    if (credit.role !== 'primary') continue
    const names = creditNames.get(credit.albumId) ?? []
    names.push(localNames.get(credit.artistId) ?? '')
    creditNames.set(credit.albumId, names)
  }
  for (const row of snapshot.catalog.albums) {
    const externalId = externalAlbumId(row)
    if (externalId)
      linkedAlbums.set(externalId, [
        ...(linkedAlbums.get(externalId) ?? []),
        row,
      ])
    else {
      const key = `${catalogNameKey(row.title)}\0${namesKey(creditNames.get(row.id) ?? [])}`
      namedAlbums.set(key, [...(namedAlbums.get(key) ?? []), row])
    }
  }
  const active = selected.filter(
    (album) =>
      choices.albums[album.id] !== 'skip' &&
      linkedAlbums.get(album.id)?.length !== 1,
  )
  const artists: ArtistMatch[] = active.length
    ? uniqueArtists(artist, active).map((source) => {
        const linked = snapshot.catalog.artists.find(
          (row) => row.musicBrainz?.id === source.id,
        )
        return {
          source,
          ...(linked ? { linked } : {}),
          candidates: linked
            ? []
            : snapshot.catalog.artists.filter(
                (row) =>
                  !row.musicBrainz &&
                  catalogNameKey(row.name) === catalogNameKey(source.name),
              ),
        }
      })
    : []
  const albums: AlbumMatch[] = selected.map((source) => {
    const linkedRows = linkedAlbums.get(source.id) ?? []
    const linked = linkedRows.length === 1 ? linkedRows[0] : undefined
    const candidates = linked
      ? []
      : linkedRows.length
        ? linkedRows
        : (namedAlbums.get(
            `${catalogNameKey(source.title)}\0${namesKey(source.artists.map((credit) => credit.name))}`,
          ) ?? [])
    return { source, ...(linked ? { linked } : {}), candidates }
  })
  const unresolvedArtists = artists.filter(
    (row) =>
      !row.linked &&
      row.candidates.length &&
      choices.artists[row.source.id] !== 'new' &&
      !row.candidates.some(
        (candidate) => candidate.id === choices.artists[row.source.id],
      ),
  )
  const unresolvedAlbums = albums.filter(
    (row) =>
      !row.linked &&
      row.candidates.length &&
      !['new', 'skip'].includes(choices.albums[row.source.id] ?? '') &&
      !row.candidates.some(
        (candidate) => candidate.id === choices.albums[row.source.id],
      ),
  )
  return {
    artists,
    albums,
    unresolved: unresolvedArtists.length + unresolvedAlbums.length,
  }
}
export interface PreparedDiscography {
  expected: LocalSnapshot
  next: LocalSnapshot
  added: number
  linked: number
}
export class DiscographyImports {
  private readonly repository: TransactionalLocalRepository
  private readonly now: () => Date
  private readonly createId: () => string
  constructor(
    repository: TransactionalLocalRepository,
    now: () => Date = () => new Date(),
    createId: () => string = () => crypto.randomUUID(),
  ) {
    this.repository = repository
    this.now = now
    this.createId = createId
  }

  /** Re-read and prepare an immutable-by-convention proposal, never write on preview. */
  async prepare(
    artistInput: DiscographyArtist,
    albumsInput: DiscographyAlbum[],
    choices: DiscographyChoices,
  ): Promise<PreparedDiscography> {
    const artist = discographyArtistSchema.parse(artistInput)
    const albums = albumsInput.map((row) => discographyAlbumSchema.parse(row))
    if (
      !albums.length ||
      albums.length > 500 ||
      new Set(albums.map((row) => row.id)).size !== albums.length ||
      albums.some(
        (row) => !row.artists.some((credit) => credit.id === artist.id),
      )
    )
      throw new Error(
        'Selecciona entre 1 y 500 obras acreditadas al artista, sin repetirlas.',
      )
    const expected = await this.repository.readSnapshot()
    const review = reviewDiscography(expected, artist, albums, choices)
    if (review.unresolved)
      throw new Error(
        'Revisa las coincidencias de artistas y álbumes antes de continuar.',
      )
    const next = structuredClone(expected)
    const at = this.now().toISOString()
    const artistIds = new Map<string, string>()
    let added = 0,
      linked = 0
    // Create/link only credits used by an album that will actually be incorporated.
    const accepted = review.albums.filter(
      (row) => !row.linked && choices.albums[row.source.id] !== 'skip',
    )
    const used = new Set(
      accepted.flatMap((row) => row.source.artists.map((credit) => credit.id)),
    )
    for (const row of review.artists) {
      if (!used.has(row.source.id)) continue
      if (row.linked) {
        artistIds.set(row.source.id, row.linked.id)
        continue
      }
      const choice = choices.artists[row.source.id]
      const existing = row.candidates.find(
        (candidate) => candidate.id === choice,
      )
      if (choice && choice !== 'new' && !existing)
        throw new Error(
          'La coincidencia de artista ya no está disponible. Revisa la selección.',
        )
      if (existing) {
        if ([...artistIds.values()].includes(existing.id))
          throw new Error(
            'Dos identidades externas distintas no pueden vincularse al mismo artista local. Revisa los homónimos.',
          )
        next.catalog.artists.find(
          (candidate) => candidate.id === existing.id,
        )!.musicBrainz = { id: row.source.id, retrievedAt: at }
        artistIds.set(row.source.id, existing.id)
      } else {
        const id = this.createId()
        artistIds.set(row.source.id, id)
        next.catalog.artists.push({
          id,
          name: row.source.name,
          ...(row.source.country ? { country: row.source.country } : {}),
          catalogScope: 'personal',
          musicBrainz: { id: row.source.id, retrievedAt: at },
        })
      }
    }
    for (const row of accepted) {
      const choice = choices.albums[row.source.id]
      if (
        choice === 'new' &&
        row.candidates.some(
          (candidate) => externalAlbumId(candidate) === row.source.id,
        )
      )
        throw new Error(
          'La referencia de esta obra ya existe en el catálogo. Elige qué registro vincular u omite la obra.',
        )
      const existing = row.candidates.find(
        (candidate) => candidate.id === choice,
      )
      if (choice && choice !== 'new' && !existing)
        throw new Error(
          'La coincidencia de álbum ya no está disponible. Revisa la selección.',
        )
      if (existing) {
        const localCredits = next.catalog.albumArtists
          .filter(
            (credit) =>
              credit.albumId === existing.id && credit.role === 'primary',
          )
          .map((credit) => credit.artistId)
          .sort()
        const chosenCredits = [
          ...new Set(
            row.source.artists.map((credit) => artistIds.get(credit.id)!),
          ),
        ].sort()
        if (JSON.stringify(localCredits) !== JSON.stringify(chosenCredits))
          throw new Error(
            'Los artistas elegidos no coinciden con los créditos del álbum existente. Revisa las coincidencias o incorpora una obra distinta.',
          )
        next.catalog.albums.find(
          (album) => album.id === existing.id,
        )!.musicBrainz = { id: row.source.id, retrievedAt: at }
        linked++
        continue
      }
      const id = this.createId()
      const year = Number(
        row.source.firstReleaseDate?.match(/^([0-9]{4})(?:-|$)/u)?.[1],
      )
      next.catalog.albums.push({
        id,
        title: row.source.title,
        ...discographyClassification(row.source),
        ...(year > 0 && year <= 9999 ? { originalYear: year } : {}),
        catalogScope: 'personal',
        musicBrainz: { id: row.source.id, retrievedAt: at },
      })
      const credits = [
        ...new Set(
          row.source.artists.map((credit) => artistIds.get(credit.id)!),
        ),
      ]
      credits.forEach((artistId, index) =>
        next.catalog.albumArtists.push({
          albumId: id,
          artistId,
          position: index + 1,
          role: 'primary',
        }),
      )
      next.library.userAlbums.push({
        id: this.createId(),
        albumId: id,
        userId: expected.identity.userId,
        listeningStatus: 'untracked',
        addedAt: at,
        updatedAt: at,
      })
      added++
    }
    const validated = localSnapshotSchema.parse(next)
    checkBackupSize(
      new TextEncoder().encode(JSON.stringify(validated)).byteLength,
    )
    return { expected, next: validated, added, linked }
  }
  async confirm(prepared: PreparedDiscography) {
    const next = localSnapshotSchema.parse(prepared.next)
    return this.repository.mutate((current) => {
      if (!sameSnapshot(current, prepared.expected))
        throw new Error(
          'La biblioteca cambió desde la revisión. No se importó nada; vuelve a revisar la selección.',
        )
      return { snapshot: next, result: next }
    })
  }
}
