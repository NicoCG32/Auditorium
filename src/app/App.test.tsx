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
  expect(
    screen.getByRole('heading', { name: 'Encontramos registros parecidos' }),
  ).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Abrir álbum existente' }))
  await screen.findByRole('button', { name: 'Volver a biblioteca' })
  expect(screen.getByRole('heading', { name: 'Eclipse' })).toHaveFocus()
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
