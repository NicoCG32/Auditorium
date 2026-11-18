import { act, renderHook, cleanup } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import { makeBackup } from '../../domain/backup.fixture'
import { fixtureId, ids } from '../../domain/catalog/catalog.fixture'
import type {
  LocalSnapshot,
  TransactionalLocalRepository,
  SnapshotMutation,
} from '../../domain/repositories/local-repository'
import { DraftContext } from '../navigation/draft-context'
import { DraftRegistry } from '../navigation/drafts'
import { useCatalogReview } from './use-catalog-review'

afterEach(cleanup)
function setup() {
  let snapshot = makeBackup().data
  snapshot.catalog.albums.find((row) => row.id === ids.album)!.musicBrainz = {
    id: fixtureId(9000),
    retrievedAt: '2026-11-16T12:00:00.000Z',
  }
  const mutate = vi.fn(() => Promise.resolve())
  const repository: TransactionalLocalRepository = {
    open: () => Promise.resolve(snapshot.identity),
    readSnapshot: () => Promise.resolve(structuredClone(snapshot)),
    close: () => {},
    async mutate<T>(change: (current: LocalSnapshot) => SnapshotMutation<T>) {
      await mutate()
      const next = change(structuredClone(snapshot))
      snapshot = next.snapshot
      return next.result
    },
  }
  const registry = new DraftRegistry(),
    complete = vi.fn(),
    busy = vi.fn()
  const committed = vi.fn(() => Promise.resolve(structuredClone(snapshot)))
  const hook = renderHook(
    () =>
      useCatalogReview({
        id: 'details',
        repository,
        dirty: false,
        onBusyChange: busy,
        onCommitted: committed,
        onComplete: complete,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <DraftContext value={registry}>{children}</DraftContext>
      ),
    },
  )
  return { ...hook, repository, mutate, registry, complete, committed, busy }
}
test('una lectura fallida después de confirmar bloquea la salida y se recupera sin repetir la escritura', async () => {
  const h = setup()
  h.committed.mockRejectedValueOnce(new Error('read failed'))
  await act(() =>
    h.result.current.preview(() =>
      h.result.current.service.prepareCover(ids.album),
    ),
  )
  expect(h.registry.dirty()).toHaveLength(1)
  await act(() => h.result.current.confirm())
  expect(h.mutate).toHaveBeenCalledTimes(1)
  expect(h.result.current.pending).toBe(true)
  expect(h.registry.blocked()).toBe(true)
  expect(h.registry.dirty()).toEqual([])
  expect(h.complete).not.toHaveBeenCalled()
  await act(() => h.result.current.confirm())
  expect(h.mutate).toHaveBeenCalledTimes(1)
  await act(() => h.result.current.retryRead())
  expect(h.mutate).toHaveBeenCalledTimes(1)
  expect(h.result.current.pending).toBe(false)
  expect(h.registry.unsettled()).toBe(false)
  expect(h.complete).toHaveBeenCalledTimes(1)
  expect(h.busy).toHaveBeenLastCalledWith(false)
})
test('el fallo de escritura exige otra revisión, conserva la biblioteca y libera la navegación', async () => {
  const h = setup(),
    before = await h.repository.readSnapshot()
  await act(() =>
    h.result.current.preview(() =>
      h.result.current.service.prepareCover(ids.album),
    ),
  )
  h.mutate.mockRejectedValueOnce(new Error('transaction failed'))
  await act(() => h.result.current.confirm())
  expect(await h.repository.readSnapshot()).toEqual(before)
  expect(h.result.current.prepared).toBeUndefined()
  expect(h.result.current.pending).toBe(false)
  expect(h.result.current.failure).toBe('transaction failed')
  expect(h.committed).not.toHaveBeenCalled()
  expect(h.registry.blocked()).toBe(false)
})
test('confirmaciones simultáneas ejecutan una sola transacción y una sola recarga', async () => {
  const h = setup()
  await act(() =>
    h.result.current.preview(() =>
      h.result.current.service.prepareCover(ids.album),
    ),
  )
  await act(async () => {
    await Promise.all([h.result.current.confirm(), h.result.current.confirm()])
  })
  expect(h.mutate).toHaveBeenCalledTimes(1)
  expect(h.committed).toHaveBeenCalledTimes(1)
  expect(h.complete).toHaveBeenCalledTimes(1)
})
