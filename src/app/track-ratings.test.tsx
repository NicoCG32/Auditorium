import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createLibrarySchema } from '../domain/library/library'
import {
  makeContext,
  makeLibrary,
  libraryIds,
  times,
} from '../domain/library/library.fixture'
import { ids, fixtureId } from '../domain/catalog/catalog.fixture'
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
  for (const database of databases) database.close()
  await databases[0]?.delete()
})
function connect() {
  const database = new AuditoriumDatabase('track-ratings-ui', {
    indexedDB,
    IDBKeyRange,
  })
  databases.push(database)
  return new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
}
async function populated() {
  const repository = connect(),
    context = makeContext()
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
}
function choose(value: string) {
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Lista que quieres consultar' }),
    { target: { value } },
  )
}
function edit(name = 'Eclipse') {
  fireEvent.click(screen.getByRole('button', { name: `Valorar pista ${name}` }))
  return screen.getByRole('textbox', { name: 'Nota de la pista' })
}
async function finished() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Guardar nota de pista' }),
    ).toBeEnabled(),
  )
}
function row(name: string) {
  return screen
    .getByRole('button', { name: `Valorar pista ${name}` })
    .closest('li')!
}

test('nota compartida se actualiza en original y ediciones, conserva variante/álbum/catálogo y persiste al reabrir', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await open(repository)
  const input = edit()
  fireEvent.change(input, { target: { value: '8,5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota de pista' }))
  await finished()
  await waitFor(() => expect(input).toHaveFocus())
  expect(row('Eclipse')).toHaveTextContent('8,5 / 10')
  choose(ids.original)
  expect(row('Eclipse')).toHaveTextContent('8,5 / 10')
  choose(ids.deluxe)
  expect(row('Eclipse')).toHaveTextContent('8,5 / 10')
  expect(row('Eclipse (Demo)')).toHaveTextContent('7 / 10')
  const after = await repository.readSnapshot()
  expect(after.catalog).toEqual(before.catalog)
  expect(after.library.albumRatings).toEqual(before.library.albumRatings)
  expect(after.library.userAlbums).toEqual(before.library.userAlbums)
  expect(
    after.library.trackRatings.filter(
      (rating) => rating.trackId !== ids.eclipse,
    ),
  ).toEqual(
    before.library.trackRatings.filter(
      (rating) => rating.trackId !== ids.eclipse,
    ),
  )
  repository.close()
  expect(await connect().readSnapshot()).toEqual(after)
})

test('variante tiene nota propia y quitarla elimina solo su registro', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await open(repository)
  choose(ids.deluxe)
  const input = edit('Eclipse (Demo)')
  fireEvent.change(input, { target: { value: '6.5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota de pista' }))
  await finished()
  expect(row('Eclipse')).toHaveTextContent('9 / 10')
  expect(row('Eclipse (Demo)')).toHaveTextContent('6,5 / 10')
  fireEvent.click(screen.getByRole('button', { name: 'Quitar nota de pista' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar quitar nota de pista' }),
  )
  await screen.findByText('Nota de pista quitada.')
  await finished()
  expect(row('Eclipse (Demo)')).toHaveTextContent('Sin nota')
  expect(
    screen.getByRole('button', { name: 'Quitar nota de pista' }),
  ).toBeDisabled()
  expect(input).toHaveValue('')
  const after = await repository.readSnapshot()
  expect(after.library.trackRatings).toEqual(
    before.library.trackRatings.filter((rating) => rating.trackId !== ids.demo),
  )
  expect(after.library.albumRatings).toEqual(before.library.albumRatings)
  expect(after.catalog).toEqual(before.catalog)
})

test('apariciones repetidas y título de edición conservan la identidad de valoración', async () => {
  const repository = await populated()
  await repository.mutate((snapshot) => {
    snapshot.catalog.releaseTracks.push({
      id: fixtureId(700),
      releaseId: ids.deluxe,
      trackId: ids.eclipse,
      discNumber: 2,
      trackNumber: 1,
      contentRole: 'standard',
      displayTitleOverride: 'Eclipse extendido ficticio',
    })
    return { snapshot, result: undefined }
  })
  await open(repository)
  choose(ids.deluxe)
  const appearances = screen.getAllByRole('button', {
    name: 'Valorar pista Eclipse',
  })
  expect(appearances).toHaveLength(2)
  fireEvent.click(appearances[1]!)
  fireEvent.change(screen.getByLabelText('Nota de la pista'), {
    target: { value: '10' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota de pista' }))
  await finished()
  for (const button of appearances)
    expect(button.closest('li')).toHaveTextContent('10 / 10')
  expect(screen.getByText('Eclipse extendido ficticio')).toBeVisible()
  expect(
    (await repository.readSnapshot()).library.trackRatings.filter(
      (rating) => rating.trackId === ids.eclipse,
    ),
  ).toHaveLength(1)
})

test.each(['', '0', '9,3', '10,5'])(
  'nota inválida %s enfoca el campo y no escribe',
  async (value) => {
    const repository = await populated(),
      before = await repository.readSnapshot()
    await open(repository)
    const input = edit()
    fireEvent.change(input, { target: { value } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar nota de pista' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'de 1 a 10 en pasos de 0,5',
    )
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(await repository.readSnapshot()).toEqual(before)
  },
)

test('cuota al reemplazar conserva nota anterior y borrador; reintento guarda una sola nota', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await open(repository)
  const input = edit()
  fireEvent.change(input, { target: { value: '10' } })
  const failure = vi
    .spyOn(databases[0]!.trackRatings, 'bulkPut')
    .mockRejectedValue(new DOMException('Quota ficticia', 'QuotaExceededError'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota de pista' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
  expect(input).toHaveValue('10')
  await waitFor(() => expect(input).toHaveFocus())
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota de pista' }))
  await finished()
  expect(row('Eclipse')).toHaveTextContent('10 / 10')
  expect(
    (await repository.readSnapshot()).library.trackRatings.filter(
      (rating) => rating.trackId === ids.eclipse,
    ),
  ).toHaveLength(1)
})

test('remoción fallida conserva fila y permite reintentar', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await open(repository)
  edit()
  const failure = vi
    .spyOn(databases[0]!.trackRatings, 'bulkDelete')
    .mockRejectedValue(new DOMException('Aborto ficticio', 'AbortError'))
  fireEvent.click(screen.getByRole('button', { name: 'Quitar nota de pista' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar quitar nota de pista' }),
  )
  await screen.findByRole('alert')
  expect(await repository.readSnapshot()).toEqual(before)
  expect(row('Eclipse')).toHaveTextContent('9 / 10')
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Quitar nota de pista' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirmar quitar nota de pista' }),
  )
  await screen.findByText('Nota de pista quitada.')
  await finished()
  expect(row('Eclipse')).toHaveTextContent('Sin nota')
})

test.each(['guardar', 'quitar'])(
  'lectura fallida después de %s bloquea otros editores y se reintenta sin escribir',
  async (action) => {
    const repository = await populated()
    await open(repository)
    const save = vi.spyOn(MusicLibrary.prototype, 'rateTrack'),
      remove = vi.spyOn(MusicLibrary.prototype, 'removeTrackRating')
    const input = edit()
    if (action === 'guardar')
      fireEvent.change(input, { target: { value: '8,5' } })
    vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
      new LocalStorageError('unexpected', 'Lectura ficticia fallida'),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name:
          action === 'guardar'
            ? 'Guardar nota de pista'
            : 'Quitar nota de pista',
      }),
    )
    if (action === 'quitar')
      fireEvent.click(
        screen.getByRole('button', { name: 'Confirmar quitar nota de pista' }),
      )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El cambio se guardó',
    )
    expect(row('Eclipse')).toHaveTextContent(
      action === 'guardar' ? '8,5 / 10' : 'Sin nota',
    )
    expect(
      within(
        screen.getByRole('region', { name: 'Tu valoración de Eclipse' }),
      ).getByText(action === 'guardar' ? '8,5 / 10' : 'Sin nota'),
    ).toBeVisible()
    for (const name of [
      'Guardar nota',
      'Guardar experiencia',
      'Volver a biblioteca',
      'Editar lista original',
      'Cerrar valoración de pista',
    ])
      expect(screen.getByRole('button', { name })).toBeDisabled()
    expect(
      screen.getByRole('combobox', { name: 'Lista que quieres consultar' }),
    ).toBeDisabled()
    const retry = screen.getByRole('button', {
      name: 'Reintentar lectura de nota de pista',
    })
    await waitFor(() => expect(retry).toHaveFocus())
    fireEvent.click(retry)
    await finished()
    expect(action === 'guardar' ? save : remove).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(input).toHaveFocus())
  },
)

test('doble envío escribe una vez y excluye escrituras de álbum y listas', async () => {
  const repository = await populated()
  await open(repository)
  edit()
  const rate = vi.spyOn(MusicLibrary.prototype, 'rateTrack'),
    album = vi.spyOn(MusicLibrary.prototype, 'rateAlbum')
  const form = screen
    .getByRole('button', { name: 'Guardar nota de pista' })
    .closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
  expect(rate).toHaveBeenCalledTimes(1)
  expect(album).not.toHaveBeenCalled()
  expect(
    screen.getByRole('button', { name: 'Editar lista original' }),
  ).toBeDisabled()
  await finished()
})

test('cambiar pista o edición no reutiliza borradores; cerrar devuelve foco', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await open(repository)
  const eclipse = edit()
  fireEvent.change(eclipse, { target: { value: '10' } })
  const overture = edit('Overture')
  expect(overture).toHaveValue('')
  expect(
    screen.getByRole('button', { name: 'Quitar nota de pista' }),
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Cerrar valoración de pista' }),
  )
  expect(
    screen.getByRole('button', { name: 'Valorar pista Overture' }),
  ).toHaveFocus()
  edit()
  expect(screen.getByLabelText('Nota de la pista')).toHaveValue('9')
  choose(ids.deluxe)
  expect(
    screen.queryByRole('textbox', { name: 'Nota de la pista' }),
  ).not.toBeInTheDocument()
  expect(await repository.readSnapshot()).toEqual(before)
})

test('actualizar nota de álbum conserva borrador de pista y no recalcula ninguna nota', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await open(repository)
  const input = edit()
  fireEvent.change(input, { target: { value: '8,5' } })
  fireEvent.change(screen.getByLabelText('Nota del álbum'), {
    target: { value: '10' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeEnabled(),
  )
  expect(input).toHaveValue('8,5')
  expect((await repository.readSnapshot()).library.trackRatings).toEqual(
    before.library.trackRatings,
  )
})
