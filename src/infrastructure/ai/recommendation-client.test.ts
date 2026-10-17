// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  buildRecommendationContext,
  type RecommendationProvider,
} from '../../application/recommendations'
import {
  recommendationModels,
  RecommendationRequestError,
  requestRecommendations,
} from './recommendation-client'

const secret = 'fictitious-session-key-for-test'
const privateId = '00000000-0000-4000-8000-000000000001'
function context() {
  return buildRecommendationContext([
    {
      id: privateId,
      albumId: '00000000-0000-4000-8000-000000000002',
      title: 'Horizonte ficticio',
      artist: 'Artista ficticio',
      searchText: 'búsqueda privada que no se envía',
      addedAt: '2026-10-15T12:03:45.000Z',
      listeningStatus: 'queued',
    },
  ])
}
const item = {
  reference: 'a1',
  reason: 'Una incorporación pendiente de escucha.',
  action: 'relisten',
}
const content = JSON.stringify({ items: [item] })
function completed(provider: RecommendationProvider = 'groq', text = content) {
  return provider === 'groq'
    ? { choices: [{ finish_reason: 'stop', message: { content: text } }] }
    : { candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
function mockFetch(response: Response = json(completed())) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('transporte de recomendaciones sin persistencia', () => {
  test.each<RecommendationProvider>(['groq', 'gemini'])(
    'envía sólo campos aprobados a %s y resuelve IDs localmente',
    async (provider) => {
      const fetcher = mockFetch(json(completed(provider)))
      const result = await requestRecommendations({
        provider,
        apiKey: secret,
        context: context(),
      })
      expect(result).toEqual([
        { entryId: privateId, reason: item.reason, action: 'relisten' },
      ])
      expect(fetcher).toHaveBeenCalledTimes(1)
      const [url, init] = fetcher.mock.calls[0]!
      if (typeof url !== 'string' || typeof init?.body !== 'string')
        throw new Error('Se esperaba una solicitud JSON con URL textual.')
      expect(url).not.toContain(secret)
      expect(new URL(url).search).toBe('')
      expect(init).toMatchObject({
        method: 'POST',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        redirect: 'error',
      })
      expect(init?.body).not.toMatch(
        /00000000-|2026-10-15|búsqueda privada|entryId|albumId|addedAt|searchText/u,
      )
      expect(init?.body).not.toContain(secret)
      const body = JSON.parse(init.body) as Record<string, unknown>
      if (provider === 'groq') {
        expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
        expect(init?.headers).toEqual({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        })
        expect(body).toMatchObject({
          model: recommendationModels.groq,
          reasoning_effort: 'low',
          include_reasoning: false,
          max_completion_tokens: 4096,
          response_format: {
            type: 'json_schema',
            json_schema: {
              strict: true,
              schema: { additionalProperties: false },
            },
          },
        })
      } else {
        expect(url).toBe(
          `https://generativelanguage.googleapis.com/v1beta/models/${recommendationModels.gemini}:generateContent`,
        )
        expect(init?.headers).toEqual({
          'Content-Type': 'application/json',
          'x-goog-api-key': secret,
        })
        expect(body).toMatchObject({
          generationConfig: {
            maxOutputTokens: 4096,
            responseFormat: {
              text: {
                mimeType: 'application/json',
                schema: { additionalProperties: false },
              },
            },
          },
        })
      }
      expect(body).not.toHaveProperty('tools')
      expect(body).not.toHaveProperty('user')
    },
  )

  test.each([
    '',
    'corta',
    'key with spaces',
    'invalid\nheader',
    'x'.repeat(4097),
  ])('no envía solicitudes sin una clave aceptable', async (apiKey) => {
    const fetcher = mockFetch()
    await expect(
      requestRecommendations({ provider: 'groq', apiKey, context: context() }),
    ).rejects.toMatchObject({ code: 'invalid_key' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('no envía estando sin conexión ni con contexto vacío', async () => {
    const fetcher = mockFetch()
    vi.stubGlobal('navigator', { onLine: false })
    await expect(
      requestRecommendations({
        provider: 'groq',
        apiKey: secret,
        context: context(),
      }),
    ).rejects.toMatchObject({ code: 'offline' })
    vi.stubGlobal('navigator', { onLine: true })
    await expect(
      requestRecommendations({
        provider: 'groq',
        apiKey: secret,
        context: buildRecommendationContext([]),
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('congela el vínculo entre referencias y entradas durante la solicitud', async () => {
    let finish: (value: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      ),
    )
    const original = context()
    const pending = requestRecommendations({
      provider: 'groq',
      apiKey: secret,
      context: original,
    })
    original.candidates[0]!.entryId = 'otra-entrada'
    original.candidates[0]!.reference = 'a2'
    original.recentReferences.length = 0
    finish(json(completed()))
    expect(await pending).toEqual([
      { entryId: privateId, reason: item.reason, action: 'relisten' },
    ])
  })

  test('cancela inmediatamente y descarta una respuesta tardía aunque fetch no respete abort', async () => {
    const controller = new AbortController()
    let finish: (value: Response) => void = () => {}
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    const pending = requestRecommendations({
      provider: 'groq',
      apiKey: secret,
      context: context(),
      signal: controller.signal,
    })
    controller.abort(new Error(`Mensaje privado ${secret}`))
    await expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Solicitud cancelada.',
    })
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    finish(json(completed()))
  })

  test('una señal ya cancelada no dispara la llamada', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = mockFetch()
    await expect(
      requestRecommendations({
        provider: 'groq',
        apiKey: secret,
        context: context(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('aplica 30 segundos de límite aun cuando fetch nunca resuelva y no reintenta', async () => {
    vi.useFakeTimers()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetcher)
    const expectation = expect(
      requestRecommendations({
        provider: 'groq',
        apiKey: secret,
        context: context(),
      }),
    ).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(30_000)
    await expectation
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  test('el límite incluye un cuerpo que se queda abierto y cancela su lector', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    mockFetch(new Response(new ReadableStream({ cancel })))
    const expectation = expect(
      requestRecommendations({
        provider: 'groq',
        apiKey: secret,
        context: context(),
      }),
    ).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(30_000)
    await expectation
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})

describe('errores de proveedor y salida no confiable', () => {
  test.each([
    [401, 'invalid_key'],
    [403, 'invalid_key'],
    [429, 'quota'],
    [404, 'unavailable'],
    [500, 'unavailable'],
  ])(
    'traduce HTTP %i sin reflejar mensajes ni reintentar',
    async (status, code) => {
      const fetcher = mockFetch(
        json(
          { error: { message: `Secreto ${secret} y datos privados` } },
          Number(status),
        ),
      )
      const error: unknown = await requestRecommendations({
        provider: 'groq',
        apiKey: secret,
        context: context(),
      }).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(RecommendationRequestError)
      expect(error).toMatchObject({ code })
      expect(String(error)).not.toContain(secret)
      expect(String(error)).not.toContain('datos privados')
      expect(fetcher).toHaveBeenCalledTimes(1)
    },
  )

  test('reconoce API_KEY_INVALID de Gemini sin mostrar su mensaje remoto', async () => {
    mockFetch(
      json(
        {
          error: { details: [{ reason: 'API_KEY_INVALID' }], message: secret },
        },
        400,
      ),
    )
    await expect(
      requestRecommendations({
        provider: 'gemini',
        apiKey: secret,
        context: context(),
      }),
    ).rejects.toMatchObject({ code: 'invalid_key' })
  })

  test('mantiene un error de autenticación aunque el cuerpo sea HTML', async () => {
    mockFetch(new Response('<html>Mensaje remoto</html>', { status: 401 }))
    await expect(
      requestRecommendations({
        provider: 'groq',
        apiKey: secret,
        context: context(),
      }),
    ).rejects.toMatchObject({ code: 'invalid_key' })
  })

  test('sanitiza fallos de red con mensajes sensibles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError(secret)),
    )
    const error: unknown = await requestRecommendations({
      provider: 'groq',
      apiKey: secret,
      context: context(),
    }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'offline' })
    expect(String(error)).not.toContain(secret)
  })

  test.each([
    {},
    { choices: [] },
    { choices: [{ finish_reason: 'length', message: { content } }] },
    {
      choices: [{ finish_reason: 'stop', message: { content, refusal: 'No' } }],
    },
    completed('groq', '```json\n{}\n```'),
    completed(
      'groq',
      JSON.stringify({ items: [{ ...item, reference: 'a2' }] }),
    ),
    completed('groq', JSON.stringify({ items: [item, item] })),
    completed(
      'groq',
      JSON.stringify({ items: [{ ...item, reason: '<script>…</script>' }] }),
    ),
  ])(
    'rechaza respuestas incompletas o ajenas al contrato: %j',
    async (value) => {
      mockFetch(json(value))
      await expect(
        requestRecommendations({
          provider: 'groq',
          apiKey: secret,
          context: context(),
        }),
      ).rejects.toMatchObject({ code: 'invalid_response' })
    },
  )

  test.each([
    { promptFeedback: { blockReason: 'SAFETY' } },
    {
      candidates: [
        { finishReason: 'MAX_TOKENS', content: { parts: [{ text: content }] } },
      ],
    },
    {
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: content, thought: true }] },
        },
      ],
    },
  ])(
    'rechaza bloqueos, truncamiento y razonamientos de Gemini: %j',
    async (value) => {
      mockFetch(json(value))
      await expect(
        requestRecommendations({
          provider: 'gemini',
          apiKey: secret,
          context: context(),
        }),
      ).rejects.toMatchObject({ code: 'invalid_response' })
    },
  )

  test('clasifica JSON malformado como respuesta inválida', async () => {
    mockFetch(new Response('{unparseable'))
    await expect(
      requestRecommendations({
        provider: 'groq',
        apiKey: secret,
        context: context(),
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })

  test.each([true, false])(
    'limita respuestas a 128 KiB con Content-Length presente=%s',
    async (includeLength) => {
      const cancel = vi.fn()
      const bytes = new TextEncoder().encode('🎵'.repeat(40_000))
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(bytes)
        },
        cancel,
      })
      mockFetch(
        new Response(stream, {
          headers: includeLength
            ? { 'Content-Length': String(bytes.byteLength) }
            : {},
        }),
      )
      await expect(
        requestRecommendations({
          provider: 'groq',
          apiKey: secret,
          context: context(),
        }),
      ).rejects.toMatchObject({ code: 'invalid_response' })
      expect(cancel).toHaveBeenCalledTimes(1)
    },
  )
})
