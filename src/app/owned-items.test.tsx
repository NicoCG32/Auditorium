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
async function populated() {
  const database = new AuditoriumDatabase('owned-ui', {
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
  return repository
}
async function open(repository: IndexedDbRepository) {
  render(<App repository={repository} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Eclipse' }))
  openAlbumArea('collection')
  openExperience()
}
function begin() {
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ejemplar' }))
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
async function finished() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Registrar ejemplar' }),
    ).toBeEnabled(),
  )
}
function cards() {
  return within(
    screen.getByRole('list', { name: 'Ejemplares de este álbum' }),
  ).getAllByRole('listitem')
}
function removeButton(card: HTMLElement) {
  return within(card).getByRole('button', { name: /^Eliminar ejemplar/ })
}

test('dos CD iguales se registran por separado, persisten y borrar uno conserva todos los demás datos', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await open(repository)
  for (let index = 0; index < 2; index++) {
    begin()
    change('Edición del ejemplar', ids.original)
    change('Notas del ejemplar', '  Copia ficticia.\nOtra línea.  ')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ejemplar' }))
    await finished()
  }
  expect(cards()).toHaveLength(2)
  const saved = await repository.readSnapshot()
  expect(new Set(saved.library.ownedItems.map((item) => item.id)).size).toBe(2)
  fireEvent.click(removeButton(cards()[0]!))
  expect(screen.getByRole('dialog')).toHaveTextContent('no se puede deshacer')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Conservar ejemplar' }),
    ).toHaveFocus(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }))
  await finished()
  expect(cards()).toHaveLength(1)
  const after = await repository.readSnapshot()
  expect(after.catalog).toEqual(before.catalog)
  expect(after.library.userAlbums).toEqual(before.library.userAlbums)
  expect(after.library.albumRatings).toEqual(before.library.albumRatings)
  expect(after.library.trackRatings).toEqual(before.library.trackRatings)
  expect(after.library.ownedItems[0]?.notes).toBe(
    '  Copia ficticia.\nOtra línea.  ',
  )
  repository.close()
  expect(await repository.readSnapshot()).toEqual(after)
})
test('cancelar registro, cancelar eliminación y Escape no escriben; retornan foco', async () => {
  const repository = await populated()
  const item = await new MusicLibrary(repository).addOwnedItem(
    libraryIds.entry,
    { medium: 'physical', format: 'cd' },
  )
  await open(repository)
  begin()
  change('Notas del ejemplar', 'Borrador ficticio')
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar registro' }))
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Registrar ejemplar' }),
    ).toHaveFocus(),
  )
  const button = removeButton(cards()[0]!)
  fireEvent.click(button)
  fireEvent.click(screen.getByRole('button', { name: 'Conservar ejemplar' }))
  expect(button).toHaveFocus()
  fireEvent.click(button)
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect((await repository.readSnapshot()).library.ownedItems).toEqual([item])
})
test('formatos y ediciones compatibles se filtran; cambio de medio limpia edición y condiciones físicas', async () => {
  const repository = await populated(),
    service = new MusicLibrary(repository)
  const digital = await service.addRelease({
    albumId: ids.album,
    format: 'digital',
    editionLabel: 'Digital ficticia',
  })
  await open(repository)
  begin()
  const editions = screen.getByLabelText('Edición del ejemplar')
  expect(within(editions).getAllByRole('option')).toHaveLength(2)
  change('Edición del ejemplar', ids.original)
  change('Estado del soporte', 'mint')
  change('Formato del ejemplar', 'vinyl')
  expect(editions).toHaveValue('')
  expect(
    within(editions).getByRole('option', { name: 'Deluxe · Vinilo · 2024' }),
  ).toBeVisible()
  change('Medio del ejemplar', 'purchased_digital')
  expect(screen.queryByLabelText('Estado del soporte')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Formato del ejemplar')).toHaveValue(
    'digital_download',
  )
  expect(within(editions).getAllByRole('option')).toHaveLength(2)
  change('Edición del ejemplar', digital.id)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar ejemplar' }))
  await finished()
  expect((await repository.readSnapshot()).library.ownedItems[0]).toMatchObject(
    {
      medium: 'purchased_digital',
      format: 'digital_download',
      releaseId: digital.id,
    },
  )
  expect(
    (await repository.readSnapshot()).library.ownedItems[0],
  ).not.toHaveProperty('mediaCondition')
})
test('fecha de adquisición se conserva al cambiar condiciones y otros opcionales se omiten', async () => {
  const repository = await populated()
  await open(repository)
  begin()
  fireEvent.input(screen.getByLabelText('Fecha de adquisición'), {
    target: { value: '2000-02-29' },
  })
  change('Estado del soporte', 'very_good')
  change('Estado de la funda', 'fair')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar ejemplar' }))
  await finished()
  const item = (await repository.readSnapshot()).library.ownedItems[0]!
  expect(item).toMatchObject({
    acquiredAt: '2000-02-29',
    mediaCondition: 'very_good',
    sleeveCondition: 'fair',
  })
  expect(item).not.toHaveProperty('releaseId')
  expect(item).not.toHaveProperty('notes')
})
test('cuota conserva formulario y no agrega copia; reintento guarda una sola', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await open(repository)
  begin()
  change('Notas del ejemplar', 'Borrador ficticio protegido')
  const failure = vi
    .spyOn(databases[0]!.ownedItems, 'bulkPut')
    .mockRejectedValue(new DOMException('Quota ficticia', 'QuotaExceededError'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar ejemplar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
  expect(screen.getByLabelText('Notas del ejemplar')).toHaveValue(
    'Borrador ficticio protegido',
  )
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar ejemplar' }))
  await finished()
  expect(cards()).toHaveLength(1)
})
test('eliminación fallida conserva el ejemplar y la confirmación para reintentar', async () => {
  const repository = await populated()
  await new MusicLibrary(repository).addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
  })
  await open(repository)
  const before = await repository.readSnapshot(),
    failure = vi
      .spyOn(databases[0]!.ownedItems, 'bulkDelete')
      .mockRejectedValue(new DOMException('Aborto ficticio', 'AbortError'))
  fireEvent.click(removeButton(cards()[0]!))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }))
  await finished()
  expect(
    screen.queryByRole('list', { name: 'Ejemplares de este álbum' }),
  ).not.toBeInTheDocument()
})
test.each(['registrar', 'eliminar'])(
  'lectura fallida después de %s muestra resultado confirmado y reintenta sin escribir',
  async (action) => {
    const repository = await populated()
    if (action === 'eliminar')
      await new MusicLibrary(repository).addOwnedItem(libraryIds.entry, {
        medium: 'physical',
        format: 'cd',
      })
    await open(repository)
    const add = vi.spyOn(MusicLibrary.prototype, 'addOwnedItem'),
      remove = vi.spyOn(MusicLibrary.prototype, 'removeOwnedItem')
    if (action === 'registrar') begin()
    else fireEvent.click(removeButton(cards()[0]!))
    vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
      new LocalStorageError('unexpected', 'Lectura ficticia fallida'),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name:
          action === 'registrar' ? 'Guardar ejemplar' : 'Confirmar eliminación',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El cambio se guardó',
    )
    expect(
      screen.getByText(
        action === 'registrar'
          ? '1 ejemplar registrado'
          : '0 ejemplares registrados',
      ),
    ).toBeVisible()
    for (const name of [
      'Guardar experiencia',
      'Guardar experiencia',
      'Volver a biblioteca',
      'Editar lista original',
    ])
      expect(screen.getByRole('button', { name })).toBeDisabled()
    const retry = screen.getByRole('button', {
      name: 'Reintentar lectura de colección',
    })
    await waitFor(() => expect(retry).toHaveFocus())
    fireEvent.click(retry)
    await finished()
    expect(action === 'registrar' ? add : remove).toHaveBeenCalledTimes(1)
  },
)
test('doble envío registra una vez y bloquea escrituras de otros editores', async () => {
  const repository = await populated()
  await open(repository)
  begin()
  const add = vi.spyOn(MusicLibrary.prototype, 'addOwnedItem'),
    rate = vi.spyOn(MusicLibrary.prototype, 'rateAlbum')
  const form = screen
    .getByRole('button', { name: 'Guardar ejemplar' })
    .closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  expect(add).toHaveBeenCalledTimes(1)
  expect(rate).not.toHaveBeenCalled()
  await finished()
  expect(cards()).toHaveLength(1)
})
test('actualizar una valoración conserva el borrador de registro de propiedad', async () => {
  const repository = await populated()
  await open(repository)
  begin()
  change('Notas del ejemplar', 'Borrador ficticio')
  change('Nota del álbum', '8')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Guardar experiencia' }),
    ).toBeEnabled(),
  )
  expect(screen.getByLabelText('Notas del ejemplar')).toHaveValue(
    'Borrador ficticio',
  )
  expect((await repository.readSnapshot()).library.ownedItems).toEqual([])
})

test('editar una copia compartida y cancelar su borrador conserva las otras copias y el catálogo', async () => {
  const repository = await populated(),
    service = new MusicLibrary(repository)
  const first = await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
    releaseId: ids.original,
    notes: 'Primera copia',
  })
  const second = await service.addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
    releaseId: ids.original,
  })
  const before = await repository.readSnapshot()
  await open(repository)
  const card = cards().find((card) =>
    within(card).queryByText('Primera copia'),
  )!
  fireEvent.click(
    within(card).getByRole('button', { name: /^Editar ejemplar/ }),
  )
  change('Notas del ejemplar', 'Borrador descartable')
  fireEvent.click(
    screen.getByRole('button', { name: 'Cancelar edición del ejemplar' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
  expect(await repository.readSnapshot()).toEqual(before)
  fireEvent.click(
    within(card).getByRole('button', { name: /^Editar ejemplar/ }),
  )
  change('Formato del ejemplar', 'vinyl')
  change('Edición del ejemplar', ids.deluxe)
  change('Notas del ejemplar', '  Copia corregida.\nSin tocar la edición.  ')
  fireEvent.click(
    screen.getByRole('button', { name: 'Guardar cambios del ejemplar' }),
  )
  await finished()
  const after = await repository.readSnapshot()
  expect(
    after.library.ownedItems.find((row) => row.id === first.id),
  ).toMatchObject({
    format: 'vinyl',
    releaseId: ids.deluxe,
    createdAt: first.createdAt,
  })
  expect(after.library.ownedItems.find((row) => row.id === second.id)).toEqual(
    second,
  )
  expect(after.catalog).toEqual(before.catalog)
  expect(after.library.userAlbums).toEqual(before.library.userAlbums)
  expect(
    cards()
      .map((card) => card.textContent)
      .join(' '),
  ).not.toContain(first.id.slice(-8))
})

test.each(['cambiada', 'eliminada'])(
  'un borrador de copia %s se conserva y cargar no escribe',
  async (action) => {
    const repository = await populated(),
      service = new MusicLibrary(repository)
    const item = await service.addOwnedItem(libraryIds.entry, {
      medium: 'physical',
      format: 'cd',
    })
    await open(repository)
    fireEvent.click(
      within(cards()[0]!).getByRole('button', { name: /^Editar ejemplar/ }),
    )
    change('Notas del ejemplar', 'Borrador protegido')
    if (action === 'cambiada')
      await service.updateOwnedItem(item, {
        medium: 'physical',
        format: 'cd',
        notes: 'Cambio concurrente',
      })
    else await service.removeOwnedItem(item.userAlbumId, item.id, item)
    const before = await repository.readSnapshot(),
      update = vi.spyOn(MusicLibrary.prototype, 'updateOwnedItem')
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar cambios del ejemplar' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu borrador se conserva',
    )
    expect(screen.getByLabelText('Notas del ejemplar')).toHaveValue(
      'Borrador protegido',
    )
    expect(await repository.readSnapshot()).toEqual(before)
    fireEvent.click(
      screen.getByRole('button', { name: 'Cargar colección guardada' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Cargar colección guardada' }),
      ).not.toBeInTheDocument(),
    )
    expect(update).toHaveBeenCalledTimes(1)
    expect(await repository.readSnapshot()).toEqual(before)
    if (action === 'cambiada')
      expect(screen.getByLabelText('Notas del ejemplar')).toHaveValue(
        'Cambio concurrente',
      )
    else
      expect(
        screen.queryByLabelText('Notas del ejemplar'),
      ).not.toBeInTheDocument()
  },
)

test('lectura fallida tras editar muestra la copia corregida y reintenta sin actualizar otra vez', async () => {
  const repository = await populated()
  await new MusicLibrary(repository).addOwnedItem(libraryIds.entry, {
    medium: 'physical',
    format: 'cd',
    notes: 'Antes',
  })
  await open(repository)
  fireEvent.click(
    within(cards()[0]!).getByRole('button', { name: /^Editar ejemplar/ }),
  )
  change('Notas del ejemplar', 'Después')
  const update = vi.spyOn(MusicLibrary.prototype, 'updateOwnedItem')
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Lectura ficticia'),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Guardar cambios del ejemplar' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'El cambio se guardó',
  )
  expect(cards()[0]).toHaveTextContent('Después')
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar lectura de colección' }),
  )
  await finished()
  expect(update).toHaveBeenCalledTimes(1)
  expect((await repository.readSnapshot()).library.ownedItems[0]?.notes).toBe(
    'Después',
  )
})
