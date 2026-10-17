import {
  manualAlbumInputSchema,
  type ManualAlbumInput,
} from '../../application/inputs'
import type { CatalogCandidate } from '../../application/catalog-lookup'
import type { CatalogReference } from '../../domain/catalog/schemas'

export interface AlbumFormValues {
  artist: string
  artistId: string | undefined
  title: string
  releaseType: string
  originalYear: string
  coverUrl: string
  description: string
  genres: string
  country: string
  coverImage: string | undefined
  catalogReference: CatalogReference | undefined
  catalogArtists: string[] | undefined
  catalogCountries: string[] | undefined
}
export const emptyAlbumForm: AlbumFormValues = {
  artist: '',
  artistId: undefined,
  title: '',
  releaseType: 'album',
  originalYear: '',
  coverUrl: '',
  description: '',
  genres: '',
  country: '',
  coverImage: undefined,
  catalogReference: undefined,
  catalogArtists: undefined,
  catalogCountries: undefined,
}
export function splitGenres(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(/[,;]/u)
    .map((genre) => genre.trim())
    .filter((genre) => {
      const key = genre
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLocaleLowerCase('es')
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}
export function prepareCatalogCandidate(
  values: AlbumFormValues,
  candidate: CatalogCandidate,
): AlbumFormValues {
  return {
    ...values,
    title: candidate.title,
    artist: candidate.artists.join(' · '),
    artistId: undefined,
    catalogArtists: [...candidate.artists],
    catalogCountries: candidate.artists.map(() => ''),
    country: '',
    releaseType: candidate.releaseType,
    originalYear: candidate.originalYear?.toString() ?? '',
    description: values.description || candidate.description || '',
    catalogReference: candidate.catalogReference,
  }
}
export function parseAlbumForm(
  values: AlbumFormValues,
):
  | { success: true; input: ManualAlbumInput }
  | { success: false; errors: Record<string, string> } {
  const year = values.originalYear.trim()
  const genres = splitGenres(values.genres)
  const parsed = manualAlbumInputSchema.safeParse({
    title: values.title,
    releaseType: values.releaseType,
    artists: values.catalogArtists?.map((name, index) => ({
      name,
      ...(values.catalogCountries?.[index]?.trim()
        ? { country: values.catalogCountries[index].trim() }
        : {}),
    })) ?? [
      values.artistId === undefined
        ? {
            name: values.artist,
            ...(values.country.trim()
              ? { country: values.country.trim() }
              : {}),
          }
        : { artistId: values.artistId },
    ],
    ...(year
      ? { originalYear: /^\d{1,4}$/u.test(year) ? Number(year) : Number.NaN }
      : {}),
    ...(values.coverUrl.trim() ? { coverUrl: values.coverUrl.trim() } : {}),
    ...(values.coverImage ? { coverImage: values.coverImage } : {}),
    ...(genres.length ? { genres } : {}),
    ...(values.description.trim()
      ? { description: values.description.trim() }
      : {}),
    ...(values.catalogReference
      ? { catalogReference: values.catalogReference }
      : {}),
  })
  if (parsed.success) return { success: true, input: parsed.data }
  const errors: Record<string, string> = {}
  const messages: Record<string, string> = {
    artist: 'Escribe el nombre del artista.',
    title: 'Escribe el título del álbum.',
    releaseType: 'Selecciona un tipo válido.',
    originalYear: 'Escribe un año entero entre 1 y 9999, o déjalo vacío.',
    coverUrl: 'La dirección de portada debe ser una URL HTTPS válida.',
    description: 'Revisa la descripción.',
    genres:
      'Usa hasta 20 géneros de 80 caracteres como máximo, separados por comas.',
    coverImage: 'Selecciona un JPG o PNG válido de hasta 2 MiB.',
    country: 'Escribe un país de hasta 100 caracteres.',
  }
  for (const issue of parsed.error.issues) {
    const field =
      issue.path[0] === 'artists'
        ? issue.path.includes('country')
          ? 'country'
          : 'artist'
        : String(issue.path[0])
    errors[field] = messages[field] ?? 'Revisa este campo.'
  }
  return { success: false, errors }
}
