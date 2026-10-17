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
  catalogReference: CatalogReference | undefined
  catalogArtists: string[] | undefined
}
export const emptyAlbumForm: AlbumFormValues = {
  artist: '',
  artistId: undefined,
  title: '',
  releaseType: 'album',
  originalYear: '',
  coverUrl: '',
  description: '',
  catalogReference: undefined,
  catalogArtists: undefined,
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
  const parsed = manualAlbumInputSchema.safeParse({
    title: values.title,
    releaseType: values.releaseType,
    artists: values.catalogArtists?.map((name) => ({ name })) ?? [
      values.artistId === undefined
        ? { name: values.artist }
        : { artistId: values.artistId },
    ],
    ...(year
      ? { originalYear: /^\d{1,4}$/u.test(year) ? Number(year) : Number.NaN }
      : {}),
    ...(values.coverUrl.trim() ? { coverUrl: values.coverUrl.trim() } : {}),
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
  }
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] === 'artists' ? 'artist' : String(issue.path[0])
    errors[field] = messages[field] ?? 'Revisa este campo.'
  }
  return { success: false, errors }
}
