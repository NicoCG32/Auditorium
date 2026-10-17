// @vitest-environment node
import { describe, expect, test } from 'vitest'
import type { LibraryAlbum } from './library-query'
import {
  buildRecommendationContext,
  parseRecommendationResult,
  recommendationPayload,
} from './recommendations'

function album(
  index: number,
  overrides: Partial<LibraryAlbum> = {},
): LibraryAlbum {
  return {
    id: `entrada-local-${index}`,
    albumId: `album-local-${index}`,
    title: `Álbum ficticio ${index}`,
    artist: 'Artista ficticio',
    searchText: 'búsqueda privada',
    addedAt: `2026-09-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
    listeningStatus: 'completed',
    score: 8,
    ...overrides,
  }
}

describe('contexto acotado para recomendaciones', () => {
  test('incluye ocho recientes y recupera pendientes antiguos sin alterar la biblioteca', () => {
    const albums = Array.from({ length: 30 }, (_, index) => album(index))
    albums[0] = album(0, { listeningStatus: 'queued' })
    delete albums[1]!.score
    const before = structuredClone(albums)
    const context = buildRecommendationContext(albums)
    expect(context.candidates).toHaveLength(24)
    expect(context.recentReferences).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
      'a5',
      'a6',
      'a7',
      'a8',
    ])
    expect(context.candidates.slice(0, 8).map((row) => row.entryId)).toEqual(
      [29, 28, 27, 26, 25, 24, 23, 22].map((index) => `entrada-local-${index}`),
    )
    expect(context.candidates[8]?.entryId).toBe('entrada-local-0')
    expect(context.candidates[9]?.entryId).toBe('entrada-local-1')
    expect(
      context.candidates.find((row) => row.entryId === 'entrada-local-0')
        ?.addedOrder,
    ).toBe(30)
    expect(albums).toEqual(before)
  })

  test('la selección permanece determinista aunque cambie el orden de entrada', () => {
    const albums = Array.from({ length: 30 }, (_, index) =>
      album(index, { addedAt: '2026-09-01T00:00:00Z' }),
    )
    expect(buildRecommendationContext(albums)).toEqual(
      buildRecommendationContext(albums.toReversed()),
    )
  })

  test('proyecta exclusivamente campos permitidos sin IDs, fechas exactas ni búsqueda', () => {
    const context = buildRecommendationContext([album(0)])
    const payload = recommendationPayload(context)
    expect(payload).toEqual({
      candidates: [
        {
          reference: 'a1',
          title: 'Álbum ficticio 0',
          artist: 'Artista ficticio',
          year: null,
          score: 8,
          listeningStatus: 'completed',
          addedOrder: 1,
        },
      ],
      recentReferences: ['a1'],
    })
    expect(JSON.stringify(payload)).not.toMatch(
      /local-|2026-09|búsqueda|entryId|albumId|addedAt|searchText/u,
    )
  })

  test('acota títulos y artistas por caracteres sin romper pares Unicode', () => {
    const context = buildRecommendationContext([
      album(0, { title: `  ${'🎵'.repeat(110)}\n`, artist: 'A'.repeat(90) }),
    ])
    expect(context.candidates[0]?.title).toBe('🎵'.repeat(100))
    expect(context.candidates[0]?.artist).toHaveLength(80)
    expect(() => recommendationPayload(context)).not.toThrow()
  })

  test('una biblioteca vacía no crea candidatos ficticios', () => {
    const context = buildRecommendationContext([])
    expect(context).toEqual({ candidates: [], recentReferences: [] })
    expect(() => recommendationPayload(context)).toThrow()
  })

  test('rechaza referencias repetidas o recientes fuera del conjunto antes de enviar', () => {
    const context = buildRecommendationContext([album(0), album(1)])
    const duplicate = structuredClone(context)
    duplicate.candidates[1]!.reference = duplicate.candidates[0]!.reference
    expect(() => recommendationPayload(duplicate)).toThrow()
    context.recentReferences.push('a24')
    expect(() => recommendationPayload(context)).toThrow()
  })
})

describe('validación de un orden externo', () => {
  const context = buildRecommendationContext([album(0), album(1)])
  const valid = {
    reference: 'a2',
    reason: '  Conviene revisitarlo.  ',
    action: 'reevaluate',
  }

  test('resuelve referencias sólo contra el contexto y conserva el orden recibido', () => {
    expect(parseRecommendationResult({ items: [valid] }, context)).toEqual([
      {
        entryId: 'entrada-local-0',
        reason: 'Conviene revisitarlo.',
        action: 'reevaluate',
      },
    ])
  })

  test.each([
    { items: [] },
    { items: [valid, valid] },
    { items: [{ ...valid, reference: 'a24' }] },
    { items: [{ ...valid, action: 'change_score' }] },
    { items: [{ ...valid, reason: '' }] },
    { items: [{ ...valid, reason: 'x'.repeat(241) }] },
    { items: [{ ...valid, reason: '<img src=x>' }] },
    { items: [{ ...valid, reason: 'Visita https://example.com' }] },
    { items: [{ ...valid, reason: '[Un enlace](example.com)' }] },
    { items: [{ ...valid, reason: 'Texto\u0000oculto' }] },
    { items: [{ ...valid, entryId: 'entrada-inventada' }] },
    { items: [valid], extra: true },
  ])('rechaza contenido inválido: %j', (value) => {
    expect(() => parseRecommendationResult(value, context)).toThrow()
  })

  test('limita el orden a diez aunque el contexto tenga más candidatos', () => {
    const larger = buildRecommendationContext(
      Array.from({ length: 20 }, (_, index) => album(index)),
    )
    expect(() =>
      parseRecommendationResult(
        {
          items: larger.candidates
            .slice(0, 11)
            .map((candidate) => ({ ...valid, reference: candidate.reference })),
        },
        larger,
      ),
    ).toThrow()
  })
})
