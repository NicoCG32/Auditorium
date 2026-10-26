// @vitest-environment node
import { createClient } from '@supabase/supabase-js'
import { expect, test, vi } from 'vitest'
import { SupabaseLibraryRepository } from './client'
import { makeBackup } from '../../domain/backup.fixture'
import {
  legacySnapshotFixture,
  legacySnapshotV6Fixture,
} from '../../test/legacy-backup.fixture'
import { fixtureId, ids } from '../../domain/catalog/catalog.fixture'

test.each([5, 6, 7])(
  'lector remoto v%s conserva el contrato de referencia correspondiente',
  async (schema_version) => {
    const snapshot = makeBackup().data
    if (schema_version >= 6)
      snapshot.library.albumRatings[0]!.referenceReleaseId = ids.deluxe
    const client = createClient(
      'https://cloud.example',
      'fictitious-public-key',
      {
        global: {
          fetch: () =>
            Promise.resolve(
              Response.json({
                revision: 5,
                schema_version,
                snapshot:
                  schema_version === 7
                    ? snapshot
                    : legacySnapshotV6Fixture(snapshot),
              }),
            ),
        },
        auth: { persistSession: false },
      },
    )
    expect(
      await new SupabaseLibraryRepository(client, fixtureId(900)).load(),
    ).toEqual({ revision: 5, snapshot })
  },
)
test.each([3, 4, 5])(
  'lector remoto histórico v%s rechaza una referencia futura sin ignorarla',
  async (schema_version) => {
    const snapshot = makeBackup().data
    snapshot.library.albumRatings[0]!.referenceReleaseId = ids.deluxe
    const client = createClient(
      'https://cloud.example',
      'fictitious-public-key',
      {
        global: {
          fetch: () =>
            Promise.resolve(
              Response.json({
                revision: 5,
                schema_version,
                snapshot:
                  schema_version === 5
                    ? legacySnapshotV6Fixture(snapshot)
                    : legacySnapshotFixture(snapshot),
              }),
            ),
        },
        auth: { persistSession: false },
      },
    )
    await expect(
      new SupabaseLibraryRepository(client, fixtureId(900)).load(),
    ).rejects.toThrow()
  },
)

test.each([3, 4])(
  'lector remoto v%s normaliza sin cambiar revisión ni perder relaciones',
  async (schema_version) => {
    const snapshot = makeBackup().data
    const urls: string[] = []
    const fetcher = vi.fn((url: RequestInfo | URL) => {
      urls.push(url instanceof Request ? url.url : url.toString())
      return Promise.resolve(
        Response.json({
          revision: 3,
          schema_version,
          snapshot: legacySnapshotFixture(snapshot),
        }),
      )
    })
    const client = createClient(
      'https://cloud.example',
      'fictitious-public-key',
      { global: { fetch: fetcher }, auth: { persistSession: false } },
    )
    const repository = new SupabaseLibraryRepository(client, fixtureId(900))
    expect(await repository.load()).toEqual({ revision: 3, snapshot })
    expect(urls[0]).toContain('schema_version')
  },
)
test('un envío histórico ya confirmado se reconoce después de migrar sin duplicar ni perder cambios', async () => {
  const snapshot = makeBackup().data
  const requests: unknown[] = []
  const fetcher = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    if ((url instanceof Request ? url.url : url.toString()).includes('/rpc/')) {
      if (typeof init?.body !== 'string')
        throw new Error('Expected fictional JSON request')
      requests.push(JSON.parse(init.body))
      return Promise.resolve(
        Response.json(
          { code: '40001', message: 'Revision conflict' },
          { status: 409 },
        ),
      )
    }
    return Promise.resolve(
      Response.json({
        revision: 9,
        schema_version: 4,
        snapshot: legacySnapshotFixture(snapshot),
      }),
    )
  })
  const client = createClient(
    'https://cloud.example',
    'fictitious-public-key',
    { global: { fetch: fetcher }, auth: { persistSession: false } },
  )
  const repository = new SupabaseLibraryRepository(client, fixtureId(900))
  const operationId = fixtureId(999)
  expect(
    await repository.save({
      operationId,
      expectedRevision: 8,
      snapshot,
      localSnapshot: snapshot,
    }),
  ).toEqual({ revision: 9, snapshot })
  expect(requests).toEqual([
    expect.objectContaining({
      operation_id: operationId,
      schema_version: 7,
      document: snapshot,
    }),
  ])
})
test('una versión remota futura se rechaza sin convertirla en una biblioteca vacía', async () => {
  const client = createClient(
    'https://cloud.example',
    'fictitious-public-key',
    {
      global: {
        fetch: () =>
          Promise.resolve(
            Response.json({
              revision: 3,
              schema_version: 8,
              snapshot: makeBackup().data,
            }),
          ),
      },
      auth: { persistSession: false },
    },
  )
  await expect(
    new SupabaseLibraryRepository(client, fixtureId(900)).load(),
  ).rejects.toThrow()
})
