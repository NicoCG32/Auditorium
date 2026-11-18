import { z } from 'zod'
import {
  discographyAlbumSchema,
  discographyArtistSchema,
  DiscographyError,
  type DiscographyArtist,
  type DiscographyCatalog,
  type DiscographyPage,
} from '../../application/discography-catalog'
import { entityIdSchema } from '../../domain/shared/scalars'
import {
  editionDetailsFrom,
  editionSummaryFrom,
  releaseWireSchema,
} from './musicbrainz-editions'
import type {
  EditionCatalog,
  EditionPage,
} from '../../application/edition-catalog'

const artistWire = z.object({
  id: entityIdSchema,
  name: z.string().min(1).max(500),
  country: z.string().max(100).optional(),
  disambiguation: z.string().max(1000).optional(),
  type: z.string().max(100).optional(),
})
const groupWire = z.object({
  id: entityIdSchema,
  title: z.string().min(1).max(500),
  'primary-type': z.string().max(100).nullish(),
  'secondary-types': z.array(z.string().max(100)).max(20),
  'first-release-date': z.string().max(30).optional(),
  'artist-credit': z
    .array(z.object({ artist: artistWire }))
    .min(1)
    .max(50),
})
function artistFrom(row: z.output<typeof artistWire>): DiscographyArtist {
  return discographyArtistSchema.parse({
    id: row.id,
    name: row.name,
    ...(row.country ? { country: row.country } : {}),
    ...(row.disambiguation || row.type
      ? { description: row.disambiguation || row.type }
      : {}),
  })
}
export class MusicBrainzClient implements DiscographyCatalog, EditionCatalog {
  readonly available: boolean
  private readonly base: string | undefined
  private readonly fetcher: typeof fetch
  constructor(base: string | undefined, fetcher: typeof fetch = fetch) {
    this.fetcher = (...args) => fetcher(...args)
    this.base = base?.replace(/\/$/, '')
    this.available = Boolean(this.base)
  }
  private async request(
    endpoint: string,
    parameters: Record<string, string>,
    signal: AbortSignal,
  ) {
    if (!this.base)
      throw new DiscographyError(
        'La búsqueda musical no está disponible en esta instalación. Puedes continuar con el registro manual o importar un catálogo JSON.',
      )
    const url = `${this.base}/${endpoint}?${new URLSearchParams(parameters)}`
    const response = await this.fetcher(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(50000)]),
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    })
    if (!response.ok)
      throw new DiscographyError(
        response.status === 503 || response.status === 429
          ? 'El catálogo musical solicita esperar. Vuelve a intentar en unos momentos.'
          : undefined,
      )
    if (
      !response.headers.get('content-type')?.includes('application/json') ||
      !response.body
    )
      throw new DiscographyError()
    const reader = response.body.getReader()
    let text = '',
      bytes = 0
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > 2 * 1024 * 1024) throw new DiscographyError()
        text += decoder.decode(value, { stream: true })
      }
      text += decoder.decode()
      return JSON.parse(text) as unknown
    } finally {
      await reader.cancel().catch(() => {})
    }
  }
  async searchArtists(query: string, signal: AbortSignal) {
    const value = query.trim()
    if (!value || value.length > 120)
      throw new DiscographyError('Escribe un artista de hasta 120 caracteres.')
    const body = z
      .object({ artists: z.array(artistWire).max(12) })
      .parse(await this.request('artist', { query: value }, signal))
    return body.artists.map(artistFrom)
  }
  async browseEditions(
    groupId: string,
    offset: number,
    signal: AbortSignal,
  ): Promise<EditionPage> {
    entityIdSchema.parse(groupId)
    if (!Number.isInteger(offset) || offset < 0 || offset > 99999)
      throw new DiscographyError()
    const body = z
      .object({
        'release-count': z.int().nonnegative().max(100000),
        'release-offset': z.int().nonnegative(),
        releases: z.array(releaseWireSchema).max(100),
      })
      .parse(
        await this.request(
          'release',
          { group: groupId, offset: String(offset) },
          signal,
        ),
      )
    const next = offset + body.releases.length
    if (
      body['release-offset'] !== offset ||
      (next < body['release-count'] && next === offset)
    )
      throw new DiscographyError()
    return {
      total: body['release-count'],
      editions: body.releases.map(editionSummaryFrom),
      ...(next < body['release-count'] ? { nextOffset: next } : {}),
    }
  }
  async edition(id: string, signal: AbortSignal) {
    entityIdSchema.parse(id)
    const result = editionDetailsFrom(
      await this.request(`release/${id}`, {}, signal),
    )
    if (result.id !== id.toLowerCase()) throw new DiscographyError()
    return result
  }
  async browseAlbums(
    artistId: string,
    offset: number,
    signal: AbortSignal,
  ): Promise<DiscographyPage> {
    entityIdSchema.parse(artistId)
    if (!Number.isInteger(offset) || offset < 0 || offset > 99999)
      throw new DiscographyError()
    const body = z
      .object({
        'release-group-count': z.int().nonnegative().max(100000),
        'release-group-offset': z.int().nonnegative(),
        'release-groups': z.array(groupWire).max(100),
      })
      .parse(
        await this.request(
          'release-group',
          { artist: artistId, offset: String(offset) },
          signal,
        ),
      )
    if (body['release-group-offset'] !== offset) throw new DiscographyError()
    const next = offset + body['release-groups'].length
    if (next < body['release-group-count'] && next === offset)
      throw new DiscographyError(
        'El catálogo no pudo completar esta página. Vuelve a intentar cargar las obras.',
      )
    return {
      total: body['release-group-count'],
      ...(next < body['release-group-count'] && next > offset
        ? { nextOffset: next }
        : {}),
      albums: body['release-groups'].map((row) =>
        discographyAlbumSchema.parse({
          id: row.id,
          title: row.title,
          primaryType: row['primary-type'] ?? 'Unknown',
          secondaryTypes: row['secondary-types'],
          ...(row['first-release-date']
            ? { firstReleaseDate: row['first-release-date'] }
            : {}),
          artists: row['artist-credit'].map((credit) =>
            artistFrom(credit.artist),
          ),
        }),
      ),
    }
  }
}
const configured: unknown = import.meta.env.VITE_MUSICBRAINZ_PROXY_URL
function configuredProxy(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return
  try {
    const url = new URL(value.trim())
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
      return url.href.replace(/\/$/u, '')
  } catch {
    /* An invalid public configuration leaves manual entry available. */
  }
}
const proxyBase =
  configuredProxy(configured) ??
  (import.meta.env.DEV ? '/api/musicbrainz' : undefined)
export const musicBrainzCatalog = new MusicBrainzClient(proxyBase)
