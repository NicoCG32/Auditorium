// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId } from '../domain/catalog/catalog.fixture'
import {
  mergeSnapshots,
  canonical,
  sameSnapshot,
  SyncConflict,
  type PendingSync,
  type RemoteLibrary,
  type RemoteLibraryRepository,
} from '../domain/sync'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { LibrarySync } from './library-sync'

let factory: IDBFactory
let databases: AuditoriumDatabase[]
beforeEach(() => {
  factory = new IDBFactory()
  databases = []
})
afterEach(async () => {
  for (const db of databases) {
    db.close()
    await db.delete()
  }
})
async function device(name: string, seeded = false) {
  const database = new AuditoriumDatabase(name, {
    indexedDB: factory,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => fixtureId(900),
  })
  if (seeded)
    await repository.restoreEmpty(makeBackup().data, await repository.open())
  return repository
}
class Remote implements RemoteLibraryRepository {
  value: RemoteLibrary | null = null
  lastId = ''
  load = vi.fn(() => Promise.resolve(structuredClone(this.value)))
  save = vi.fn((pending: PendingSync) => {
    if (pending.operationId === this.lastId && this.value)
      return Promise.resolve(structuredClone(this.value))
    if (pending.expectedRevision !== (this.value?.revision ?? 0))
      return Promise.reject(new SyncConflict())
    this.lastId = pending.operationId
    this.value = {
      revision: (this.value?.revision ?? 0) + 1,
      snapshot: structuredClone(pending.snapshot),
    }
    return Promise.resolve(structuredClone(this.value))
  })
}
async function title(repository: IndexedDbRepository, value: string) {
  await repository.mutate((snapshot) => {
    snapshot.catalog.albums[0]!.title = value
    return { snapshot, result: undefined }
  })
}

test('dos dispositivos comparten IDs, álbumes, notas, retirados y adquisiciones', async () => {
  const first = await device('first', true),
    second = await device('second'),
    remote = new Remote()
  await new LibrarySync(first, remote).sync()
  await new LibrarySync(second, remote).sync()
  expect(await second.readSnapshot()).toEqual(await first.readSnapshot())
  expect((await second.readSyncFrame()).checkpoint.revision).toBe(1)
})

test('sincroniza una importación solicitada mientras termina una lectura vacía', async () => {
  const local = await device('import-during-load'),
    remote = new Remote()
  let release!: () => void
  let started!: () => void
  const loading = new Promise<void>((resolve) => {
    started = resolve
  })
  const paused = new Promise<void>((resolve) => {
    release = resolve
  })
  remote.load.mockImplementationOnce(async () => {
    started()
    await paused
    return null
  })
  const engine = new LibrarySync(local, remote)
  const initial = engine.sync()
  await loading
  const frame = await local.readSyncFrame()
  await local.applySyncFrame(frame, makeBackup().data, frame.checkpoint)
  const imported = engine.sync()
  release()
  await Promise.all([initial, imported])
  expect(remote.value?.snapshot).toEqual(makeBackup().data)
  expect((await local.readSyncFrame()).checkpoint.revision).toBe(1)
  expect(engine.getSnapshot().phase).toBe('synced')
})

test('cambios independientes offline se combinan y las bajas no resucitan', async () => {
  const first = await device('first', true),
    second = await device('second'),
    remote = new Remote()
  const a = new LibrarySync(first, remote),
    b = new LibrarySync(second, remote)
  await a.sync()
  await b.sync()
  await title(first, 'Un Nombre Nuevo')
  await second.mutate((snapshot) => {
    snapshot.library.albumRatings = []
    return { snapshot, result: undefined }
  })
  await a.sync()
  await b.sync()
  await a.sync()
  expect(
    sameSnapshot(await first.readSnapshot(), await second.readSnapshot()),
  ).toBe(true)
  expect((await first.readSnapshot()).library.albumRatings).toEqual([])
  expect((await first.readSnapshot()).catalog.albums[0]!.title).toBe(
    'Un Nombre Nuevo',
  )
})

test('un reintento tras perder la respuesta no duplica escrituras y sobrevive al reinicio', async () => {
  const local = await device('first', true),
    remote = new Remote()
  const save = remote.save.bind(remote)
  remote.save.mockImplementationOnce(async (pending) => {
    await save(pending)
    throw new Error('Offline after commit')
  })
  const engine = new LibrarySync(local, remote)
  await engine.sync()
  expect(engine.getSnapshot().phase).toBe('error')
  expect((await local.readSyncFrame()).checkpoint.pending).toBeDefined()
  expect(remote.value?.revision).toBe(1)
  await new LibrarySync(local, remote).sync()
  expect(remote.value?.revision).toBe(1)
  expect((await local.readSyncFrame()).checkpoint.pending).toBeUndefined()
})

test('un conflicto conserva datos hasta la elección y guarda ambas copias antes de reemplazar', async () => {
  const first = await device('first', true),
    second = await device('second'),
    remote = new Remote()
  const a = new LibrarySync(first, remote),
    b = new LibrarySync(second, remote)
  await a.sync()
  await b.sync()
  await title(first, 'Cambio Primero')
  await title(second, 'Cambio Segundo')
  await a.sync()
  await b.sync()
  expect(b.getSnapshot().phase).toBe('conflict')
  expect((await second.readSnapshot()).catalog.albums[0]!.title).toBe(
    'Cambio Segundo',
  )
  await b.resolve('remote')
  const result = await second.readSyncFrame()
  expect(result.snapshot.catalog.albums[0]!.title).toBe('Cambio Primero')
  expect(result.checkpoint.recovery?.local.catalog.albums[0]!.title).toBe(
    'Cambio Segundo',
  )
  expect(result.checkpoint.recovery?.remote.catalog.albums[0]!.title).toBe(
    'Cambio Primero',
  )
})

test('elegir la copia local respeta CAS si un tercer dispositivo se adelanta', async () => {
  const first = await device('first', true),
    second = await device('second'),
    remote = new Remote()
  const a = new LibrarySync(first, remote),
    b = new LibrarySync(second, remote)
  await a.sync()
  await b.sync()
  await title(first, 'Primero')
  await title(second, 'Segundo')
  await a.sync()
  await b.sync()
  await title(first, 'Tercero')
  await a.sync()
  await b.resolve('local')
  expect(b.getSnapshot().phase).toBe('conflict')
  expect(remote.value?.snapshot.catalog.albums[0]!.title).toBe('Tercero')
  expect((await second.readSnapshot()).catalog.albums[0]!.title).toBe('Segundo')
})

test('una escritura local durante la petición se conserva y se envía después', async () => {
  const local = await device('first', true),
    remote = new Remote()
  const save = remote.save.bind(remote)
  remote.save.mockImplementationOnce(async (pending) => {
    await title(local, 'Cambio Durante El Envío')
    return save(pending)
  })
  const engine = new LibrarySync(local, remote)
  await engine.sync()
  await engine.sync()
  expect(remote.value?.snapshot.catalog.albums[0]!.title).toBe(
    'Cambio Durante El Envío',
  )
})

test('otra transacción invalida la sustitución local y no pisa sus cambios', async () => {
  const local = await device('first', true),
    frame = await local.readSyncFrame()
  await title(local, 'Edición Concurrente')
  await expect(
    local.applySyncFrame(frame, frame.snapshot, frame.checkpoint),
  ).rejects.toThrow('cambió')
  expect((await local.readSnapshot()).catalog.albums[0]!.title).toBe(
    'Edición Concurrente',
  )
})

test('la cuota al guardar el checkpoint revierte también el documento y la identidad', async () => {
  const local = await device('first', true),
    before = await local.readSyncFrame()
  const next = structuredClone(before.snapshot)
  next.catalog.albums[0]!.title = 'Cambio Remoto'
  vi.spyOn(databases[0]!.syncCheckpoint, 'put').mockRejectedValueOnce(
    new DOMException('Fictitious checkpoint quota', 'QuotaExceededError'),
  )
  await expect(
    local.applySyncFrame(before, next, {
      key: 'cloud',
      revision: 1,
      base: next,
    }),
  ).rejects.toThrow()
  expect(await local.readSyncFrame()).toEqual(before)
})

test('no cambia la vista mientras hay un borrador o después de cerrar la sesión', async () => {
  const local = await device('first'),
    remote = new Remote()
  remote.value = { revision: 1, snapshot: makeBackup().data }
  const engine = new LibrarySync(
    local,
    remote,
    () => {},
    () => false,
  )
  await engine.sync()
  expect((await local.readSnapshot()).catalog.albums).toEqual([])
  engine.stop()
  await engine.sync()
  expect(remote.load).toHaveBeenCalledTimes(1)
})

test('el orden de las tablas no produce cambios espurios ni conflictos', () => {
  const base = makeBackup().data,
    reordered = structuredClone(base)
  reordered.catalog.albums.reverse()
  reordered.catalog.artists.reverse()
  expect(sameSnapshot(base, reordered)).toBe(true)
  expect(sameSnapshot(base, mergeSnapshots(base, reordered, base))).toBe(true)
})

test('los campos opcionales undefined son equivalentes a su omisión en JSON', () => {
  expect(canonical({ title: 'Ejemplo', optional: undefined })).toBe(
    canonical({ title: 'Ejemplo' }),
  )
  expect(
    sameSnapshot(
      makeBackup().data,
      JSON.parse(JSON.stringify(makeBackup().data)) as ReturnType<
        typeof makeBackup
      >['data'],
    ),
  ).toBe(true)
})

test('rechaza identidades distintas y combinaciones que rompen relaciones', () => {
  const base = makeBackup().data,
    other = structuredClone(base)
  other.identity.userId = fixtureId(555)
  expect(() => mergeSnapshots(base, base, other)).toThrow(SyncConflict)
  other.identity = base.identity
  other.catalog.albums = []
  expect(() => mergeSnapshots(base, base, other)).toThrow(SyncConflict)
})
