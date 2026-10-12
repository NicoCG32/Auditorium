import { StrictMode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
  LocalRepository,
  LocalSnapshot,
} from '../domain/repositories/local-repository'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { LocalStorageError } from '../infrastructure/db/errors'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { App } from './App'

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
  fireEvent.click(
    screen.getByRole('button', { name: 'Consultar cambios guardados' }),
  )
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
  const slow: LocalRepository = {
    open: vi.fn(),
    readSnapshot: () => promise,
    close: vi.fn(),
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
