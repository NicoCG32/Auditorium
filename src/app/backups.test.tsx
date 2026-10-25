import { openLibraryOptions } from '../test/library-navigation'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { makeBackup } from '../domain/backup.fixture'
import {
  MAX_BACKUP_BYTES,
  parseBackupText,
  serializeBackup,
} from '../domain/backup'
import { fixtureId } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import { LibraryBackups } from '../application/library-backups'
import { MusicLibrary } from '../application/music-library'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { LocalStorageError } from '../infrastructure/db/errors'
import * as downloads from '../infrastructure/browser/backup-download'
import { App } from './App'

let indexedDB: IDBFactory, databases: AuditoriumDatabase[]
beforeEach(() => {
  indexedDB = new IDBFactory()
  databases = []
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases) db.close()
  await databases[0]?.delete()
})
async function setup(populated = false) {
  const database = new AuditoriumDatabase('backup-ui', {
    indexedDB,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => (populated ? libraryIds.user : fixtureId(901)),
    now: () => new Date(times.added),
  })
  if (populated)
    await repository.mutate(() => ({
      snapshot: makeBackup().data,
      result: undefined,
    }))
  return repository
}
async function open(repository: IndexedDbRepository) {
  render(<App repository={repository} />)
  openLibraryOptions()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Respaldos' })).toBeEnabled(),
  )
  openLibraryOptions()
  fireEvent.click(screen.getByRole('button', { name: 'Respaldos' }))
}
function file(text = serializeBackup(makeBackup()), size?: number) {
  const value = new File([text], 'biblioteca-ficticia.json', {
    type: 'application/json',
  })
  // jsdom no implementa Blob.text; simular la lectura nativa del archivo.
  Object.defineProperty(value, 'text', {
    value: vi.fn(() => Promise.resolve(text)),
    configurable: true,
    writable: true,
  })
  if (size !== undefined) Object.defineProperty(value, 'size', { value: size })
  return value
}
function select(value = file()) {
  fireEvent.change(screen.getByLabelText('Seleccionar respaldo JSON'), {
    target: { files: [value] },
  })
}
async function ready() {
  await screen.findByRole('dialog')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Confirmar restauración' }),
    ).toBeEnabled(),
  )
}
async function finished() {
  openLibraryOptions()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Actualizar biblioteca' }),
    ).toBeEnabled(),
  )
}

test('exportación descarga snapshot completo y vigente sin modificar datos', async () => {
  const repository = await setup(true)
  await open(repository)
  const download = vi
    .spyOn(downloads, 'downloadBackup')
    .mockImplementation(() => undefined)
  await new MusicLibrary(repository).addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
  })
  const before = await repository.readSnapshot()
  fireEvent.click(
    screen.getByRole('button', { name: 'Descargar respaldo JSON sin audio' }),
  )
  await screen.findByText(/Descarga de respaldo iniciada/)
  expect(download).toHaveBeenCalledTimes(1)
  expect(parseBackupText(download.mock.calls[0]![0]).data).toEqual(before)
  expect(await repository.readSnapshot()).toEqual(before)
  expect(screen.getByLabelText('Seleccionar respaldo JSON')).toBeDisabled()
})
test('fallo de descarga conserva biblioteca y permite reintentar', async () => {
  const repository = await setup(true),
    before = await repository.readSnapshot()
  await open(repository)
  vi.spyOn(downloads, 'downloadBackup')
    .mockImplementationOnce(() => {
      throw new Error('Descarga ficticia fallida')
    })
    .mockImplementation(() => undefined)
  fireEvent.click(
    screen.getByRole('button', { name: 'Descargar respaldo JSON sin audio' }),
  )
  await screen.findByRole('alert')
  expect(await repository.readSnapshot()).toEqual(before)
  fireEvent.click(
    screen.getByRole('button', { name: 'Descargar respaldo JSON sin audio' }),
  )
  await screen.findByText(/Descarga de respaldo iniciada/)
})
test.each(['cancel', 'escape'])(
  'previsualización explica identidad/datos y %s conserva destino sin escribir, con retorno de foco',
  async (action) => {
    const repository = await setup(),
      before = await repository.readSnapshot()
    await open(repository)
    select()
    await ready()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('1 álbum activo y 1 álbum retirado')
    expect(dialog).toHaveTextContent('identidad local guardada en el archivo')
    expect(dialog).toHaveTextContent('no se mezclan bibliotecas')
    expect(
      screen.getByRole('button', { name: 'Cancelar restauración' }),
    ).toHaveFocus()
    if (action === 'cancel')
      fireEvent.click(
        screen.getByRole('button', { name: 'Cancelar restauración' }),
      )
    else fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Seleccionar respaldo JSON')).toHaveFocus()
    expect(await repository.readSnapshot()).toEqual(before)
  },
)
test('confirmación restaura identidad y relaciones; doble envío escribe una vez y abre la biblioteca', async () => {
  const repository = await setup()
  await open(repository)
  select()
  await ready()
  const restore = vi.spyOn(LibraryBackups.prototype, 'restore')
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar restauración' }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar restauración' }),
  )
  openLibraryOptions()
  expect(
    screen.getByRole('button', { name: 'Actualizar biblioteca' }),
  ).toBeDisabled()
  await screen.findByRole('button', { name: 'Eclipse' })
  await finished()
  expect(restore).toHaveBeenCalledTimes(1)
  const after = await repository.readSnapshot()
  expect(after.identity).toEqual(makeBackup().data.identity)
  expect(after.library.ownedItems).toEqual(makeBackup().data.library.ownedItems)
  openLibraryOptions()
  expect(
    screen.getByRole('button', { name: 'Álbumes retirados (1)' }),
  ).toBeEnabled()
})
test.each(['invalid_json', 'invalid_version', 'too_large'])(
  'archivo %s no habilita confirmación ni modifica destino',
  async (kind) => {
    const repository = await setup(),
      before = await repository.readSnapshot()
    await open(repository)
    select(
      kind === 'invalid_json'
        ? file('{')
        : kind === 'invalid_version'
          ? file(JSON.stringify({ ...makeBackup(), schemaVersion: 9 }))
          : file('x', MAX_BACKUP_BYTES + 1),
    )
    await screen.findByRole('alert')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await repository.readSnapshot()).toEqual(before)
  },
)
test('fallo de lectura del archivo conserva destino; nuevo archivo puede validarse', async () => {
  const repository = await setup(),
    before = await repository.readSnapshot()
  await open(repository)
  const bad = file()
  vi.spyOn(bad, 'text').mockRejectedValueOnce(
    new Error('Lectura ficticia fallida'),
  )
  select(bad)
  await screen.findByRole('alert')
  expect(await repository.readSnapshot()).toEqual(before)
  select(file())
  await ready()
})
test('cuota revierte adopción de identidad y conserva confirmación para reintentar', async () => {
  const repository = await setup(),
    before = await repository.readSnapshot()
  await open(repository)
  select()
  await ready()
  vi.spyOn(databases[0]!.ownedItems, 'bulkPut').mockRejectedValueOnce(
    new DOMException('Quota ficticia', 'QuotaExceededError'),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar restauración' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(await repository.readSnapshot()).toEqual(before)
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar restauración' }),
  )
  await screen.findByRole('button', { name: 'Eclipse' })
})
test('lectura fallida después del commit muestra recibo con identidad adoptada; reintento no restaura otra vez', async () => {
  const repository = await setup()
  await open(repository)
  select()
  await ready()
  const restore = vi.spyOn(LibraryBackups.prototype, 'restore')
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Lectura ficticia fallida'),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar restauración' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'restauración se confirmó',
  )
  expect(
    screen.getByRole('button', { name: 'Volver a biblioteca' }),
  ).toBeDisabled()
  openLibraryOptions()
  expect(screen.getByRole('button', { name: 'Respaldos' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Descargar respaldo JSON sin audio' }),
  ).toBeDisabled()
  const retry = screen.getByRole('button', {
    name: 'Reintentar lectura tras restauración',
  })
  await waitFor(() => expect(retry).toHaveFocus())
  fireEvent.click(retry)
  await screen.findByRole('button', { name: 'Eclipse' })
  expect(restore).toHaveBeenCalledTimes(1)
})
test('destino que dejó de estar vacío después de validar bloquea restauración sin pérdida', async () => {
  const repository = await setup()
  await open(repository)
  select()
  await ready()
  await new MusicLibrary(repository).createAlbum({
    title: 'Álbum ficticio nuevo',
    artists: [{ name: 'Artista ficticio' }],
  })
  const before = await repository.readSnapshot()
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar restauración' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('contiene datos')
  expect(await repository.readSnapshot()).toEqual(before)
})
test('biblioteca con solo retirados o solo catálogo tampoco admite importación', async () => {
  const repository = await setup(true)
  await repository.mutate((snapshot) => {
    for (const entry of snapshot.library.userAlbums) {
      entry.deletedAt = times.later
      entry.updatedAt = times.later
    }
    return { snapshot, result: undefined }
  })
  await open(repository)
  expect(screen.getByLabelText('Seleccionar respaldo JSON')).toBeDisabled()
  expect(screen.getByText(/Esta biblioteca contiene datos/)).toBeVisible()
})
test('respaldo válido sin filas restaura solo identidad y deja accesible el estado vacío', async () => {
  const repository = await setup(),
    backup = makeBackup()
  for (const rows of Object.values(backup.data.catalog)) rows.splice(0)
  for (const rows of Object.values(backup.data.library)) rows.splice(0)
  await open(repository)
  select(file(serializeBackup(backup)))
  await ready()
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar restauración' }),
  )
  await screen.findByRole('heading', { name: 'Aún no hay álbumes' })
  expect((await repository.readSnapshot()).identity).toEqual(
    backup.data.identity,
  )
})
