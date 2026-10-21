import {
  manualAlbumInputSchema,
  type ManualAlbumInput,
} from '../../application/inputs'
import type { CatalogCandidate } from '../../application/catalog-lookup'
import type { AlbumClassification } from '../../domain/catalog/classification'
import type { CatalogReference } from '../../domain/catalog/schemas'
import { capitalizeCatalogName } from '../../application/catalog-names'
import {
  linksDraftFrom,
  linksInputFrom,
  type LinksDraft,
} from './personal-links-values'

export interface AlbumFormValues extends AlbumClassification {
  personalLinks: LinksDraft
  artist: string
  artistId: string | undefined
  newArtistConfirmed: boolean
  title: string
  originalYear: string
  coverUrl: string
  description: string
  genres: string
  country: string
  coverImage: string | undefined
  catalogReference: CatalogReference | undefined
  catalogArtistIds?: (string | undefined)[] | undefined
  catalogArtistConfirmed?: boolean[] | undefined
  catalogArtists: string[] | undefined
  catalogCountries: string[] | undefined
}
export const emptyAlbumForm: AlbumFormValues = {
  personalLinks: linksDraftFrom(),
  artist: '',
  artistId: undefined,
  newArtistConfirmed: false,
  title: '',
  primaryType: 'unspecified',
  categories: [],
  publicationStatus: 'unknown',
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
    .map(capitalizeCatalogName)
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
    title: capitalizeCatalogName(candidate.title),
    artist: candidate.artists.map(capitalizeCatalogName).join(' · '),
    artistId: undefined,
    catalogArtists: candidate.artists.map(capitalizeCatalogName),
    catalogArtistIds: candidate.artists.map(() => undefined),
    catalogArtistConfirmed: candidate.artists.map(() => false),
    catalogCountries: candidate.artists.map(() => ''),
    country: '',
    primaryType: candidate.primaryType,
    categories: candidate.categories,
    publicationStatus: candidate.publicationStatus,
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
    ...(values.personalLinks.links.length
      ? { personalLinks: linksInputFrom(values.personalLinks) }
      : {}),
    title: values.title,
    primaryType: values.primaryType,
    categories: values.categories,
    publicationStatus: values.publicationStatus,
    artists: values.catalogArtists?.map((name, index) =>
      values.catalogArtistIds?.[index]
        ? { artistId: values.catalogArtistIds[index] }
        : {
            name,
            ...(values.catalogCountries?.[index]?.trim()
              ? { country: values.catalogCountries[index].trim() }
              : {}),
          },
    ) ?? [
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
    primaryType: 'Selecciona un tipo válido.',
    categories: 'Revisa las categorías.',
    publicationStatus: 'Selecciona un estado de publicación válido.',
    originalYear: 'Escribe un año entero entre 1 y 9999, o déjalo vacío.',
    coverUrl: 'La dirección de portada debe ser una URL HTTPS válida.',
    description: 'Revisa la descripción.',
    genres:
      'Usa hasta 20 géneros de 80 caracteres como máximo, separados por comas.',
    coverImage: 'Selecciona un JPG o PNG válido de hasta 2 MiB.',
    country: 'Escribe un país de hasta 100 caracteres.',
    personalLinks:
      'Revisa los enlaces: usa URLs HTTPS sin credenciales, evita duplicados y elige como favorito sólo un enlace de escucha.',
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
