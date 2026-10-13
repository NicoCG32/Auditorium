import { StrictMode } from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createLibrarySchema } from '../domain/library/library'
import {
  libraryIds,
  makeContext,
  makeLibrary,
  times,
} from '../domain/library/library.fixture'
import type {
  TransactionalLocalRepository,
  LocalSnapshot,
} from '../domain/repositories/local-repository'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { LocalStorageError } from '../infrastructure/db/errors'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { App } from './App'
import { MusicLibrary } from '../application/music-library'
import { ids } from '../domain/catalog/catalog.fixture'

let indexedDB: IDBFactory
let databases: AuditoriumDatabase[]
beforeEach(() => {
  indexedDB = new IDBFactory()
  databases = []
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const db of databases) db.close()
  for (const db of new Map(databases.map((db) => [db.name, db])).values())
    await db.delete()
})
function connect() {
  const database = new AuditoriumDatabase('library-ui', {
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
      identity: snapshot.identity,
      catalog: context.catalog,
      library: createLibrarySchema(context).parse(makeLibrary()),
    },
    result: undefined,
  }))
  return repository
}
function albumTitles() {
  return within(screen.getByRole('list', { name: 'Álbumes de tu biblioteca' }))
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
}

async function openAlbumForm(repository: IndexedDbRepository) {
  render(<App repository={repository} />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Añadir álbum' })).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Añadir álbum' }))
}
function fillAlbum(artist = 'Umbral ficticio', title = 'Eclipse nuevo') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Artista' }), {
    target: { value: artist },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
    target: { value: title },
  })
}

async function openRating(repository: IndexedDbRepository) {
  render(<App repository={repository} />)
  const button = await screen.findByRole('button', { name: 'Eclipse' })
  fireEvent.click(button)
  return screen.getByRole('textbox', { name: 'Nota del álbum' })
}

test('lectura fallida tras conflicto conserva el borrador y permite otro intento', async () => {
  const repository = await populated()
  await openRating(repository)
  fireEvent.change(screen.getByRole('textbox', { name: 'Notas personales' }), {
    target: { value: 'Borrador ficticio sin perder' },
  })
  await new MusicLibrary(connect()).updatePersonalExperience(libraryIds.entry, {
    listeningStatus: 'completed',
    personalNotes: 'Texto actualizado ficticio',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  await screen.findByRole('alert')
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Fallo de lectura ficticio'),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Cargar datos guardados' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No se pudieron cargar',
  )
  expect(screen.getByRole('textbox', { name: 'Notas personales' })).toHaveValue(
    'Borrador ficticio sin perder',
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Cargar datos guardados' }),
    ).toBeEnabled(),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Cargar datos guardados' }),
  )
  await screen.findByText('Datos guardados cargados. Puedes volver a editar.')
  expect(screen.getByRole('textbox', { name: 'Notas personales' })).toHaveValue(
    'Texto actualizado ficticio',
  )
})

test('escucha y notas se guardan juntas y persisten sin cambiar ratings', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await openRating(repository)
  expect(screen.getByRole('textbox', { name: 'Notas personales' })).toHaveValue(
    '  Comentario ficticio.\nSegunda línea.  ',
  )
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Estado de escucha' }),
    { target: { value: 'completed' } },
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Notas personales' }), {
    target: { value: '  Recuerdo ficticio.\nOtra línea.  ' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  await screen.findByText('Escucha y notas guardadas.')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Volver a biblioteca' }),
    ).toBeEnabled(),
  )
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Estado de escucha' }),
    ).toHaveFocus(),
  )
  const after = await repository.readSnapshot()
  expect(after.catalog).toEqual(before.catalog)
  expect(after.library.albumRatings).toEqual(before.library.albumRatings)
  expect(after.library.trackRatings).toEqual(before.library.trackRatings)
  expect(
    after.library.userAlbums.find((entry) => entry.id === libraryIds.entry),
  ).toMatchObject({
    listeningStatus: 'completed',
    personalNotes: '  Recuerdo ficticio.\nOtra línea.  ',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  const card = screen.getByRole('button', { name: 'Eclipse' }).closest('li')
  if (!card) throw new Error('Falta tarjeta ficticia.')
  expect(within(card).getByText('Escuchado')).toBeVisible()
  repository.close()
  expect(await connect().readSnapshot()).toEqual(after)
})

test('limpiar notas modifica solo el borrador hasta guardar y no borra la valoración', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await openRating(repository)
  fireEvent.click(
    screen.getByRole('button', { name: 'Limpiar notas del formulario' }),
  )
  expect(screen.getByRole('textbox', { name: 'Notas personales' })).toHaveValue(
    '',
  )
  expect(await repository.readSnapshot()).toEqual(before)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  await screen.findByText('Escucha y notas guardadas.')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Volver a biblioteca' }),
    ).toBeEnabled(),
  )
  const after = await repository.readSnapshot()
  expect(
    after.library.userAlbums.find((entry) => entry.id === libraryIds.entry),
  ).not.toHaveProperty('personalNotes')
  expect(after.library.albumRatings).toEqual(before.library.albumRatings)
})

test('error de escritura conserva escucha anterior y borrador; reintentar guarda ambas partes', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot(),
    database = databases[0]
  if (!database) throw new Error('Falta base ficticia.')
  await openRating(repository)
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Estado de escucha' }),
    { target: { value: 'in_progress' } },
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Notas personales' }), {
    target: { value: 'Borrador ficticio conservado' },
  })
  const failure = vi
    .spyOn(database.userAlbums, 'bulkPut')
    .mockRejectedValue(new DOMException('Quota ficticia', 'QuotaExceededError'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
  expect(
    screen.getByRole('combobox', { name: 'Estado de escucha' }),
  ).toHaveValue('in_progress')
  expect(screen.getByRole('textbox', { name: 'Notas personales' })).toHaveValue(
    'Borrador ficticio conservado',
  )
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  await screen.findByText('Escucha y notas guardadas.')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Volver a biblioteca' }),
    ).toBeEnabled(),
  )
  expect(
    (await repository.readSnapshot()).library.userAlbums.find(
      (entry) => entry.id === libraryIds.entry,
    ),
  ).toMatchObject({
    listeningStatus: 'in_progress',
    personalNotes: 'Borrador ficticio conservado',
  })
})

test('lectura fallida tras commit bloquea el otro editor y reintenta solo lectura', async () => {
  const repository = await populated()
  await openRating(repository)
  const save = vi.spyOn(MusicLibrary.prototype, 'updatePersonalExperience')
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Estado de escucha' }),
    { target: { value: 'completed' } },
  )
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Fallo ficticio'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'La experiencia se guardó',
  )
  expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Volver a biblioteca' }),
  ).toBeDisabled()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Reintentar lectura de experiencia' }),
    ).toHaveFocus(),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar lectura de experiencia' }),
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Volver a biblioteca' }),
    ).toBeEnabled(),
  )
  expect(save).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeEnabled()
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Estado de escucha' }),
    ).toHaveFocus(),
  )
})

test('borrador anterior no sobrescribe otra pestaña; cargar datos lo reemplaza explícitamente', async () => {
  const repository = await populated()
  await openRating(repository)
  fireEvent.change(screen.getByRole('textbox', { name: 'Notas personales' }), {
    target: { value: 'Borrador local ficticio' },
  })
  await new MusicLibrary(connect()).updatePersonalExperience(libraryIds.entry, {
    listeningStatus: 'completed',
    personalNotes: 'Texto ficticio desde otra pestaña',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Tu experiencia cambió',
  )
  expect(screen.getByRole('textbox', { name: 'Notas personales' })).toHaveValue(
    'Borrador local ficticio',
  )
  expect(
    screen.getByRole('button', { name: 'Guardar experiencia' }),
  ).toBeDisabled()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Cargar datos guardados' }),
    ).toHaveFocus(),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Cargar datos guardados' }),
  )
  await screen.findByText('Datos guardados cargados. Puedes volver a editar.')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Guardar experiencia' }),
    ).toBeEnabled(),
  )
  expect(screen.getByRole('textbox', { name: 'Notas personales' })).toHaveValue(
    'Texto ficticio desde otra pestaña',
  )
  expect(
    screen.getByRole('combobox', { name: 'Estado de escucha' }),
  ).toHaveValue('completed')
  fireEvent.change(screen.getByRole('textbox', { name: 'Notas personales' }), {
    target: { value: 'Texto revisado ficticio' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  await screen.findByText('Escucha y notas guardadas.')
  expect(
    (await repository.readSnapshot()).library.userAlbums.find(
      (entry) => entry.id === libraryIds.entry,
    )?.personalNotes,
  ).toBe('Texto revisado ficticio')
})

test('guardar rating conserva un borrador de experiencia y no renueva su referencia anterior', async () => {
  const repository = await populated()
  const rating = await openRating(repository)
  fireEvent.change(screen.getByRole('textbox', { name: 'Notas personales' }), {
    target: { value: 'Borrador ficticio protegido' },
  })
  await new MusicLibrary(connect()).updatePersonalExperience(libraryIds.entry, {
    listeningStatus: 'completed',
    personalNotes: 'Cambio ficticio de otra pestaña',
  })
  fireEvent.change(rating, { target: { value: '8' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
  await waitFor(() => expect(screen.getByText('8 / 10')).toBeVisible())
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Guardar experiencia' }),
    ).toBeEnabled(),
  )
  expect(screen.getByRole('textbox', { name: 'Notas personales' })).toHaveValue(
    'Borrador ficticio protegido',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Tu experiencia cambió',
  )
  expect(
    (await repository.readSnapshot()).library.userAlbums.find(
      (entry) => entry.id === libraryIds.entry,
    )?.personalNotes,
  ).toBe('Cambio ficticio de otra pestaña')
})

test('volver con filtro de escucha conserva criterios y enfoca búsqueda si la tarjeta no coincide', async () => {
  const repository = await populated()
  render(<App repository={repository} />)
  await screen.findByRole('button', { name: 'Eclipse' })
  fireEvent.change(screen.getByLabelText('Escucha'), {
    target: { value: 'queued' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Eclipse' }))
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Estado de escucha' }),
    { target: { value: 'completed' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  await screen.findByText('Escucha y notas guardadas.')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Volver a biblioteca' }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  expect(screen.getByRole('searchbox')).toHaveFocus()
  expect(screen.getByLabelText('Escucha')).toHaveValue('queued')
  expect(
    screen.getByRole('heading', { name: 'No encontramos coincidencias' }),
  ).toBeVisible()
})

test('doble envío guarda una vez e impide escritura simultánea desde valoración', async () => {
  const repository = await populated()
  const rating = await openRating(repository),
    save = vi.spyOn(MusicLibrary.prototype, 'updatePersonalExperience'),
    rate = vi.spyOn(MusicLibrary.prototype, 'rateAlbum')
  const experience = screen
      .getByRole('textbox', { name: 'Notas personales' })
      .closest('form'),
    ratingForm = rating.closest('form')
  if (!experience || !ratingForm)
    throw new Error('Faltan formularios ficticios.')
  fireEvent.submit(experience)
  fireEvent.submit(experience)
  fireEvent.submit(ratingForm)
  expect(save).toHaveBeenCalledTimes(1)
  expect(rate).not.toHaveBeenCalled()
  await screen.findByText('Escucha y notas guardadas.')
})

test('volver tras quitar una nota conserva los filtros y enfoca búsqueda si la tarjeta queda oculta', async () => {
  const repository = await populated()
  render(<App repository={repository} />)
  await screen.findByRole('button', { name: 'Eclipse' })
  fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'high' } })
  fireEvent.click(screen.getByRole('button', { name: 'Eclipse' }))
  fireEvent.click(screen.getByRole('button', { name: 'Quitar nota' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar quitar nota' }))
  await screen.findByText('Nota quitada.')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Volver a biblioteca' }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  expect(screen.getByRole('searchbox')).toHaveFocus()
  expect(screen.getByLabelText('Nota')).toHaveValue('high')
  expect(
    screen.queryByRole('button', { name: 'Eclipse' }),
  ).not.toBeInTheDocument()
})

test('ficha muestra metadatos y recibe la portada guardada sin cargarla automáticamente', async () => {
  const repository = await populated()
  await repository.mutate((snapshot) => {
    snapshot.catalog.albums = snapshot.catalog.albums.map((album) =>
      album.id === ids.album
        ? {
            ...album,
            description: 'Descripción ficticia disponible.',
            coverUrl: 'https://example.invalid/portada.svg',
          }
        : album,
    )
    return { snapshot, result: undefined }
  })
  await openRating(repository)
  expect(screen.getByText('1998')).toBeVisible()
  expect(screen.getByText('Descripción ficticia disponible.')).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Abrir enlace de portada' }),
  ).toHaveAttribute('href', 'https://example.invalid/portada.svg')
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar portada' }))
  expect(
    screen.getByRole('img', { name: 'Portada de Eclipse' }),
  ).toHaveAttribute('src', 'https://example.invalid/portada.svg')
})

test('cambiar de álbum descarta el borrador y carga su propia nota', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  const input = await openRating(repository)
  fireEvent.change(input, { target: { value: '1,5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  fireEvent.click(screen.getByRole('button', { name: 'Otra órbita' }))
  expect(screen.getByRole('textbox', { name: 'Nota del álbum' })).toHaveValue(
    '8',
  )
  expect(await repository.readSnapshot()).toEqual(before)
})

test('guardar nota decimal actualiza ficha y tarjeta; reabrir conserva el resultado', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  const input = await openRating(repository)
  fireEvent.change(input, { target: { value: '8,5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
  await waitFor(() => expect(screen.getByText('8,5 / 10')).toBeVisible())
  await waitFor(() => expect(input).toHaveFocus())
  const after = await repository.readSnapshot()
  expect(after.catalog).toEqual(before.catalog)
  expect(after.library.trackRatings).toEqual(before.library.trackRatings)
  expect(after.library.userAlbums).toEqual(before.library.userAlbums)
  expect(
    after.library.albumRatings.find(
      (row) => row.userAlbumId === libraryIds.entry,
    )?.scoreUnits,
  ).toBe(17)
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  expect(screen.getByText('8,5')).toBeVisible()
  repository.close()
  expect(await connect().readSnapshot()).toEqual(after)
})

test('quitar nota deja ausencia real y conserva valoraciones de pistas y otro álbum', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  const input = await openRating(repository)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar nota' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar quitar nota' }))
  await screen.findByText('Nota quitada.')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Volver a biblioteca' }),
    ).toBeEnabled(),
  )
  expect(input).toHaveValue('')
  const after = await repository.readSnapshot()
  expect(after.library.albumRatings).toEqual(
    before.library.albumRatings.filter(
      (row) => row.userAlbumId !== libraryIds.entry,
    ),
  )
  expect(after.library.trackRatings).toEqual(before.library.trackRatings)
  expect(after.library.userAlbums).toEqual(before.library.userAlbums)
  expect(screen.getByRole('button', { name: 'Quitar nota' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  const card = screen.getByRole('button', { name: 'Eclipse' }).closest('li')
  if (!card) throw new Error('Falta tarjeta ficticia.')
  expect(within(card).getByText('Sin nota')).toBeVisible()
})

test.each(['0', '9,3', '10,5', ''])(
  'la nota inválida %s enfoca el error sin escribir',
  async (value) => {
    const repository = await populated(),
      before = await repository.readSnapshot()
    const input = await openRating(repository)
    fireEvent.change(input, { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'de 1 a 10 en pasos de 0,5',
    )
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveFocus()
    expect(screen.getByText('9,5 / 10')).toBeVisible()
    expect(await repository.readSnapshot()).toEqual(before)
  },
)

test('quota al reemplazar una nota conserva valor previo y borrador para reintentar', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot(),
    database = databases[0]
  if (!database) throw new Error('Falta base ficticia.')
  const input = await openRating(repository)
  fireEvent.change(input, { target: { value: '10' } })
  const failure = vi
    .spyOn(database.albumRatings, 'bulkPut')
    .mockRejectedValue(new DOMException('Quota ficticia', 'QuotaExceededError'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
  expect(input).toHaveValue('10')
  await waitFor(() => expect(input).toHaveFocus())
  expect(screen.getByText('9,5 / 10')).toBeVisible()
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
  await waitFor(() => expect(screen.getByText('10 / 10')).toBeVisible())
})

test('fallo de remoción restaura la fila anterior y permite reintentar', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot(),
    database = databases[0]
  if (!database) throw new Error('Falta base ficticia.')
  await openRating(repository)
  const failure = vi
    .spyOn(database.albumRatings, 'bulkDelete')
    .mockRejectedValue(new DOMException('Abort ficticio', 'AbortError'))
  fireEvent.click(screen.getByRole('button', { name: 'Quitar nota' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar quitar nota' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'nota anterior se conserva',
  )
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Quitar nota' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar quitar nota' }))
  await screen.findByText('Nota quitada.')
})

test('fallo de lectura tras commit informa nota guardada y reintenta solo la lectura', async () => {
  const repository = await populated()
  const input = await openRating(repository)
  fireEvent.change(input, { target: { value: '7.5' } })
  const save = vi.spyOn(MusicLibrary.prototype, 'rateAlbum')
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Fallo ficticio'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'El cambio se guardó',
  )
  expect(screen.getByText('7,5 / 10')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Volver a biblioteca' }),
  ).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Reintentar lectura' }),
  ).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar lectura' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Volver a biblioteca' }),
    ).toBeEnabled(),
  )
  expect(save).toHaveBeenCalledTimes(1)
  expect(input).toHaveFocus()
  expect(
    (await repository.readSnapshot()).library.albumRatings.find(
      (row) => row.userAlbumId === libraryIds.entry,
    )?.scoreUnits,
  ).toBe(15)
})

test('dos envíos de nota seguidos solo ejecutan una escritura', async () => {
  const repository = await populated()
  const input = await openRating(repository),
    save = vi.spyOn(MusicLibrary.prototype, 'rateAlbum')
  fireEvent.change(input, { target: { value: '10' } })
  const form = input.closest('form')
  if (!form) throw new Error('Falta formulario ficticio.')
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(save).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.getByText('10 / 10')).toBeVisible())
})

test('registro mínimo aparece sin recarga y permite abrir su ficha básica', async () => {
  const repository = connect()
  render(<App repository={repository} />)
  await screen.findByRole('button', { name: 'Añadir tu primer álbum' })
  fireEvent.click(
    screen.getByRole('button', { name: 'Añadir tu primer álbum' }),
  )
  expect(screen.getByRole('textbox', { name: 'Artista' })).toHaveFocus()
  fillAlbum()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  const album = await screen.findByRole('button', { name: 'Eclipse nuevo' })
  expect(album).toHaveFocus()
  const snapshot = await repository.readSnapshot()
  expect(snapshot.catalog.albums[0]?.releaseType).toBe('album')
  expect(snapshot.catalog.albums[0]).not.toHaveProperty('originalYear')
  expect(snapshot.library.userAlbums).toHaveLength(1)
  fireEvent.click(album)
  expect(screen.getByRole('heading', { name: 'Eclipse nuevo' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  expect(screen.getByRole('button', { name: 'Eclipse nuevo' })).toHaveFocus()
})

test('validación de campos y cancelación conservan datos y devuelven el foco', async () => {
  const repository = connect()
  await openAlbumForm(repository)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Revisa los campos')
  expect(screen.getByRole('textbox', { name: 'Título' })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.getByRole('button', { name: 'Añadir álbum' })).toHaveFocus()
  expect((await repository.readSnapshot()).catalog.albums).toEqual([])
})

test('tipo y metadatos opcionales se guardan; año inválido conserva el formulario', async () => {
  const repository = connect()
  await openAlbumForm(repository)
  fillAlbum()
  fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'ep' } })
  fireEvent.click(screen.getByText('Más datos (opcionales)'))
  fireEvent.change(screen.getByLabelText('Año original'), {
    target: { value: '1998.5' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  expect(screen.getByLabelText('Año original')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue(
    'Eclipse nuevo',
  )
  fireEvent.change(screen.getByLabelText('Año original'), {
    target: { value: '1998' },
  })
  fireEvent.change(screen.getByLabelText('Descripción del álbum'), {
    target: { value: 'Descripción ficticia' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('button', { name: 'Eclipse nuevo' })
  expect((await repository.readSnapshot()).catalog.albums[0]).toMatchObject({
    releaseType: 'ep',
    originalYear: 1998,
    description: 'Descripción ficticia',
  })
})

test('registro activo sugerido abre su ficha sin duplicar ni alterar valoraciones', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await openAlbumForm(repository)
  fillAlbum('UMBRAL ELECTRICO', 'ECLIPSE')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('heading', {
    name: 'Encontramos registros parecidos',
  })
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Encontramos registros parecidos' }),
    ).toHaveFocus(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Abrir álbum existente' }))
  await screen.findByRole('button', { name: 'Volver a biblioteca' })
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Eclipse' })).toHaveFocus(),
  )
  expect(screen.getByText('9,5 / 10')).toBeVisible()
  expect(await repository.readSnapshot()).toEqual(before)
})

test('crear otro álbum es explícito y conserva artistas homónimos separados', async () => {
  const repository = await populated()
  await openAlbumForm(repository)
  fillAlbum('Umbral Eléctrico', 'Eclipse')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('button', { name: 'Crear otro álbum' })
  expect((await repository.readSnapshot()).catalog.albums).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Crear otro álbum' }))
  await screen.findByRole('searchbox')
  expect((await repository.readSnapshot()).catalog.albums).toHaveLength(3)
  expect((await repository.readSnapshot()).catalog.artists).toHaveLength(2)
})

test('elige un artista existente por referencia al crear una obra distinta', async () => {
  const repository = await populated()
  await openAlbumForm(repository)
  fillAlbum('Umbral Eléctrico', 'Nueva órbita')
  fireEvent.click(screen.getByRole('radio', { name: /^Usar Umbral Eléctrico/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('button', { name: 'Nueva órbita' })
  expect((await repository.readSnapshot()).catalog.artists).toHaveLength(1)
})

test('añadir un álbum del catálogo crea solo la relación y abre su ficha', async () => {
  const repository = connect()
  await new MusicLibrary(repository).createAlbum({
    title: 'Solo catálogo',
    artists: [{ name: 'Umbral ficticio' }],
    addToLibrary: false,
  })
  const before = await repository.readSnapshot()
  await openAlbumForm(repository)
  fillAlbum('Umbral ficticio', 'Solo catálogo')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('button', { name: 'Añadir álbum del catálogo' })
  fireEvent.click(
    screen.getByRole('button', { name: 'Añadir álbum del catálogo' }),
  )
  await screen.findByRole('button', { name: 'Volver a biblioteca' })
  const after = await repository.readSnapshot()
  expect(after.catalog).toEqual(before.catalog)
  expect(after.library.userAlbums).toHaveLength(1)
})

test('fallo de escritura revierte el alta y mantiene valores para reintentar', async () => {
  const repository = connect()
  await openAlbumForm(repository)
  fillAlbum()
  const before = await repository.readSnapshot(),
    database = databases[0]
  if (!database) throw new Error('Falta base de prueba.')
  const failure = vi
    .spyOn(database.userAlbums, 'bulkPut')
    .mockRejectedValue(new DOMException('Quota ficticia', 'QuotaExceededError'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
  expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue(
    'Eclipse nuevo',
  )
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('button', { name: 'Eclipse nuevo' })
  expect((await repository.readSnapshot()).catalog.albums).toHaveLength(1)
})

test('dos envíos rápidos solo ejecutan una operación de registro', async () => {
  const repository = connect()
  await openAlbumForm(repository)
  fillAlbum()
  const registration = vi.spyOn(MusicLibrary.prototype, 'registerAlbum')
  const form = screen.getByRole('textbox', { name: 'Título' }).closest('form')
  if (!form) throw new Error('Falta formulario de prueba.')
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(registration).toHaveBeenCalledTimes(1)
  await screen.findByRole('button', { name: 'Eclipse nuevo' })
  expect((await repository.readSnapshot()).catalog.albums).toHaveLength(1)
})

test('fallar la lectura después de guardar no repite la escritura al reintentar', async () => {
  const repository = connect()
  await openAlbumForm(repository)
  fillAlbum()
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Fallo ficticio de lectura'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('alert')
  expect(screen.getByText('Álbum guardado en tu biblioteca.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }))
  await screen.findByRole('button', { name: 'Eclipse nuevo' })
  expect((await repository.readSnapshot()).catalog.albums).toHaveLength(1)
})

test('StrictMode abre una biblioteca vacía real y la acción actualiza cambios guardados', async () => {
  const repository = connect()
  render(
    <StrictMode>
      <App repository={repository} />
    </StrictMode>,
  )
  expect(screen.getByRole('main')).toContainElement(
    screen.getByRole('heading', { level: 1, name: 'Tu biblioteca' }),
  )
  expect(
    await screen.findByRole('heading', { name: 'Aún no hay álbumes' }),
  ).toBeVisible()
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  await populated()
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar biblioteca' }))
  await screen.findByRole('heading', { name: 'Eclipse' })
  expect(albumTitles()).toEqual(['Eclipse', 'Otra órbita'])
})

test('búsqueda y filtros combinados, sin resultados y limpieza preservan la biblioteca', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  render(<App repository={repository} />)
  await screen.findByRole('heading', { name: 'Eclipse' })
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'UMBRAL ELECTRICO eclipse' },
  })
  fireEvent.change(screen.getByLabelText('Escucha'), {
    target: { value: 'queued' },
  })
  fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'high' } })
  expect(albumTitles()).toEqual(['Eclipse'])
  fireEvent.change(screen.getByLabelText('Escucha'), {
    target: { value: 'completed' },
  })
  expect(
    screen.getByRole('heading', { name: 'No encontramos coincidencias' }),
  ).toBeVisible()
  fireEvent.click(
    screen.getByRole('button', { name: 'Mostrar todos los álbumes' }),
  )
  expect(albumTitles()).toHaveLength(2)
  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(await repository.readSnapshot()).toEqual(before)
})

test('lista y cuadrícula mantienen resultados, orden y notas visibles de medio punto', async () => {
  const repository = await populated()
  render(<App repository={repository} />)
  await screen.findByRole('heading', { name: 'Eclipse' })
  expect(screen.getByText('9,5')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
  expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  fireEvent.change(screen.getByLabelText('Ordenar por'), {
    target: { value: 'rating' },
  })
  expect(albumTitles()).toEqual(['Eclipse', 'Otra órbita'])
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'otra' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cuadrícula' }))
  expect(albumTitles()).toEqual(['Otra órbita'])
  expect(screen.queryByLabelText(/propiedad|formato/i)).not.toBeInTheDocument()
})

test('muestra datos persistidos después de cerrar y reabrir el repositorio', async () => {
  const repository = await populated()
  repository.close()
  const reopened = connect()
  render(<App repository={reopened} />)
  await screen.findByRole('heading', { name: 'Eclipse' })
  expect(
    within(
      screen.getByRole('list', { name: 'Álbumes de tu biblioteca' }),
    ).getByText('Pendiente'),
  ).toBeVisible()
  expect(screen.getByText('9,5')).toBeVisible()
  expect(albumTitles()).toHaveLength(2)
})

test('un fallo recuperable muestra una acción; reintentar no altera datos', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('blocked', 'Mensaje técnico privado'),
  )
  render(<App repository={repository} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Otra pestaña')
  expect(screen.queryByText('Mensaje técnico privado')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }))
  await screen.findByRole('heading', { name: 'Eclipse' })
  expect(await repository.readSnapshot()).toEqual(before)
})

test('una respuesta tardía del repositorio anterior no reemplaza la vista actual', async () => {
  let resolve: ((snapshot: LocalSnapshot) => void) | undefined
  const promise = new Promise<LocalSnapshot>((accept) => {
    resolve = accept
  })
  const slow: TransactionalLocalRepository = {
    open: vi.fn(),
    readSnapshot: () => promise,
    close: vi.fn(),
    mutate: vi.fn(),
  }
  const { rerender } = render(<App repository={slow} />)
  const current = connect()
  rerender(<App repository={current} />)
  await screen.findByRole('heading', { name: 'Aún no hay álbumes' })
  const snapshot = await (await populated()).readSnapshot()
  await act(async () => {
    resolve?.(snapshot)
    await promise
  })
  expect(
    screen.getByRole('heading', { name: 'Aún no hay álbumes' }),
  ).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'Eclipse' }),
  ).not.toBeInTheDocument()
})
