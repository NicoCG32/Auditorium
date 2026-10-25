// @vitest-environment node
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  AudioError,
  audioScope,
  MAX_AUDIO_ARCHIVE_BYTES,
  MAX_AUDIO_FILE_BYTES,
} from '../domain/audio'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import {
  createStoredZip,
  readStoredZip,
  type StoredZipEntry,
} from '../infrastructure/browser/stored-zip'
import { syntheticAudio } from '../test/audio.fixture'
import { LocalAudio } from './local-audio'
import { CompleteAudioBackups } from './complete-audio-backups'

let factory: IDBFactory, databases: AuditoriumDatabase[]
beforeEach(() => {
  factory = new IDBFactory()
  databases = []
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases) db.close()
  for (const db of new Map(databases.map((db) => [db.name, db])).values())
    await db.delete()
})
function connect(name: string, user = fixtureId(70000)) {
  const database = new AuditoriumDatabase(name, {
    indexedDB: factory,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => user,
    now: () => new Date(times.added),
  })
  return {
    database,
    repository,
    service: new CompleteAudioBackups(repository, () => new Date(times.later)),
  }
}
async function source() {
  const result = connect('source', libraryIds.user),
    snapshot = makeBackup().data
  await result.repository.mutate(() => ({ snapshot, result: undefined }))
  await new LocalAudio(result.repository).save(libraryIds.entry, {
    scope: audioScope(snapshot.identity),
    base: [],
    items: [await syntheticAudio()],
  })
  return { ...result, snapshot }
}
function file(bytes: Uint8Array) {
  return {
    size: bytes.byteLength,
    arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
  }
}
function headers(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    end = bytes.length - 22
  let cursor = view.getUint32(end + 16, true)
  const result: {
    central: number
    local: number
    length: number
    name: string
  }[] = []
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    const length = view.getUint16(cursor + 28, true)
    result.push({
      central: cursor,
      local: view.getUint32(cursor + 42, true),
      length,
      name: new TextDecoder().decode(
        bytes.subarray(cursor + 46, cursor + 46 + length),
      ),
    })
    cursor += 46 + length
  }
  return result
}
test('complete ZIP round trip adopts library identity, exact bytes and associations atomically without retaining a whole archive backing buffer', async () => {
  const origin = await source(),
    destination = connect('target'),
    identity = await destination.repository.open()
  const exported = await origin.service.export(),
    prepared = await destination.service.readFile(file(exported.bytes))
  expect(prepared.state.files).toHaveLength(1)
  expect(prepared.state.files[0]!.bytes.buffer.byteLength).toBeGreaterThan(
    prepared.state.files[0]!.bytes.byteLength,
  )
  await destination.service.restore(prepared, identity)
  expect(await destination.repository.readSnapshot()).toEqual(origin.snapshot)
  const [record] = await destination.database.audioFiles.toArray()
  expect(record!.bytes).toEqual((await syntheticAudio()).bytes)
  expect(record!.bytes.buffer.byteLength).toBe(record!.bytes.byteLength)
  destination.repository.close()
  const reopened = connect('target')
  expect((await reopened.service.export()).bytes).toEqual(exported.bytes)
  await expect(
    reopened.service.restore(prepared, origin.snapshot.identity),
  ).rejects.toMatchObject({ code: 'not_empty' })
})
test('quota after writing bytes rolls back library, identity and both audio stores; a retry performs one complete restore', async () => {
  const origin = await source(),
    destination = connect('target'),
    before = await destination.repository.readSnapshot()
  const prepared = await destination.service.readFile(
    file((await origin.service.export()).bytes),
  )
  vi.spyOn(
    destination.database.audioAttachments,
    'bulkAdd',
  ).mockRejectedValueOnce(
    new DOMException('Quota injection', 'QuotaExceededError'),
  )
  await expect(
    destination.service.restore(prepared, before.identity),
  ).rejects.toMatchObject({ code: 'quota_exceeded' })
  expect(await destination.repository.readSnapshot()).toEqual(before)
  expect(await destination.database.audioFiles.count()).toBe(0)
  expect(await destination.database.audioAttachments.count()).toBe(0)
  await destination.service.restore(prepared, before.identity)
  expect(await destination.database.audioFiles.count()).toBe(1)
})
test('cancellation while the transaction is writing restores the original empty destination and identity', async () => {
  const origin = await source(),
    destination = connect('cancelled'),
    before = await destination.repository.readSnapshot()
  const prepared = await destination.service.readFile(
      file((await origin.service.export()).bytes),
    ),
    controller = new AbortController()
  const stop = () => {
    controller.abort()
  }
  destination.database.audioFiles.hook('creating', stop)
  await expect(
    destination.service.restore(prepared, before.identity, controller.signal),
  ).rejects.toMatchObject({ code: 'aborted' })
  destination.database.audioFiles.hook('creating').unsubscribe(stop)
  expect(await destination.repository.readSnapshot()).toEqual(before)
  expect(await destination.database.audioFiles.count()).toBe(0)
})
test.each([
  'compression',
  'encryption',
  'symlink',
  'directory-gap',
  'local-header',
  'trailing',
  'path',
  'crc',
])(
  'strict ZIP rejects %s without opening or modifying a destination',
  async (damage) => {
    const origin = await source(),
      destination = connect('target'),
      before = await destination.repository.readSnapshot()
    const bytes = new Uint8Array((await origin.service.export()).bytes),
      view = new DataView(bytes.buffer),
      [first] = headers(bytes)
    let candidate = bytes
    if (damage === 'compression') {
      view.setUint16(first!.central + 10, 8, true)
      view.setUint16(first!.local + 8, 8, true)
    }
    if (damage === 'encryption') {
      view.setUint16(first!.central + 8, 0x0801, true)
      view.setUint16(first!.local + 6, 0x0801, true)
    }
    if (damage === 'symlink')
      view.setUint32(first!.central + 38, 0xa0000000, true)
    if (damage === 'directory-gap') view.setUint32(first!.central + 42, 1, true)
    if (damage === 'local-header') view.setUint32(first!.local + 22, 1, true)
    if (damage === 'trailing') {
      candidate = new Uint8Array(bytes.length + 1)
      candidate.set(bytes)
    }
    if (damage === 'path') {
      const entry = headers(bytes).find((row) => row.name === 'library.json')!,
        name = new TextEncoder().encode('../evil.json')
      expect(name.length).toBe(entry.length)
      bytes.set(name, entry.central + 46)
      bytes.set(name, entry.local + 30)
    }
    if (damage === 'crc') {
      const offset = first!.local + 30 + first!.length
      bytes[offset] = bytes[offset]! ^ 1
    }
    await expect(
      destination.service.readFile(file(candidate)),
    ).rejects.toBeInstanceOf(AudioError)
    expect(await destination.repository.readSnapshot()).toEqual(before)
  },
)
test('correct ZIP CRCs do not bypass SHA or relationship/budget validation in the manifest', async () => {
  const origin = await source(),
    destination = connect('target'),
    original = await readStoredZip((await origin.service.export()).bytes)
  const encoder = new TextEncoder(),
    originalManifest = JSON.parse(
      new TextDecoder().decode(original.get('audio-manifest.json')),
    ) as { attachments: Record<string, unknown>[] }
  for (const damage of ['sha', 'reference', 'budget'] as const) {
    const manifest = structuredClone(originalManifest),
      entries: StoredZipEntry[] = [...original].map(([name, data]) => ({
        name,
        data: new Uint8Array(data),
      }))
    if (damage === 'sha') {
      const entry = entries.find((row) => row.name.startsWith('audio/'))!
      entry.data[80] = entry.data[80]! ^ 1
    }
    if (damage === 'reference')
      manifest.attachments[0]!.userAlbumId = fixtureId(999999)
    if (damage === 'budget') {
      const sample = manifest.attachments[0]!,
        data = entries.find((row) => row.name.startsWith('audio/'))!.data
      for (let i = 1; i < 9; i++) {
        const id = fixtureId(80000 + i),
          path = `audio/${id}.bin`
        manifest.attachments.push({ ...sample, id, path })
        entries.push({ name: path, data })
      }
      manifest.attachments.forEach((row) => {
        row.size = MAX_AUDIO_FILE_BYTES
      })
    }
    entries.find((row) => row.name === 'audio-manifest.json')!.data =
      encoder.encode(JSON.stringify(manifest))
    const bytes = await createStoredZip(entries)
    await expect(
      destination.service.readFile(file(bytes)),
    ).rejects.toMatchObject({
      code:
        damage === 'sha'
          ? 'integrity'
          : damage === 'reference'
            ? 'reference'
            : 'limit',
    })
    expect(
      (await destination.repository.readSnapshot()).library.userAlbums,
    ).toEqual([])
  }
})
test('missing audio prevents a complete export; oversized and cancelled inputs are rejected before reading their bytes', async () => {
  const origin = await source(),
    row = (await origin.repository.readAudioAttachments())[0]!
  await origin.database.audioFiles.delete([row.scope, row.id])
  await expect(origin.service.export()).rejects.toMatchObject({
    code: 'integrity',
  })
  const read = vi.fn(() => Promise.resolve(new ArrayBuffer(0)))
  await expect(
    origin.service.readFile({
      size: MAX_AUDIO_ARCHIVE_BYTES + 1,
      arrayBuffer: read,
    }),
  ).rejects.toMatchObject({ code: 'limit' })
  const controller = new AbortController()
  controller.abort()
  await expect(
    origin.service.readFile({ size: 10, arrayBuffer: read }, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(read).not.toHaveBeenCalled()
})

test.each(['metadata', 'binary'] as const)(
  'an empty musical destination with orphan %s is not overwritten',
  async (kind) => {
    const origin = await source(),
      destination = connect('orphan-destination'),
      empty = await destination.repository.readSnapshot()
    const prepared = await destination.service.readFile(
      file((await origin.service.export()).bytes),
    )
    const attachment = {
      ...prepared.state.files[0]!.attachment,
      scope: audioScope(empty.identity),
    }
    if (kind === 'metadata')
      await destination.database.audioAttachments.put(attachment)
    else
      await destination.database.audioFiles.put({
        scope: attachment.scope,
        id: attachment.id,
        bytes: new Uint8Array([1]),
      })
    await expect(
      destination.service.restore(prepared, empty.identity),
    ).rejects.toMatchObject({ code: 'not_empty' })
    expect(await destination.repository.readSnapshot()).toEqual(empty)
    expect(await destination.database.audioAttachments.count()).toBe(
      kind === 'metadata' ? 1 : 0,
    )
    expect(await destination.database.audioFiles.count()).toBe(
      kind === 'binary' ? 1 : 0,
    )
  },
)

test('a valid musical JSON with changed content fails the manifest hash even with correct ZIP CRCs', async () => {
  const origin = await source(),
    destination = connect('tampered-library')
  const entries = [
    ...(await readStoredZip((await origin.service.export()).bytes)),
  ].map(([name, data]) => ({ name, data: new Uint8Array(data) }))
  const changed = makeBackup()
  changed.data.catalog.albums[0]!.title = 'Otro Título Ficticio'
  entries.find((entry) => entry.name === 'library.json')!.data =
    new TextEncoder().encode(JSON.stringify(changed))
  const repacked = await createStoredZip(entries)
  await expect(
    destination.service.readFile(file(repacked)),
  ).rejects.toMatchObject({ code: 'integrity' })
  expect(
    (await destination.repository.readSnapshot()).library.userAlbums,
  ).toEqual([])
})
