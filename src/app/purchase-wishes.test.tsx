import { openAlbumArea, openExperience } from '../test/library-navigation'
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  makeContext,
  makeLibrary,
  libraryIds,
  times,
} from '../domain/library/library.fixture'
import { ids } from '../domain/catalog/catalog.fixture'
import { createLibrarySchema } from '../domain/library/library'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { LocalStorageError } from '../infrastructure/db/errors'
import { MusicLibrary } from '../application/music-library'
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
async function setup() {
  const database = new AuditoriumDatabase('wishes-ui', {
    indexedDB,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  const context = makeContext()
  await repository.mutate((snapshot) => ({
    snapshot: {
      ...snapshot,
      catalog: context.catalog,
      library: createLibrarySchema(context).parse(makeLibrary()),
    },
    result: undefined,
  }))
  return { repository, service: new MusicLibrary(repository) }
}
async function open(repository: IndexedDbRepository) {
  render(<App repository={repository} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Eclipse' }))
  openAlbumArea('collection')
  openAlbumArea('actions')
  openExperience()
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
function begin() {
  fireEvent.click(screen.getByRole('button', { name: 'Registrar deseo' }))
}
async function finished() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Registrar deseo' }),
    ).toBeEnabled(),
  )
}
function cards() {
  return within(
    screen.getByRole('list', { name: 'Deseos de este álbum' }),
  ).getAllByRole('listitem')
}

test('CD poseído y deseo vinilo coexisten; edición exacta filtra y conserva notas al guardar/editar', async () => {
  const { repository, service } = await setup()
  await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
    releaseId: ids.original,
  })
  const before = await repository.readSnapshot()
  await open(repository)
  begin()
  expect(screen.getByLabelText('Formato deseado')).toHaveFocus()
  expect(
    within(screen.getByLabelText('Edición deseada')).getAllByRole('option'),
  ).toHaveLength(2)
  expect(
    within(screen.getByLabelText('Edición deseada')).queryByRole('option', {
      name: /Original/,
    }),
  ).not.toBeInTheDocument()
  change('Notas del deseo', '  Deseo ficticio.\nOtra línea.  ')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar deseo' }))
  await finished()
  expect(cards()).toHaveLength(1)
  expect(
    screen.queryByRole('button', { name: /^Marcar cumplido/ }),
  ).not.toBeInTheDocument()
  const stored = await repository.readSnapshot()
  expect(stored.library.ownedItems).toEqual(before.library.ownedItems)
  expect(stored.library.purchaseWishes[0]?.notes).toBe(
    '  Deseo ficticio.\nOtra línea.  ',
  )
  fireEvent.click(screen.getByRole('button', { name: /^Editar Deseo/ }))
  change('Formato deseado', '')
  expect(screen.getByLabelText('Edición deseada')).toBeRequired()
  change('Edición deseada', ids.deluxe)
  change('Notas del deseo', '  ')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar deseo' }))
  await finished()
  expect(
    (await repository.readSnapshot()).library.purchaseWishes[0],
  ).toMatchObject({ targetReleaseId: ids.deluxe })
  expect(
    (await repository.readSnapshot()).library.purchaseWishes[0],
  ).not.toHaveProperty('targetFormat')
  expect(
    (await repository.readSnapshot()).library.purchaseWishes[0],
  ).not.toHaveProperty('notes')
})
test('compra coincidente ofrece cumplir; cancelar y reactivar conservan historial; cumplir cambia solo uno', async () => {
  const { repository, service } = await setup()
  await service.addPurchaseWish(libraryIds.entry, { targetFormat: 'cd' })
  await service.addPurchaseWish(libraryIds.entry, {
    targetReleaseId: ids.original,
  })
  const before = await repository.readSnapshot()
  await open(repository)
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ejemplar' }))
  change('Edición del ejemplar', ids.original)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar ejemplar' }))
  await finished()
  expect((await repository.readSnapshot()).library.purchaseWishes).toEqual(
    before.library.purchaseWishes,
  )
  expect(screen.getAllByText(/Tienes una compra coincidente/)).toHaveLength(2)
  const first = cards()[0]!
  fireEvent.click(
    within(first).getByRole('button', { name: /^Cancelar Deseo/ }),
  )
  await finished()
  expect(within(first).getByText('Cancelado')).toBeVisible()
  expect(
    within(first).queryByRole('button', { name: /^Marcar cumplido/ }),
  ).not.toBeInTheDocument()
  fireEvent.click(
    within(first).getByRole('button', { name: /^Reactivar Deseo/ }),
  )
  await finished()
  fireEvent.click(
    within(first).getByRole('button', { name: /^Marcar cumplido/ }),
  )
  await finished()
  expect(within(first).getByText('Cumplido')).toBeVisible()
  expect(
    (await repository.readSnapshot()).library.purchaseWishes.filter(
      (row) => row.status === 'active',
    ),
  ).toHaveLength(1)
})
test('Escape y cancelar formulario no escriben y devuelven foco', async () => {
  const { repository } = await setup()
  await open(repository)
  for (const action of ['escape', 'button']) {
    begin()
    change('Notas del deseo', 'Borrador ficticio')
    if (action === 'escape')
      fireEvent.keyDown(screen.getByLabelText('Notas del deseo'), {
        key: 'Escape',
      })
    else
      fireEvent.click(
        screen.getByRole('button', { name: 'Cancelar formulario de deseo' }),
      )
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
    expect(
      screen.getByRole('button', { name: 'Registrar deseo' }),
    ).toHaveFocus()
  }
  expect((await repository.readSnapshot()).library.purchaseWishes).toEqual([])
})
test('cuota conserva borrador; reintento y doble envío registran una vez con bloqueo compartido', async () => {
  const { repository } = await setup()
  await open(repository)
  begin()
  change('Notas del deseo', 'Borrador ficticio protegido')
  const before = await repository.readSnapshot(),
    failure = vi
      .spyOn(databases[0]!.purchaseWishes, 'bulkPut')
      .mockRejectedValueOnce(
        new DOMException('Quota ficticia', 'QuotaExceededError'),
      )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar deseo' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
  expect(screen.getByLabelText('Notas del deseo')).toHaveValue(
    'Borrador ficticio protegido',
  )
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  const add = vi.spyOn(MusicLibrary.prototype, 'addPurchaseWish'),
    form = screen
      .getByRole('button', { name: 'Guardar deseo' })
      .closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(
    screen.getByRole('button', { name: 'Registrar ejemplar' }),
  ).toBeDisabled()
  await finished()
  expect(add).toHaveBeenCalledTimes(1)
  expect(cards()).toHaveLength(1)
})
test.each(['registrar', 'cumplir'])(
  'lectura fallida después de %s conserva recibo y reintenta solo la lectura',
  async (action) => {
    const { repository, service } = await setup()
    if (action === 'cumplir') {
      await service.addPurchaseWish(libraryIds.entry, { targetFormat: 'cd' })
      await service.addOwnedItem(libraryIds.entry, {
        medium: 'physical',
        format: 'cd',
      })
    }
    await open(repository)
    const add = vi.spyOn(MusicLibrary.prototype, 'addPurchaseWish'),
      status = vi.spyOn(MusicLibrary.prototype, 'setPurchaseWishStatus')
    if (action === 'registrar') begin()
    vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
      new LocalStorageError('unexpected', 'Lectura ficticia fallida'),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: action === 'registrar' ? 'Guardar deseo' : /^Marcar cumplido/,
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El deseo se guardó',
    )
    expect(cards()).toHaveLength(1)
    expect(
      within(cards()[0]!).getByText(
        action === 'registrar' ? 'Activo' : 'Cumplido',
      ),
    ).toBeVisible()
    for (const name of [
      'Guardar experiencia',
      'Registrar ejemplar',
      'Volver a biblioteca',
    ])
      expect(screen.getByRole('button', { name })).toBeDisabled()
    const retry = screen.getByRole('button', {
      name: 'Reintentar lectura de deseos',
    })
    await waitFor(() => expect(retry).toHaveFocus())
    fireEvent.click(retry)
    await finished()
    expect(action === 'registrar' ? add : status).toHaveBeenCalledTimes(1)
  },
)
test('cumplimiento abortado deja deseo activo y permite reintento explícito', async () => {
  const { repository, service } = await setup()
  await service.addPurchaseWish(libraryIds.entry, { targetFormat: 'cd' })
  await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
  })
  await open(repository)
  const before = await repository.readSnapshot()
  vi.spyOn(databases[0]!.purchaseWishes, 'bulkPut').mockRejectedValueOnce(
    new DOMException('Aborto ficticio', 'AbortError'),
  )
  fireEvent.click(screen.getByRole('button', { name: /^Marcar cumplido/ }))
  await screen.findByRole('alert')
  expect(await repository.readSnapshot()).toEqual(before)
  expect(screen.getByText('Activo')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /^Marcar cumplido/ }))
  await finished()
  expect(screen.getByText('Cumplido')).toBeVisible()
})
