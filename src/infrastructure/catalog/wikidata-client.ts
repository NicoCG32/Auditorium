import {
  CatalogLookupError,
  normalizeCatalogText,
  type CatalogCandidate,
  type CatalogLookupClient,
  type CatalogSearchInput,
} from '../../application/catalog-lookup'
import { catalogReferenceSchema } from '../../domain/catalog/schemas'

const endpoint = 'https://www.wikidata.org/w/api.php'
const identifier = 'Auditorium/1.0.0 (https://github.com/NicoCG32/Auditorium)'
const entityId = /^Q[1-9]\d{0,14}$/u
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const spotifyId = /^[A-Za-z0-9]{22}$/u
const youtubeId = /^[A-Za-z0-9_-]{11}$/u
const maxBytes = 1_000_000
const maxCandidates = 8
const maxArtists = 32

const musicalTypes: Record<string, CatalogCandidate['releaseType']> = {
  Q482994: 'album',
  Q208569: 'album',
  Q209939: 'live',
  Q222910: 'compilation',
  Q169930: 'ep',
  Q134556: 'single',
}

type JsonObject = Record<string, unknown>

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, maximum = 300): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed && trimmed.length <= maximum ? trimmed : undefined
}

function label(entity: JsonObject, field = 'labels'): string | undefined {
  const values = entity[field]
  if (!object(values)) return undefined
  for (const language of ['es', 'en']) {
    const entry = values[language]
    if (object(entry)) {
      const value = text(entry.value, field === 'descriptions' ? 1000 : 300)
      if (value) return value
    }
  }
  return undefined
}

function values(entity: JsonObject, property: string): unknown[] {
  const claims = entity.claims
  if (!object(claims)) return []
  const statements = claims[property]
  if (!Array.isArray(statements)) return []
  if (statements.length > 64) throw new CatalogLookupError('invalid_response')
  return statements.flatMap((statement: unknown) => {
    if (!object(statement) || statement.rank === 'deprecated') return []
    const snak = statement.mainsnak
    if (!object(snak) || snak.snaktype !== 'value') return []
    const datavalue = snak.datavalue
    return object(datavalue) ? [datavalue.value] : []
  })
}

function ids(entity: JsonObject, property: string): string[] {
  return [
    ...new Set(
      values(entity, property).flatMap((value) =>
        object(value) && typeof value.id === 'string' && entityId.test(value.id)
          ? [value.id]
          : [],
      ),
    ),
  ]
}

function externalIds(
  entity: JsonObject,
  property: string,
  pattern: RegExp,
): string[] {
  return [
    ...new Set(
      values(entity, property).flatMap((value) =>
        typeof value === 'string' && pattern.test(value) ? [value] : [],
      ),
    ),
  ]
}

function musicalType(
  entity: JsonObject,
): CatalogCandidate['releaseType'] | undefined {
  const types = ids(entity, 'P31').flatMap((id) =>
    musicalTypes[id] ? [musicalTypes[id]] : [],
  )
  if (!types.length) return undefined
  const forms = ids(entity, 'P7937').flatMap((id) =>
    musicalTypes[id] ? [musicalTypes[id]] : [],
  )
  const specific = [...new Set([...types, ...forms])].filter(
    (type) => type !== 'album',
  )
  if (specific.length === 1) return specific[0]
  return types.includes('album') ? 'album' : specific[0]
}

function publicationYear(entity: JsonObject): number | undefined {
  const years = new Set(
    values(entity, 'P577').flatMap((value) => {
      if (
        !object(value) ||
        typeof value.time !== 'string' ||
        typeof value.precision !== 'number' ||
        value.precision < 9 ||
        value.calendarmodel !== 'http://www.wikidata.org/entity/Q1985727'
      )
        return []
      const match = /^\+(\d{4})-/u.exec(value.time)
      const year = match ? Number(match[1]) : 0
      return year >= 1 && year <= 9999 ? [year] : []
    }),
  )
  return years.size === 1 ? [...years][0] : undefined
}

function entities(body: JsonObject): JsonObject {
  if (!object(body.entities)) throw new CatalogLookupError('invalid_response')
  return body.entities
}

function getEntity(collection: JsonObject, id: string): JsonObject | undefined {
  const entity = collection[id]
  return object(entity) && entity.id === id && !('missing' in entity)
    ? entity
    : undefined
}

async function readJson(response: Response): Promise<JsonObject> {
  const contentType = response.headers.get('content-type') ?? ''
  const declaredSize = Number(response.headers.get('content-length'))
  if (!contentType.includes('application/json') || declaredSize > maxBytes)
    throw new CatalogLookupError('invalid_response')
  let bodyText = ''
  if (response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const decode = (input?: Uint8Array, stream = false): string => {
      try {
        return decoder.decode(input, { stream })
      } catch {
        throw new CatalogLookupError('invalid_response')
      }
    }
    let received = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        received += chunk.value.byteLength
        if (received > maxBytes) {
          await reader.cancel()
          throw new CatalogLookupError('invalid_response')
        }
        bodyText += decode(chunk.value, true)
      }
      bodyText += decode()
    } finally {
      reader.releaseLock()
    }
  } else {
    bodyText = await response.text()
    if (new TextEncoder().encode(bodyText).byteLength > maxBytes)
      throw new CatalogLookupError('invalid_response')
  }
  let body: unknown
  try {
    body = JSON.parse(bodyText)
  } catch {
    throw new CatalogLookupError('invalid_response')
  }
  if (!object(body)) throw new CatalogLookupError('invalid_response')
  if (object(body.error)) {
    const code = body.error.code
    throw new CatalogLookupError(
      ['ratelimited', 'maxlag', 'readonly'].includes(String(code))
        ? 'rate_limited'
        : 'unavailable',
    )
  }
  return body
}

function aborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException('Consulta cancelada.', 'AbortError')
}

async function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  aborted(signal)
  if (milliseconds <= 0) return
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', cancel)
      resolve()
    }
    const timer = setTimeout(finish, milliseconds)
    const cancel = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      reject(new DOMException('Consulta cancelada.', 'AbortError'))
    }
    signal?.addEventListener('abort', cancel, { once: true })
  })
}

export interface WikidataClientOptions {
  fetch?: typeof globalThis.fetch
  minIntervalMs?: number
  timeoutMs?: number
}

export function createWikidataClient(
  options: WikidataClientOptions = {},
): CatalogLookupClient {
  const fetcher = options.fetch ?? ((...args) => globalThis.fetch(...args))
  const interval = options.minIntervalMs ?? 1100
  const timeout = options.timeoutMs ?? 15000
  let tail: Promise<unknown> = Promise.resolve()
  let lastStarted = -Infinity

  async function request(
    params: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<JsonObject> {
    const operation = tail.then(async () => {
      aborted(signal)
      await wait(interval - (Date.now() - lastStarted), signal)
      aborted(signal)
      lastStarted = Date.now()
      const controller = new AbortController()
      const cancel = () => controller.abort()
      signal?.addEventListener('abort', cancel, { once: true })
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeout)
      try {
        const url = new URL(endpoint)
        url.search = new URLSearchParams({
          ...params,
          origin: '*',
          format: 'json',
          formatversion: '2',
        }).toString()
        const response = await fetcher(url.href, {
          method: 'GET',
          headers: { 'Api-User-Agent': identifier },
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        })
        if (!response.ok)
          throw new CatalogLookupError(
            [429, 503].includes(response.status)
              ? 'rate_limited'
              : 'unavailable',
          )
        const body = await readJson(response)
        aborted(signal)
        return body
      } catch (error) {
        aborted(signal)
        if (timedOut) throw new CatalogLookupError('timeout')
        if (error instanceof CatalogLookupError) throw error
        throw new CatalogLookupError('unavailable')
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
      }
    })
    tail = operation.catch(() => undefined)
    return operation
  }

  return {
    async search(input: CatalogSearchInput): Promise<CatalogCandidate[]> {
      const title = input.title.trim()
      if (!title || title.length > 200 || input.artist.trim().length > 200)
        throw new CatalogLookupError('invalid_query')
      const search = await request(
        {
          action: 'wbsearchentities',
          search: title,
          language: 'en',
          uselang: 'es',
          type: 'item',
          limit: String(maxCandidates),
        },
        input.signal,
      )
      if (!Array.isArray(search.search))
        throw new CatalogLookupError('invalid_response')
      const candidateIds = [
        ...new Set(
          search.search
            .slice(0, maxCandidates)
            .flatMap((entry: unknown) =>
              object(entry) &&
              typeof entry.id === 'string' &&
              entityId.test(entry.id)
                ? [entry.id]
                : [],
            ),
        ),
      ]
      if (!candidateIds.length) return []
      const details = entities(
        await request(
          {
            action: 'wbgetentities',
            ids: candidateIds.join('|'),
            props: 'claims|labels|descriptions',
            languages: 'es|en',
            languagefallback: '1',
          },
          input.signal,
        ),
      )
      const musical = candidateIds.flatMap((id) => {
        const entity = getEntity(details, id)
        if (!entity) return []
        const releaseType = musicalType(entity)
        const name = label(entity)
        const artistIds = ids(entity, 'P175')
        return releaseType && name && artistIds.length
          ? [{ id, entity, releaseType, name, artistIds }]
          : []
      })
      const artistIds = [...new Set(musical.flatMap((item) => item.artistIds))]
      if (artistIds.length > maxArtists)
        throw new CatalogLookupError('invalid_response')
      if (!artistIds.length) return []
      const artists = entities(
        await request(
          {
            action: 'wbgetentities',
            ids: artistIds.join('|'),
            props: 'labels',
            languages: 'es|en',
            languagefallback: '1',
          },
          input.signal,
        ),
      )
      const retrievedAt = new Date().toISOString()
      const candidates = musical.flatMap((item): CatalogCandidate[] => {
        const names = item.artistIds.flatMap((id) => {
          const entity = getEntity(artists, id)
          const name = entity ? label(entity) : undefined
          return name ? [name] : []
        })
        if (names.length !== item.artistIds.length) return []
        const warnings: string[] = []
        const mbids = externalIds(item.entity, 'P436', uuid).filter(
          (value) =>
            catalogReferenceSchema.shape.musicBrainzReleaseGroupId.safeParse(
              value,
            ).success,
        )
        if (mbids.length > 1)
          warnings.push(
            'Hay varias referencias MusicBrainz; no se seleccionó una.',
          )
        const spotifyIds = externalIds(item.entity, 'P2205', spotifyId)
        const youtubeIds = externalIds(item.entity, 'P1651', youtubeId)
        if (spotifyIds.length > 8 || youtubeIds.length > 8)
          warnings.push('Se muestran como máximo ocho enlaces por plataforma.')
        const reference = catalogReferenceSchema.parse({
          provider: 'wikidata',
          entityId: item.id,
          retrievedAt,
          ...(mbids.length === 1
            ? { musicBrainzReleaseGroupId: mbids[0] }
            : {}),
          ...(spotifyIds.length
            ? { spotifyAlbumIds: spotifyIds.slice(0, 8) }
            : {}),
          ...(youtubeIds.length
            ? { youtubeVideoIds: youtubeIds.slice(0, 8) }
            : {}),
        })
        const originalYear = publicationYear(item.entity)
        const description = label(item.entity, 'descriptions')
        if (originalYear === undefined && values(item.entity, 'P577').length)
          warnings.push('La fecha de publicación necesita revisión manual.')
        return [
          {
            id: item.id,
            title: item.name,
            artists: names,
            releaseType: item.releaseType,
            catalogReference: reference,
            ...(originalYear === undefined ? {} : { originalYear }),
            ...(description ? { description } : {}),
            ...(reference.musicBrainzReleaseGroupId
              ? {
                  coverUrl: `https://coverartarchive.org/release-group/${reference.musicBrainzReleaseGroupId}/front-500`,
                }
              : {}),
            ...(warnings.length ? { warnings } : {}),
          },
        ]
      })
      const artist = normalizeCatalogText(input.artist)
      const normalizedTitle = normalizeCatalogText(title)
      const score = (candidate: CatalogCandidate) =>
        Number(normalizeCatalogText(candidate.title) === normalizedTitle) +
        2 *
          Number(
            !!artist &&
              candidate.artists.some(
                (name) => normalizeCatalogText(name) === artist,
              ),
          )
      return candidates.sort((left, right) => score(right) - score(left))
    },
  }
}

export const wikidataCatalogClient = createWikidataClient()
