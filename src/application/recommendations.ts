import { z } from 'zod'
import { listeningStatusSchema } from '../domain/library/schemas'
import type { LibraryAlbum } from './library-query'

export type RecommendationProvider = 'groq' | 'gemini'
export type RecommendationAction = 'relisten' | 'reevaluate'

export interface Recommendation {
  entryId: string
  reason: string
  action: RecommendationAction
}

export interface RecommendationCandidate {
  reference: string
  entryId: string
  title: string
  artist: string
  year: number | null
  score: number | null
  listeningStatus: LibraryAlbum['listeningStatus']
  addedOrder: number
}

export interface RecommendationContext {
  candidates: RecommendationCandidate[]
  recentReferences: string[]
}

function boundedText(value: string, maximum: number) {
  return Array.from(value.replace(/\s+/gu, ' ').trim())
    .slice(0, maximum)
    .join('')
}

function pendingPriority(album: LibraryAlbum) {
  return (
    (album.listeningStatus === 'queued' ? 4 : 0) +
    (album.listeningStatus === 'untracked' ? 2 : 0) +
    (album.score === undefined ? 1 : 0)
  )
}

/** Receives the active library projection; dates and local identifiers stay local. */
export function buildRecommendationContext(
  albums: LibraryAlbum[],
): RecommendationContext {
  const newest = albums.toSorted(
    (a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id),
  )
  const recent = newest.slice(0, 8)
  const remaining = newest
    .slice(8)
    .toSorted(
      (a, b) =>
        pendingPriority(b) - pendingPriority(a) ||
        a.addedAt.localeCompare(b.addedAt) ||
        a.id.localeCompare(b.id),
    )
  const addedOrders = new Map(
    newest.map((album, index) => [album.id, index + 1]),
  )
  const candidates = [...recent, ...remaining.slice(0, 16)].map(
    (album, index): RecommendationCandidate => ({
      reference: `a${index + 1}`,
      entryId: album.id,
      title: boundedText(album.title, 100),
      artist: boundedText(album.artist, 80),
      year: album.originalYear ?? null,
      score: album.score ?? null,
      listeningStatus: album.listeningStatus,
      addedOrder: addedOrders.get(album.id) ?? index + 1,
    }),
  )
  return {
    candidates,
    recentReferences: candidates
      .slice(0, recent.length)
      .map((row) => row.reference),
  }
}

const payloadAlbumSchema = z.strictObject({
  reference: z.string().regex(/^a(?:[1-9]|1\d|2[0-4])$/u),
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(160),
  year: z.int().min(1).max(9999).nullable(),
  score: z.number().min(1).max(10).multipleOf(0.5).nullable(),
  listeningStatus: listeningStatusSchema,
  addedOrder: z.int().min(1),
})

/** This allowlist is the only library data permitted in a provider request. */
export function recommendationPayload(context: RecommendationContext) {
  const candidates = z
    .array(payloadAlbumSchema)
    .min(1)
    .max(24)
    .parse(
      context.candidates.map((candidate) => ({
        reference: candidate.reference,
        title: boundedText(candidate.title, 100),
        artist: boundedText(candidate.artist, 80),
        year: candidate.year,
        score: candidate.score,
        listeningStatus: candidate.listeningStatus,
        addedOrder: candidate.addedOrder,
      })),
    )
  const references = new Set(candidates.map((candidate) => candidate.reference))
  if (references.size !== candidates.length)
    throw new Error('Contexto inválido.')
  const recentReferences = context.recentReferences.slice(0, 8)
  if (
    recentReferences.some((reference) => !references.has(reference)) ||
    new Set(recentReferences).size !== recentReferences.length
  )
    throw new Error('Contexto inválido.')
  return { candidates, recentReferences }
}

export function parseRecommendationResult(
  value: unknown,
  context: RecommendationContext,
): Recommendation[] {
  const maximum = Math.min(10, context.candidates.length)
  const result = z
    .strictObject({
      items: z
        .array(
          z.strictObject({
            reference: z.string(),
            reason: z
              .string()
              .trim()
              .min(1)
              .max(240)
              .refine((text) => !/[<>]|\p{Cc}|https?:|www\.|\]\(/iu.test(text)),
            action: z.enum(['relisten', 'reevaluate']),
          }),
        )
        .min(1)
        .max(maximum),
    })
    .parse(value)
  const localIds = new Map(
    context.candidates.map((candidate) => [
      candidate.reference,
      candidate.entryId,
    ]),
  )
  const seen = new Set<string>()
  return result.items.map((item) => {
    const entryId = localIds.get(item.reference)
    if (!entryId || seen.has(entryId)) throw new Error('Orden inválido.')
    seen.add(entryId)
    return { entryId, reason: item.reason, action: item.action }
  })
}
