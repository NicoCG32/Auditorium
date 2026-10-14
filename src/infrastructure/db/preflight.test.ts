// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AuditoriumDatabase } from './database'
import { checkNativeSchema } from './preflight'
import {
  historicalStores,
  historicalRows,
  historicalSnapshot,
  seedNativeStorage,
  inspectNativeStorage,
} from '../../test/historical-storage.fixture'

let factory: IDBFactory, database: AuditoriumDatabase
beforeEach(async () => {
  factory = new IDBFactory()
  const stores = historicalStores(1)
  await seedNativeStorage({
    name: 'preflight',
    version: 10,
    stores,
    rows: historicalRows(historicalSnapshot(1), stores),
    factory,
  })
  database = new AuditoriumDatabase('preflight', {
    indexedDB: factory,
    IDBKeyRange,
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  database.close()
  await database.delete()
})

test('termina la inspección nativa antes de cerrar la conexión y permitir la migración', async () => {
  const events: string[] = []
  const originalOpen = factory.open.bind(factory)
  vi.spyOn(factory, 'open').mockImplementation((name, version) => {
    const request = originalOpen(name, version)
    request.addEventListener('success', () => {
      const native = request.result
      const transaction = native.transaction.bind(native),
        close = native.close.bind(native)
      native.transaction = (names, mode) => {
        const result = transaction(names, mode)
        result.addEventListener('complete', () => events.push('complete'))
        return result
      }
      native.close = () => {
        events.push('close')
        close()
      }
    })
    return request
  })
  await checkNativeSchema(database, vi.fn())
  events.push('resolve')
  expect(events).toEqual(['complete', 'close', 'resolve'])
})

test('un aborto de la inspección rechaza la apertura y conserva versión y filas', async () => {
  const before = await inspectNativeStorage({ name: 'preflight', factory })
  const originalOpen = factory.open.bind(factory)
  const fault = vi
    .spyOn(factory, 'open')
    .mockImplementation((name, version) => {
      const request = originalOpen(name, version)
      request.addEventListener('success', () => {
        const native = request.result,
          transaction = native.transaction.bind(native)
        native.transaction = (names, mode) => {
          const result = transaction(names, mode)
          queueMicrotask(() => result.abort())
          return result
        }
      })
      return request
    })
  await expect(checkNativeSchema(database, vi.fn())).rejects.toMatchObject({
    code: 'aborted',
  })
  fault.mockRestore()
  expect(await inspectNativeStorage({ name: 'preflight', factory })).toEqual(
    before,
  )
})
