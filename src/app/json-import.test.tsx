import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId, ids } from '../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { JsonImportPanel } from '../ui/library/JsonImportPanel'
import * as downloads from '../infrastructure/browser/backup-download'
import { openLibraryOptions } from '../test/library-navigation'
import { App } from './App'
import { parseImportText } from '../domain/catalog-import'

let factory: IDBFactory, databases: AuditoriumDatabase[]
beforeEach(() => {
  factory = new IDBFactory()
  databases = []
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases) db.close()
  await databases[0]?.delete()
})
async function repository() {
  const database = new AuditoriumDatabase('import-ui', {
    indexedDB: factory,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  await repository.mutate(() => ({
    snapshot: makeBackup().data,
    result: undefined,
  }))
  return repository
}
function catalog() {
  return {
    format: 'auditorium-catalog',
    schemaVersion: 1,
    artists: [{ id: ids.artist, name: 'Umbral Eléctrico' }],
    albums: [
      {
        id: fixtureId(1500),
        title: 'nuevo horizonte',
        artistIds: [ids.artist],
        primaryType: 'full_length',
        categories: [],
        publicationStatus: 'published',
      },
    ],
  }
}
function upload(input: unknown = catalog()) {
  const text = typeof input === 'string' ? input : JSON.stringify(input),
    value = new File([text], 'catalogo-ficticio.json', {
      type: 'application/json',
    })
  Object.defineProperty(value, 'text', { value: () => Promise.resolve(text) })
  fireEvent.change(screen.getByLabelText('Seleccionar JSON para incorporar'), {
    target: { files: [value] },
  })
}
async function setup() {
  const repo = await repository(),
    busy = vi.fn(),
    onImported = vi.fn(),
    onCommitted = vi.fn(() => repo.readSnapshot()),
    review = vi.fn()
  render(
    <JsonImportPanel
      repository={repo}
      blocked={false}
      onBusyChange={busy}
      onReviewChange={review}
      onCommitted={onCommitted}
      onImported={onImported}
    />,
  )
  return { repo, busy, onImported, onCommitted, review }
}

test('cancelar con Escape no escribe y devuelve foco al selector', async () => {
  const { repo, review } = await setup(),
    before = await repo.readSnapshot(),
    mutation = vi.spyOn(repo, 'mutate')
  upload()
  const dialog = await screen.findByRole('dialog')
  expect(
    screen.getByRole('button', { name: 'Cancelar importación' }),
  ).toHaveFocus()
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(
    screen.getByLabelText('Seleccionar JSON para incorporar'),
  ).toHaveFocus()
  expect(mutation).not.toHaveBeenCalled()
  expect(review).toHaveBeenLastCalledWith(false)
  expect(await repo.readSnapshot()).toEqual(before)
})

test('conflicto exige elección y confirmar conserva o cambia la nota según decisión', async () => {
  const { repo, onImported } = await setup(),
    backup = makeBackup()
  backup.data.library.albumRatings[0]!.scoreUnits = 2
  upload(backup)
  await screen.findByRole('dialog')
  expect(
    screen.getByRole('button', { name: 'Confirmar importación' }),
  ).toBeDisabled()
  expect(screen.getByText('Nota: 9,5 / 10')).toBeInTheDocument()
  expect(screen.getByText('Nota: 1 / 10')).toBeInTheDocument()
  fireEvent.change(
    screen.getByRole('combobox', { name: /Decisión: Nota general/ }),
    { target: { value: 'incoming' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }))
  await waitFor(() => expect(onImported).toHaveBeenCalledOnce())
  expect((await repo.readSnapshot()).library.albumRatings[0]?.scoreUnits).toBe(
    2,
  )
})

test('doble confirmación y fallo de lectura reintentan sólo lectura sin repetir importación', async () => {
  const { repo, onCommitted, onImported, busy } = await setup()
  onCommitted.mockRejectedValueOnce(new Error('Lectura ficticia'))
  const mutation = vi.spyOn(repo, 'mutate')
  upload()
  await screen.findByRole('dialog')
  const confirm = screen.getByRole('button', { name: 'Confirmar importación' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  await screen.findByRole('button', {
    name: 'Reintentar lectura tras importación',
  })
  expect(mutation).toHaveBeenCalledOnce()
  expect(onImported).not.toHaveBeenCalled()
  expect(busy).toHaveBeenLastCalledWith(true)
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar lectura tras importación' }),
  )
  await waitFor(() => expect(onImported).toHaveBeenCalledOnce())
  expect(onCommitted).toHaveBeenCalledTimes(2)
  expect(mutation).toHaveBeenCalledOnce()
  expect((await repo.readSnapshot()).catalog.albums).toHaveLength(3)
})

test('JSON inválido muestra error sin vista previa y permite volver a elegir', async () => {
  const { repo } = await setup(),
    before = await repo.readSnapshot()
  upload('{')
  expect(await screen.findByRole('alert')).toHaveTextContent('JSON válido')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await repo.readSnapshot()).toEqual(before)
  upload()
  expect(await screen.findByRole('dialog')).toHaveTextContent(
    'Revisar importación',
  )
})

test('descarga plantilla separada sin datos personales ni escritura', async () => {
  const { repo } = await setup(),
    download = vi
      .spyOn(downloads, 'downloadCatalog')
      .mockImplementation(() => undefined),
    before = await repo.readSnapshot()
  fireEvent.click(
    screen.getByRole('button', { name: 'Descargar plantilla de catálogo' }),
  )
  await waitFor(() => expect(download).toHaveBeenCalledOnce())
  const text = download.mock.calls[0]![0]
  expect(parseImportText(text).format).toBe('auditorium-catalog')
  expect(text).not.toContain('scoreUnits')
  expect(text).not.toContain('userId')
  expect(await repo.readSnapshot()).toEqual(before)
})

test('revisión distingue cada género y aplica decisiones independientes del mismo álbum', async () => {
  const { repo, onImported } = await setup(),
    backup = makeBackup()
  backup.data.catalog.albums[0]!.genres = ['Death Metal', 'Power Metal']
  backup.data.library.albumGenreRatings = [
    {
      userAlbumId: libraryIds.entry,
      genreKey: 'death metal',
      scoreUnits: 18,
      updatedAt: times.updated,
    },
    {
      userAlbumId: libraryIds.entry,
      genreKey: 'power metal',
      scoreUnits: 6,
      updatedAt: times.updated,
    },
  ]
  await repo.mutate(() => ({ snapshot: backup.data, result: undefined }))
  const incoming = structuredClone(backup)
  incoming.data.library.albumGenreRatings[0]!.scoreUnits = 20
  incoming.data.library.albumGenreRatings[1]!.scoreUnits = 10
  upload(incoming)
  await screen.findByRole('dialog')
  fireEvent.change(
    screen.getByRole('combobox', {
      name: 'Decisión: Nota por género: Eclipse · Death Metal',
    }),
    { target: { value: 'incoming' } },
  )
  fireEvent.change(
    screen.getByRole('combobox', {
      name: 'Decisión: Nota por género: Eclipse · Power Metal',
    }),
    { target: { value: 'current' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }))
  await waitFor(() => expect(onImported).toHaveBeenCalledOnce())
  const after = await repo.readSnapshot()
  expect(
    after.library.albumGenreRatings.find(
      (row) => row.genreKey === 'death metal',
    )?.scoreUnits,
  ).toBe(20)
  expect(
    after.library.albumGenreRatings.find(
      (row) => row.genreKey === 'power metal',
    )?.scoreUnits,
  ).toBe(6)
})

test('pantalla integrada bloquea operaciones incompatibles y regresa a biblioteca con aviso correcto', async () => {
  const repo = await repository()
  render(<App repository={repo} />)
  await screen.findByRole('heading', { name: 'Tu biblioteca' })
  openLibraryOptions()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Respaldos' })).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Respaldos' }))
  await screen.findByRole('heading', { name: 'Respaldos de tu biblioteca' })
  upload()
  await screen.findByRole('dialog')
  expect(
    screen.getByRole('button', { name: 'Descargar respaldo JSON sin audio' }),
  ).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }))
  await screen.findByText(
    'Datos incorporados a tu biblioteca. La identidad local se conserva.',
  )
  expect(
    screen.getByRole('button', { name: 'Nuevo Horizonte' }),
  ).toBeInTheDocument()
})
