import { checkBackupSize, localSnapshotSchema } from '../domain/backup'
import {
  catalogImportSchema,
  parseImportText,
  type JsonImportDocument,
} from '../domain/catalog-import'
import { canonical, sameSnapshot } from '../domain/sync'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
} from '../domain/repositories/local-repository'
import {
  capitalizeCatalogName,
  catalogNameKey,
  catalogGenresInputSchema,
} from './catalog-names'

type Row = Record<string, unknown>
export type ImportChoices = Record<string, string>
export interface ImportConflict {
  key: string
  kind: 'record' | 'artist' | 'duplicate'
  label: string
  current: unknown
  incoming: unknown
  options: { value: string; label: string }[]
}
export interface PreparedImport {
  expected: LocalSnapshot
  incoming: LocalSnapshot
  format: JsonImportDocument['format']
}
export interface ImportReview {
  conflicts: ImportConflict[]
  unresolved: number
  additions: number
  unchanged: number
  skippedAlbums: number
  snapshot?: LocalSnapshot
  problem?: string
}

export function importRowKey(table: string, row: Row): string {
  const keys =
    table === 'albumArtists'
      ? ['albumId', 'artistId', 'role']
      : table === 'coreTracks'
        ? ['albumId', 'discNumber', 'trackNumber']
        : table === 'albumRatings'
          ? ['userAlbumId']
          : table === 'albumGenreRatings'
            ? ['userAlbumId', 'genreKey']
            : table === 'trackRatings'
              ? ['userAlbumId', 'trackId']
              : ['id']
  return canonical(keys.map((key) => row[key]))
}

function albumArtistIndex(snapshot: LocalSnapshot) {
  const names = new Map(
    snapshot.catalog.artists.map((row) => [row.id, catalogNameKey(row.name)]),
  )
  const credits = new Map<string, string[]>()
  for (const row of snapshot.catalog.albumArtists) {
    if (row.role !== 'primary') continue
    const list = credits.get(row.albumId) ?? []
    list.push(names.get(row.artistId) ?? row.artistId)
    credits.set(row.albumId, list)
  }
  return new Map(
    [...credits].map(([id, names]) => [id, names.sort().join('|')]),
  )
}
function rowLabel(table: string, row: Row, snapshot: LocalSnapshot): string {
  const albumId =
    row.albumId ??
    snapshot.library.userAlbums.find(
      (entry) => entry.id === row.userAlbumId || entry.id === row.id,
    )?.albumId
  const album = snapshot.catalog.albums.find(
    (album) => album.id === albumId,
  )?.title
  const names: Record<string, string> = {
    artists: 'Artista',
    albums: 'Álbum',
    albumArtists: 'Crédito',
    tracks: 'Pista',
    coreTracks: 'Orden original',
    releases: 'Edición',
    releaseTracks: 'Pista de edición',
    userAlbums: 'Experiencia',
    albumRatings: 'Nota general',
    albumGenreRatings: 'Nota por género',
    trackRatings: 'Nota de pista',
    ownedItems: 'Adquisición',
    purchaseWishes: 'Deseo',
  }
  const display = row.title ?? row.name ?? album ?? row.editionLabel ?? row.id
  return `${names[table] ?? table}: ${typeof display === 'string' || typeof display === 'number' ? String(display) : 'registro'}`
}

/** Additive import: omission never means deletion; choices never bypass integrity. */
export function reviewImport(
  prepared: PreparedImport,
  choices: ImportChoices = {},
): ImportReview {
  const before = prepared.expected,
    incoming = structuredClone(prepared.incoming)
  const conflicts: ImportConflict[] = []
  const addConflict = (conflict: ImportConflict) => {
    conflicts.push(conflict)
    const selected = choices[conflict.key]
    return conflict.options.some((option) => option.value === selected)
      ? selected
      : undefined
  }
  const artistMap = new Map<string, string>()
  const beforeArtistIds = new Set(before.catalog.artists.map((row) => row.id))
  const artistCandidates = new Map<string, typeof before.catalog.artists>()
  for (const artist of before.catalog.artists) {
    const key = catalogNameKey(artist.name)
    artistCandidates.set(key, [...(artistCandidates.get(key) ?? []), artist])
  }
  for (const artist of incoming.catalog.artists) {
    if (beforeArtistIds.has(artist.id)) continue
    const candidates = artistCandidates.get(catalogNameKey(artist.name)) ?? []
    if (!candidates.length) continue
    const selected = addConflict({
      key: `artist:${artist.id}`,
      kind: 'artist',
      label: `Identidad de artista: ${artist.name}`,
      current: candidates,
      incoming: artist,
      options: [
        { value: 'distinct', label: 'Conservar como artista distinto' },
        ...candidates.map((row) => ({
          value: row.id,
          label: `Reutilizar ${row.name}${row.country ? ` (${row.country})` : ''} · ${row.id.slice(0, 8)}`,
        })),
      ],
    })
    if (selected && selected !== 'distinct') artistMap.set(artist.id, selected)
  }
  const originalUsedArtists = new Set(
    incoming.catalog.albumArtists.map((row) => row.artistId),
  )
  const beforeCredits = albumArtistIndex(before),
    incomingCredits = albumArtistIndex(incoming)
  const beforeAlbumIds = new Set(before.catalog.albums.map((row) => row.id))
  const albumCandidates = new Map<string, typeof before.catalog.albums>()
  for (const album of before.catalog.albums) {
    const key = canonical([
      catalogNameKey(album.title),
      beforeCredits.get(album.id),
    ])
    albumCandidates.set(key, [...(albumCandidates.get(key) ?? []), album])
  }
  const skipped = new Set<string>()
  for (const album of incoming.catalog.albums) {
    if (beforeAlbumIds.has(album.id)) continue
    const candidates =
      albumCandidates.get(
        canonical([catalogNameKey(album.title), incomingCredits.get(album.id)]),
      ) ?? []
    if (!candidates.length) continue
    const selected = addConflict({
      key: `duplicate:${album.id}`,
      kind: 'duplicate',
      label: `Posible álbum duplicado: ${album.title}`,
      current: candidates,
      incoming: album,
      options: [
        { value: 'skip', label: 'Omitir este álbum del archivo' },
        { value: 'distinct', label: 'Importar como álbum distinto' },
      ],
    })
    if (selected === 'skip') skipped.add(album.id)
  }
  if (skipped.size) {
    const tracks = new Set(
      incoming.catalog.tracks
        .filter((row) => skipped.has(row.albumId))
        .map((row) => row.id),
    )
    const releases = new Set(
      incoming.catalog.releases
        .filter((row) => skipped.has(row.albumId))
        .map((row) => row.id),
    )
    const entries = new Set(
      incoming.library.userAlbums
        .filter((row) => skipped.has(row.albumId))
        .map((row) => row.id),
    )
    incoming.catalog.albums = incoming.catalog.albums.filter(
      (row) => !skipped.has(row.id),
    )
    incoming.catalog.albumArtists = incoming.catalog.albumArtists.filter(
      (row) => !skipped.has(row.albumId),
    )
    incoming.catalog.tracks = incoming.catalog.tracks.filter(
      (row) => !tracks.has(row.id),
    )
    incoming.catalog.coreTracks = incoming.catalog.coreTracks.filter(
      (row) => !skipped.has(row.albumId),
    )
    incoming.catalog.releases = incoming.catalog.releases.filter(
      (row) => !releases.has(row.id),
    )
    incoming.catalog.releaseTracks = incoming.catalog.releaseTracks.filter(
      (row) => !releases.has(row.releaseId),
    )
    incoming.library.userAlbums = incoming.library.userAlbums.filter(
      (row) => !entries.has(row.id),
    )
    for (const table of [
      'albumRatings',
      'albumGenreRatings',
      'trackRatings',
      'ownedItems',
      'purchaseWishes',
    ] as const)
      Object.assign(incoming.library, {
        [table]: incoming.library[table].filter(
          (row) => !entries.has(row.userAlbumId),
        ),
      })
  }
  const usedArtists = new Set(
    incoming.catalog.albumArtists.map((row) => row.artistId),
  )
  incoming.catalog.artists = incoming.catalog.artists.filter(
    (row) => !originalUsedArtists.has(row.id) || usedArtists.has(row.id),
  )
  const retainedArtistIds = new Set(
    incoming.catalog.artists.map((row) => row.id),
  )
  for (let index = conflicts.length - 1; index >= 0; index--)
    if (
      conflicts[index]!.kind === 'artist' &&
      !retainedArtistIds.has(conflicts[index]!.key.slice('artist:'.length))
    )
      conflicts.splice(index, 1)
  incoming.catalog.artists = incoming.catalog.artists.map((row) => {
    const id = artistMap.get(row.id) ?? row.id
    return {
      ...(prepared.format === 'auditorium-catalog'
        ? before.catalog.artists.find((artist) => artist.id === id)
        : {}),
      ...row,
      id,
    }
  })
  incoming.catalog.albumArtists = incoming.catalog.albumArtists.map((row) => ({
    ...row,
    artistId: artistMap.get(row.artistId) ?? row.artistId,
  }))
  // A single active personal entry represents the same known album in this destination.
  const entryMap = new Map<string, string>()
  for (const entry of incoming.library.userAlbums) {
    if (
      entry.deletedAt ||
      before.library.userAlbums.some((row) => row.id === entry.id)
    )
      continue
    const candidates = before.library.userAlbums.filter(
      (row) => row.albumId === entry.albumId,
    )
    const target =
      candidates.find((row) => !row.deletedAt) ??
      (candidates.length === 1 ? candidates[0] : undefined)
    if (target) entryMap.set(entry.id, target.id)
  }
  incoming.library.userAlbums = incoming.library.userAlbums.map((row) => ({
    ...row,
    id: entryMap.get(row.id) ?? row.id,
  }))
  for (const table of [
    'albumRatings',
    'albumGenreRatings',
    'trackRatings',
    'ownedItems',
    'purchaseWishes',
  ] as const)
    Object.assign(incoming.library, {
      [table]: incoming.library[table].map((row) => ({
        ...row,
        userAlbumId: entryMap.get(row.userAlbumId) ?? row.userAlbumId,
      })),
    })
  const output = structuredClone(before)
  let additions = 0,
    unchanged = 0
  let problem: string | undefined
  for (const section of ['catalog', 'library'] as const) {
    for (const table of Object.keys(incoming[section])) {
      const ours = (before[section] as unknown as Record<string, Row[]>)[table]!
      const rows = (incoming[section] as unknown as Record<string, Row[]>)[
        table
      ]!
      const merged = new Map(ours.map((row) => [importRowKey(table, row), row]))
      const seen = new Set<string>()
      for (const row of rows) {
        const key = importRowKey(table, row),
          current = merged.get(key)
        if (seen.has(key))
          problem =
            'Varias filas del archivo convergen en un mismo registro. Revisa las identidades elegidas o corrige el archivo.'
        seen.add(key)
        if (!current) {
          merged.set(key, row)
          additions++
          continue
        }
        if (canonical(current) === canonical(row)) {
          unchanged++
          continue
        }
        const selected = addConflict({
          key: `${section}.${table}:${key}`,
          kind: 'record',
          label: rowLabel(table, row, incoming),
          current,
          incoming: row,
          options: [
            { value: 'current', label: 'Conservar dato actual' },
            { value: 'incoming', label: 'Usar dato del archivo' },
          ],
        })
        if (selected === 'incoming') merged.set(key, row)
      }
      ;(output[section] as unknown as Record<string, Row[]>)[table] = [
        ...merged.values(),
      ]
    }
  }
  const unresolved = conflicts.filter(
    (conflict) =>
      !conflict.options.some(
        (option) => option.value === choices[conflict.key],
      ),
  ).length
  const parsed = localSnapshotSchema.safeParse(output)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    problem = `Las elecciones no forman una biblioteca válida (${first?.path.join('.') ?? 'datos'}): ${first?.message ?? 'Revisa las relaciones.'} Cambia las elecciones o corrige el archivo.`
  }
  return {
    conflicts,
    unresolved,
    additions,
    unchanged,
    skippedAlbums: skipped.size,
    ...(problem ? { problem } : {}),
    ...(!unresolved && !problem && parsed.success
      ? { snapshot: parsed.data }
      : {}),
  }
}

export class LibraryImports {
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

  async prepare(file: Pick<Blob, 'size' | 'text'>): Promise<PreparedImport> {
    checkBackupSize(file.size)
    const document = parseImportText(await file.text())
    const expected = await this.repository.readSnapshot()
    let incoming: LocalSnapshot
    if (document.format === 'auditorium-backup') {
      incoming = structuredClone(document.data)
      incoming.identity = { ...expected.identity }
      incoming.library.userAlbums.forEach((row) => {
        row.userId = expected.identity.userId
      })
      for (const table of ['artists', 'albums'] as const)
        incoming.catalog[table].forEach((row) => {
          if (row.createdBy) row.createdBy = expected.identity.userId
        })
    } else {
      const at = this.now().toISOString()
      incoming = {
        identity: { ...expected.identity },
        catalog: {
          artists: document.artists.map((row) => ({
            ...expected.catalog.artists.find((artist) => artist.id === row.id),
            ...row,
            catalogScope: 'personal' as const,
            name: capitalizeCatalogName(row.name),
          })),
          albums: document.albums.map((album) => {
            const { artistIds, ...row } = album
            void artistIds
            return {
              ...expected.catalog.albums.find(
                (existing) => existing.id === row.id,
              ),
              ...row,
              catalogScope: 'personal' as const,
              ...(row.coverUrl ? { coverImage: undefined } : {}),
              title: capitalizeCatalogName(row.title),
              ...(row.genres
                ? { genres: catalogGenresInputSchema.parse(row.genres) }
                : {}),
            }
          }),
          albumArtists: document.albums.flatMap((album) => {
            const credits = expected.catalog.albumArtists.filter(
              (row) => row.albumId === album.id,
            )
            let position = credits.reduce(
              (max, row) => Math.max(max, row.position),
              0,
            )
            return album.artistIds.map(
              (artistId) =>
                credits.find(
                  (row) => row.artistId === artistId && row.role === 'primary',
                ) ?? {
                  albumId: album.id,
                  artistId,
                  role: 'primary' as const,
                  position: ++position,
                },
            )
          }),
          tracks: [],
          coreTracks: [],
          releases: [],
          releaseTracks: [],
        },
        library: {
          userAlbums: document.albums.map(
            (album) =>
              expected.library.userAlbums.find(
                (entry) => entry.albumId === album.id && !entry.deletedAt,
              ) ??
              expected.library.userAlbums.find(
                (entry) => entry.albumId === album.id,
              ) ?? {
                id: this.createId(),
                userId: expected.identity.userId,
                albumId: album.id,
                listeningStatus: 'untracked' as const,
                addedAt: at,
                updatedAt: at,
              },
          ),
          albumRatings: [],
          albumGenreRatings: [],
          trackRatings: [],
          ownedItems: [],
          purchaseWishes: [],
        },
      }
    }
    localSnapshotSchema.parse(incoming)
    return { expected, incoming, format: document.format }
  }

  async confirm(
    prepared: PreparedImport,
    choices: ImportChoices,
  ): Promise<LocalSnapshot> {
    const review = reviewImport(prepared, choices)
    if (!review.snapshot)
      throw new Error(
        review.problem ?? 'Resuelve todos los conflictos antes de confirmar.',
      )
    const next = review.snapshot
    return this.repository.mutate((current) => {
      if (!sameSnapshot(current, prepared.expected))
        throw new Error(
          'La biblioteca cambió desde la vista previa. No se importó nada; vuelve a seleccionar el archivo para revisar los cambios actuales.',
        )
      return { snapshot: next, result: next }
    })
  }

  async exportCatalog() {
    const { catalog } = await this.repository.readSnapshot()
    const document = catalogImportSchema.parse({
      format: 'auditorium-catalog',
      schemaVersion: 1,
      artists: catalog.artists.map(({ id, name, country }) => ({
        id,
        name,
        ...(country ? { country } : {}),
      })),
      albums: catalog.albums.map(
        ({
          id,
          title,
          primaryType,
          categories,
          publicationStatus,
          originalYear,
          genres,
          coverUrl,
          description,
        }) => ({
          id,
          title,
          primaryType,
          categories,
          publicationStatus,
          ...(originalYear ? { originalYear } : {}),
          ...(genres ? { genres } : {}),
          ...(coverUrl ? { coverUrl } : {}),
          ...(description ? { description } : {}),
          artistIds: catalog.albumArtists
            .filter((row) => row.albumId === id && row.role === 'primary')
            .sort((a, b) => a.position - b.position)
            .map((row) => row.artistId)
            .filter((id, index, ids) => ids.indexOf(id) === index),
        }),
      ),
    })
    const text = JSON.stringify(document, null, 2) + '\n'
    checkBackupSize(new TextEncoder().encode(text).byteLength)
    return text
  }
}
