import type { Catalog } from './schemas'

export type CatalogRule =
  | 'duplicate_id'
  | 'missing_reference'
  | 'missing_primary_artist'
  | 'duplicate_credit'
  | 'duplicate_position'
  | 'wrong_album'
  | 'cyclic_variant'

export interface CatalogIssue {
  rule: CatalogRule
  path: (string | number)[]
  message: string
}

export function getCatalogIssues(catalog: Catalog): CatalogIssue[] {
  const issues: CatalogIssue[] = []
  function report(
    rule: CatalogRule,
    path: CatalogIssue['path'],
    message: string,
  ) {
    issues.push({ rule, path, message })
  }

  function indexById<T extends { id: string }>(rows: T[], table: string) {
    const result = new Map<string, T>()
    rows.forEach((row, index) => {
      if (result.has(row.id)) {
        report('duplicate_id', [table, index, 'id'], 'Identificador duplicado.')
      } else {
        result.set(row.id, row)
      }
    })
    return result
  }

  const artists = indexById(catalog.artists, 'artists')
  const albums = indexById(catalog.albums, 'albums')
  const tracks = indexById(catalog.tracks, 'tracks')
  const releases = indexById(catalog.releases, 'releases')
  indexById(catalog.releaseTracks, 'releaseTracks')

  function requireReference(
    exists: boolean,
    path: CatalogIssue['path'],
    entity: string,
  ) {
    if (!exists) {
      report('missing_reference', path, `No existe ${entity} referenciado.`)
    }
  }

  const primaryAlbums = new Set<string>()
  const credits = new Set<string>()
  const creditPositions = new Set<string>()
  catalog.albumArtists.forEach((credit, index) => {
    requireReference(
      albums.has(credit.albumId),
      ['albumArtists', index, 'albumId'],
      'el álbum',
    )
    const artistExists = artists.has(credit.artistId)
    requireReference(
      artistExists,
      ['albumArtists', index, 'artistId'],
      'el artista',
    )
    if (credit.role === 'primary' && artistExists) {
      primaryAlbums.add(credit.albumId)
    }
    const creditKey = `${credit.albumId}:${credit.artistId}:${credit.role}`
    if (credits.has(creditKey)) {
      report('duplicate_credit', ['albumArtists', index], 'Crédito duplicado.')
    }
    credits.add(creditKey)
    const positionKey = `${credit.albumId}:${credit.position}`
    if (creditPositions.has(positionKey)) {
      report(
        'duplicate_position',
        ['albumArtists', index, 'position'],
        'Posición de crédito ocupada en este álbum.',
      )
    }
    creditPositions.add(positionKey)
  })
  catalog.albums.forEach((album, index) => {
    if (!primaryAlbums.has(album.id)) {
      report(
        'missing_primary_artist',
        ['albums', index],
        'El álbum requiere al menos un artista principal existente.',
      )
    }
  })

  catalog.tracks.forEach((track, index) => {
    requireReference(
      albums.has(track.albumId),
      ['tracks', index, 'albumId'],
      'el álbum',
    )
    if (track.variantOfTrackId !== undefined) {
      const original = tracks.get(track.variantOfTrackId)
      requireReference(
        original !== undefined,
        ['tracks', index, 'variantOfTrackId'],
        'la pista original',
      )
      if (original && original.albumId !== track.albumId) {
        report(
          'wrong_album',
          ['tracks', index, 'variantOfTrackId'],
          'Una variante debe pertenecer al mismo álbum que su original.',
        )
      }
    }
  })

  const visited = new Set<string>()
  const trackIndexes = new Map(
    catalog.tracks.map((track, index) => [track.id, index] as const),
  )
  catalog.tracks.forEach((track, index) => {
    const path = new Set<string>()
    let current = tracks.get(track.id)
    while (current && !visited.has(current.id)) {
      if (path.has(current.id)) {
        report(
          'cyclic_variant',
          ['tracks', trackIndexes.get(current.id) ?? index, 'variantOfTrackId'],
          'Las variantes no pueden formar ciclos ni referirse a sí mismas.',
        )
        break
      }
      path.add(current.id)
      current = current.variantOfTrackId
        ? tracks.get(current.variantOfTrackId)
        : undefined
    }
    path.forEach((trackId) => visited.add(trackId))
  })

  catalog.releases.forEach((release, index) => {
    requireReference(
      albums.has(release.albumId),
      ['releases', index, 'albumId'],
      'el álbum',
    )
  })

  function checkPosition(
    positions: Set<string>,
    owner: string,
    row: { discNumber: number; trackNumber: number },
    path: CatalogIssue['path'],
  ) {
    const key = `${owner}:${row.discNumber}:${row.trackNumber}`
    if (positions.has(key)) {
      report(
        'duplicate_position',
        path,
        'Posición de pista ocupada en este disco.',
      )
    }
    positions.add(key)
  }

  const corePositions = new Set<string>()
  catalog.coreTracks.forEach((row, index) => {
    requireReference(
      albums.has(row.albumId),
      ['coreTracks', index, 'albumId'],
      'el álbum',
    )
    const track = tracks.get(row.trackId)
    requireReference(
      track !== undefined,
      ['coreTracks', index, 'trackId'],
      'la pista',
    )
    if (track && track.albumId !== row.albumId) {
      report(
        'wrong_album',
        ['coreTracks', index, 'trackId'],
        'La pista original debe pertenecer al álbum de la lista.',
      )
    }
    checkPosition(corePositions, row.albumId, row, ['coreTracks', index])
  })

  const releasePositions = new Set<string>()
  catalog.releaseTracks.forEach((row, index) => {
    const release = releases.get(row.releaseId)
    const track = tracks.get(row.trackId)
    requireReference(
      release !== undefined,
      ['releaseTracks', index, 'releaseId'],
      'la edición',
    )
    requireReference(
      track !== undefined,
      ['releaseTracks', index, 'trackId'],
      'la pista',
    )
    if (release && track && release.albumId !== track.albumId) {
      report(
        'wrong_album',
        ['releaseTracks', index, 'trackId'],
        'La pista debe pertenecer al mismo álbum que la edición.',
      )
    }
    checkPosition(releasePositions, row.releaseId, row, [
      'releaseTracks',
      index,
    ])
  })

  return issues
}
