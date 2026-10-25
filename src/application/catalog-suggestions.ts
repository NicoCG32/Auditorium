import type { Catalog } from '../domain/catalog/schemas'
import { normalizedName } from './album-candidates'
import { capitalizeCatalogName } from './catalog-names'

export interface CatalogSuggestion {
  id: string
  label: string
  detail?: string
  search: string
}
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })
export function catalogSuggestions(catalog: Catalog) {
  const titles = new Map<string, string[]>()
  const albums = new Map(catalog.albums.map((album) => [album.id, album]))
  for (const credit of catalog.albumArtists) {
    const title = albums.get(credit.albumId)?.title
    const list = titles.get(credit.artistId) ?? []
    if (title && list.length < 2 && !list.includes(title)) list.push(title)
    titles.set(credit.artistId, list)
  }
  const artists: CatalogSuggestion[] = catalog.artists.map((artist) => ({
    id: artist.id,
    label: artist.name,
    detail:
      [artist.country, ...(titles.get(artist.id) ?? [])]
        .filter(Boolean)
        .join(' · ') || 'Sin país ni álbumes registrados',
    search: normalizedName(artist.name),
  }))
  const genres = new Map<string, CatalogSuggestion>()
  for (const album of catalog.albums)
    for (const genre of album.genres ?? []) {
      const key = normalizedName(genre)
      if (!genres.has(key))
        genres.set(key, {
          id: key,
          label: capitalizeCatalogName(genre),
          search: key,
        })
    }
  const sort = (values: CatalogSuggestion[]) =>
    values.toSorted(
      (a, b) => collator.compare(a.label, b.label) || a.id.localeCompare(b.id),
    )
  return { artists: sort(artists), genres: sort([...genres.values()]) }
}

/** Search only local names, never infer an identity from a partial match. */
export function suggestNames(
  options: CatalogSuggestion[],
  term: string,
  excluded: string[] = [],
) {
  const key = normalizedName(term)
  if (!key) return []
  const skip = new Set(excluded.map(normalizedName))
  return options
    .filter(
      (option) => option.search.startsWith(key) && !skip.has(option.search),
    )
    .slice(0, 8)
}

/** Complete the comma-delimited token at the caret, including one in the middle. */
export function genreToken(value: string, caret: number) {
  const position = Math.max(0, Math.min(caret, value.length))
  const start = position === 0 ? 0 : value.lastIndexOf(',', position - 1) + 1
  const comma = value.indexOf(',', position)
  const end = comma < 0 ? value.length : comma
  return {
    start,
    end,
    term: value.slice(start, position).trim(),
    excluded: [
      ...value.slice(0, start).split(','),
      ...value.slice(end).split(','),
    ].filter((part) => part.trim()),
  }
}
export function completeGenre(value: string, caret: number, genre: string) {
  const { start, end } = genreToken(value, caret)
  const leading = value.slice(start, end).match(/^\s*/u)?.[0] ?? ''
  return {
    value: value.slice(0, start) + leading + genre + value.slice(end),
    caret: start + leading.length + genre.length,
  }
}
