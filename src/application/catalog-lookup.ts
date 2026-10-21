import type { Album, CatalogReference } from '../domain/catalog/schemas'

export interface CatalogCandidate {
  id: string
  title: string
  artists: string[]
  primaryType: Album['primaryType']
  categories: Album['categories']
  publicationStatus: Album['publicationStatus']
  originalYear?: number
  description?: string
  catalogReference: CatalogReference
  coverUrl?: string
  warnings?: string[]
}

export interface CatalogSearchInput {
  title: string
  artist: string
  signal?: AbortSignal
}

export interface CatalogLookupClient {
  search(input: CatalogSearchInput): Promise<CatalogCandidate[]>
}

export type CatalogLookupErrorKind =
  | 'invalid_query'
  | 'unavailable'
  | 'rate_limited'
  | 'invalid_response'
  | 'timeout'

const messages: Record<CatalogLookupErrorKind, string> = {
  invalid_query: 'Escribe un título de hasta 200 caracteres para buscar.',
  unavailable:
    'No pudimos consultar Wikidata. Puedes continuar con el registro manual.',
  rate_limited:
    'Wikidata solicita esperar. Inténtalo más tarde o continúa con el registro manual.',
  invalid_response:
    'No pudimos interpretar la respuesta del catálogo. Puedes continuar con el registro manual.',
  timeout:
    'La consulta tardó demasiado. Puedes reintentar o continuar con el registro manual.',
}

export class CatalogLookupError extends Error {
  readonly kind: CatalogLookupErrorKind

  constructor(kind: CatalogLookupErrorKind) {
    super(messages[kind])
    this.name = 'CatalogLookupError'
    this.kind = kind
  }
}

export function normalizeCatalogText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es')
}
