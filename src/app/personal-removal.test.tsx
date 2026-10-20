import { openLibraryOptions } from '../test/library-navigation'
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
import { personalEntryToken } from '../domain/library/personal-entry'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { LocalStorageError } from '../infrastructure/db/errors'
import { MusicLibrary } from '../application/music-library'
import { App } from './App'

let databases: AuditoriumDatabase[], indexedDB: IDBFactory
beforeEach(() => {
  databases = []
  indexedDB = new IDBFactory()
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases) db.close()
  await databases[0]?.delete()
})
async function setup(onlyOne = false) {
  const database = new AuditoriumDatabase('personal-ui', {
    indexedDB,
    IDBKeyRange,
  })
  databases.push(database)
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  const context = makeContext(),
    library = makeLibrary()
  if (onlyOne) {
    library.userAlbums = library.userAlbums.filter(
      (row) => row.id === libraryIds.entry,
    )
    library.albumRatings = library.albumRatings.filter(
      (row) => row.userAlbumId === libraryIds.entry,
    )
    library.trackRatings = library.trackRatings.filter(
      (row) => row.userAlbumId === libraryIds.entry,
    )
  }
  await repository.mutate((snapshot) => ({
    snapshot: {
      ...snapshot,
      catalog: context.catalog,
      library: createLibrarySchema(context).parse(library),
    },
    result: undefined,
  }))
  const service = new MusicLibrary(repository)
  await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
    releaseId: ids.original,
    notes: 'Copia ficticia protegida',
  })
  await service.addPurchaseWish(libraryIds.entry, {
    targetReleaseId: ids.deluxe,
    notes: 'Deseo ficticio protegido',
  })
  return { repository, service }
}
async function open(repository: IndexedDbRepository) {
  render(<App repository={repository} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Eclipse' }))
}
function begin() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Quitar álbum de biblioteca' }),
  )
}
function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada' }))
}
function removedView() {
  fireEvent.click(screen.getByRole('button', { name: /^Álbumes retirados \(/ }))
}
async function finished() {
  openLibraryOptions()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Actualizar biblioteca' }),
    ).toBeEnabled(),
  )
}

test('confirmación explica todos los datos; conservar/Escape no escriben y devuelven foco', async () => {
  const { repository } = await setup(),
    before = await repository.readSnapshot()
  await open(repository)
  for (const action of ['button', 'escape']) {
    begin()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('1 ejemplar conservado')
    expect(dialog).toHaveTextContent('1 deseo conservado')
    expect(dialog).toHaveTextContent('notas personales: se conservan')
    expect(dialog).toHaveTextContent('Nota del álbum: se conserva')
    expect(dialog).toHaveTextContent('Álbumes retirados')
    expect(
      screen.getByRole('button', { name: 'Conservar en biblioteca' }),
    ).toHaveFocus()
    if (action === 'button')
      fireEvent.click(
        screen.getByRole('button', { name: 'Conservar en biblioteca' }),
      )
    else fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Quitar álbum de biblioteca' }),
    ).toHaveFocus()
    expect(await repository.readSnapshot()).toEqual(before)
  }
})
test.each([false, true])(
  'retirar y restaurar conserva datos e ID aunque último álbum=%s; vuelve a la ficha',
  async (onlyOne) => {
    const { repository } = await setup(onlyOne),
      before = await repository.readSnapshot()
    await open(repository)
    begin()
    confirm()
    await finished()
    expect(
      screen.queryByRole('button', { name: 'Eclipse' }),
    ).not.toBeInTheDocument()
    if (onlyOne)
      expect(
        screen.getByRole('heading', { name: 'Aún no hay álbumes' }),
      ).toBeVisible()
    else
      expect(screen.getByRole('button', { name: 'Otra órbita' })).toBeVisible()
    removedView()
    expect(
      screen.getByRole('heading', { name: 'Álbumes retirados' }),
    ).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: /^Restaurar Eclipse/ }))
    await finished()
    expect(screen.getByRole('heading', { name: 'Eclipse' })).toHaveFocus()
    expect(screen.getByLabelText('Notas personales')).toHaveValue(
      before.library.userAlbums[0]!.personalNotes,
    )
    const after = await repository.readSnapshot()
    expect(after.catalog).toEqual(before.catalog)
    expect(after.identity).toEqual(before.identity)
    expect(after.library.ownedItems).toEqual(before.library.ownedItems)
    expect(after.library.purchaseWishes).toEqual(before.library.purchaseWishes)
    expect(after.library.albumRatings).toEqual(before.library.albumRatings)
    expect(after.library.trackRatings).toEqual(before.library.trackRatings)
    expect(after.library.userAlbums[0]?.id).toBe(libraryIds.entry)
    expect(after.library.userAlbums[0]?.deletedAt).toBeUndefined()
  },
)
test('cuota conserva confirmación y datos; doble envío retira una vez y bloquea otros editores', async () => {
  const { repository } = await setup(),
    before = await repository.readSnapshot()
  await open(repository)
  begin()
  const failure = vi
    .spyOn(databases[0]!.userAlbums, 'bulkPut')
    .mockRejectedValueOnce(
      new DOMException('Quota ficticia', 'QuotaExceededError'),
    )
  confirm()
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  const remove = vi.spyOn(MusicLibrary.prototype, 'removePersonalAlbum')
  confirm()
  confirm()
  expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeDisabled()
  await finished()
  expect(remove).toHaveBeenCalledTimes(1)
  openLibraryOptions()
  expect(
    screen.getByRole('button', { name: 'Álbumes retirados (1)' }),
  ).toBeEnabled()
})
test.each(['retirar', 'restaurar'])(
  'lectura fallida después de %s muestra recibo, bloquea navegación y reintenta sin escribir',
  async (action) => {
    const { repository, service } = await setup()
    if (action === 'restaurar') {
      const snapshot = await repository.readSnapshot()
      await service.removePersonalAlbum(
        libraryIds.entry,
        personalEntryToken(snapshot.library, libraryIds.entry),
      )
      render(<App repository={repository} />)
      fireEvent.click(
        await screen.findByRole('button', { name: 'Álbumes retirados (1)' }),
      )
    } else {
      await open(repository)
      begin()
    }
    const remove = vi.spyOn(MusicLibrary.prototype, 'removePersonalAlbum'),
      restore = vi.spyOn(MusicLibrary.prototype, 'restorePersonalAlbum')
    vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
      new LocalStorageError('unexpected', 'Lectura ficticia fallida'),
    )
    if (action === 'retirar') confirm()
    else
      fireEvent.click(
        screen.getByRole('button', { name: /^Restaurar Eclipse/ }),
      )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      action === 'retirar' ? 'ya se retiró' : 'ya se restauró',
    )
    expect(
      screen.getByRole('button', { name: 'Volver a biblioteca' }),
    ).toBeDisabled()
    openLibraryOptions()
    expect(
      screen.getByRole('button', { name: 'Actualizar biblioteca' }),
    ).toBeDisabled()
    const retry = screen.getByRole('button', {
      name:
        action === 'retirar'
          ? 'Reintentar lectura tras retirar'
          : 'Reintentar lectura tras restaurar',
    })
    await waitFor(() => expect(retry).toHaveFocus())
    fireEvent.click(retry)
    await finished()
    expect(action === 'retirar' ? remove : restore).toHaveBeenCalledTimes(1)
  },
)
test('datos cambiados después de abrir la confirmación requieren releer y confirmar sus consecuencias actuales', async () => {
  const { repository, service } = await setup()
  await open(repository)
  begin()
  await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
  })
  confirm()
  await screen.findByRole('alert')
  expect(
    (await repository.readSnapshot()).library.userAlbums[0]?.deletedAt,
  ).toBeUndefined()
  fireEvent.click(
    screen.getByRole('button', { name: 'Revisar datos antes de quitar' }),
  )
  await finished()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  begin()
  expect(screen.getByRole('dialog')).toHaveTextContent(
    '2 ejemplares conservados',
  )
  confirm()
  await finished()
  expect((await repository.readSnapshot()).library.ownedItems).toHaveLength(2)
})
test('entrada activa distinta impide restaurar y permite abrirla sin fusionar datos', async () => {
  const { repository, service } = await setup(),
    before = await repository.readSnapshot()
  await service.removePersonalAlbum(
    libraryIds.entry,
    personalEntryToken(before.library, libraryIds.entry),
  )
  const active = await service.addAlbumToLibrary(ids.album)
  render(<App repository={repository} />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Álbumes retirados (1)' }),
  )
  expect(screen.getByText(/Ya hay otra entrada activa/)).toBeVisible()
  expect(
    screen.queryByRole('button', { name: /^Restaurar Eclipse/ }),
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Abrir entrada activa de Eclipse' }),
  )
  expect(screen.getByRole('heading', { name: 'Eclipse' })).toHaveFocus()
  expect(
    (await repository.readSnapshot()).library.userAlbums.find(
      (row) => row.id === active.id,
    )?.deletedAt,
  ).toBeUndefined()
  expect(screen.getByText('0 ejemplares registrados')).toBeVisible()
})
test.each(['album', 'track'])(
  'quitar nota %s exige confirmación; Conservar/Escape mantiene nota y borrador',
  async (kind) => {
    const { repository } = await setup(),
      before = await repository.readSnapshot()
    await open(repository)
    if (kind === 'track')
      fireEvent.click(
        screen.getByRole('button', { name: 'Valorar pista Eclipse' }),
      )
    const quitName = kind === 'track' ? 'Quitar nota de pista' : 'Quitar nota'
    for (const action of ['keep', 'escape']) {
      fireEvent.click(screen.getByRole('button', { name: quitName }))
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent(
        kind === 'track'
          ? 'todas las apariciones'
          : 'Las notas de pistas se conservan',
      )
      expect(
        screen.getByRole('button', { name: 'Conservar nota' }),
      ).toHaveFocus()
      if (action === 'keep')
        fireEvent.click(screen.getByRole('button', { name: 'Conservar nota' }))
      else fireEvent.keyDown(dialog, { key: 'Escape' })
      expect(screen.getByRole('button', { name: quitName })).toHaveFocus()
      expect(await repository.readSnapshot()).toEqual(before)
    }
  },
)
test('confirmación de nota obsoleta no quita la nueva valoración', async () => {
  const { repository, service } = await setup()
  await open(repository)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar nota' }))
  await service.rateAlbum(libraryIds.entry, 10)
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar quitar nota' }))
  await screen.findByRole('alert')
  expect(
    (await repository.readSnapshot()).library.albumRatings.find(
      (row) => row.userAlbumId === libraryIds.entry,
    )?.scoreUnits,
  ).toBe(20)
  expect(
    within(screen.getByRole('dialog')).getByText(/Se quitará la nota 9,5/),
  ).toBeVisible()
})
