import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from './App'
import { makeBackup } from '../domain/backup.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { LocalStorageError } from '../infrastructure/db/errors'

let database: AuditoriumDatabase
let repository: IndexedDbRepository
beforeEach(async () => {
  database = new AuditoriumDatabase('navigation-ui', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
  repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  await repository.mutate(() => ({
    snapshot: makeBackup().data,
    result: undefined,
  }))
})
afterEach(async () => {
  vi.restoreAllMocks()
  database.close()
  await database.delete()
})

async function open() {
  render(<App repository={repository} />)
  await screen.findByRole('button', { name: 'Eclipse' })
}
async function edit() {
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Eclipse' }))
  fireEvent.click(screen.getByRole('button', { name: 'Editar álbum' }))
}
function change(name: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } })
}

test('menú principal ordenado, rutas y contexto propio de calificaciones', async () => {
  await open()
  const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
  expect(
    within(nav)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Biblioteca', 'Añadir álbum', 'Calificaciones', 'Mi colección'])
  fireEvent.click(screen.getByRole('button', { name: 'Calificaciones' }))
  expect(location.hash).toBe('#/calificaciones')
  fireEvent.click(screen.getByRole('button', { name: 'Calificados' }))
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Buscar calificaciones' }),
    { target: { value: 'Eclipse' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Recalificar Eclipse' }))
  expect(location.hash).toContain('/experiencia')
  fireEvent.click(
    screen.getByRole('button', { name: 'Volver a calificaciones' }),
  )
  expect(
    screen.getByRole('searchbox', { name: 'Buscar calificaciones' }),
  ).toHaveValue('Eclipse')
  expect(screen.getByRole('button', { name: 'Calificados' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('editar → Recomendaciones no pierde título, cancelación devuelve el foco y descarte es explícito', async () => {
  const before = await repository.readSnapshot()
  await edit()
  const title = screen.getByRole('textbox', { name: 'Título' })
  title.focus()
  change('Título', 'Borrador de prueba')
  fireEvent.click(screen.getByRole('button', { name: 'Recomendaciones' }))
  expect(
    screen.getByRole('dialog', { name: 'Cambios sin guardar' }),
  ).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
  expect(title).toHaveValue('Borrador de prueba')
  expect(screen.getByRole('button', { name: 'Recomendaciones' })).toHaveFocus()
  expect(location.hash).toMatch(/\/editar$/)
  expect(await repository.readSnapshot()).toEqual(before)
  fireEvent.click(screen.getByRole('button', { name: 'Recomendaciones' }))
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
  expect(location.hash).toBe('#/opciones/recomendaciones')
  expect(await repository.readSnapshot()).toEqual(before)
})

test('guardar y salir confirma datos una vez y abre el destino solicitado', async () => {
  await edit()
  const writes = vi.spyOn(repository, 'mutate')
  change('Título', 'Eclipse corregido para navegar')
  fireEvent.click(screen.getByRole('button', { name: 'Mi colección' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar y salir' }))
  await waitFor(() => expect(location.hash).toBe('#/coleccion'))
  expect(writes).toHaveBeenCalledOnce()
  expect((await repository.readSnapshot()).catalog.albums[0]?.title).toBe(
    'Eclipse corregido para navegar',
  )
})

test('guardar y salir con datos inválidos conserva editor y ruta', async () => {
  await edit()
  change('Título', '')
  fireEvent.click(screen.getByRole('button', { name: 'Biblioteca' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar y salir' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  expect(location.hash).toMatch(/\/editar$/)
  expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('')
  expect(screen.getByRole('textbox', { name: 'Título' })).toHaveFocus()
})

test('alta confirmada con lectura fallida conserva editor y sólo reintenta lectura', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Añadir álbum' }))
  change('Artista', 'Círculo Norte ficticio')
  change('Título', 'Umbral de prueba')
  const writes = vi.spyOn(repository, 'mutate')
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Lectura ficticia'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  const retry = await screen.findByRole('button', {
    name: 'Reintentar lectura del álbum',
  })
  await waitFor(() => expect(retry).toBeEnabled())
  expect(location.hash).toBe('#/anadir')
  expect(screen.getByRole('button', { name: 'Biblioteca' })).toBeDisabled()
  fireEvent.click(retry)
  await screen.findByRole('heading', { name: 'Umbral de prueba' })
  expect(writes).toHaveBeenCalledOnce()
})

test('entrada directa válida de Pages y ruta inexistente no borran datos', async () => {
  const before = await repository.readSnapshot()
  window.history.replaceState(
    null,
    '',
    '/Auditorium/#/album/' + before.library.userAlbums[0]!.id,
  )
  render(<App repository={repository} />)
  await screen.findByRole('heading', { name: 'Eclipse' })
  await act(async () => {
    window.location.hash = '#/pantalla-inexistente'
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(
    await screen.findByRole('heading', {
      name: 'No encontramos esta pantalla',
    }),
  ).toBeVisible()
  expect(await repository.readSnapshot()).toEqual(before)
  expect(location.pathname).toBe('/Auditorium/')
})

test('Mi colección separa medios sin cambiar adquisiciones ni deseos', async () => {
  const before = await repository.readSnapshot()
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Mi colección' }))
  const medium = screen.getByRole('combobox', { name: 'Medio de la colección' })
  fireEvent.change(medium, { target: { value: 'purchased_digital' } })
  expect(screen.getByText('No hay adquisiciones en esta vista.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Deseos de compra' }))
  expect(location.hash).toBe('#/opciones/deseos')
  expect(await repository.readSnapshot()).toEqual(before)
})

test('cancelar un ejemplar no descarta la experiencia pendiente del mismo álbum', async () => {
  const before = await repository.readSnapshot()
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Eclipse' }))
  change('Notas personales', 'Experiencia ficticia por conservar')
  fireEvent.click(screen.getByRole('button', { name: 'Registrar ejemplar' }))
  change('Notas del ejemplar', 'Ejemplar ficticio descartable')
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar registro' }))
  const dialog = screen.getByRole('dialog', { name: 'Cambios sin guardar' })
  expect(dialog).toHaveTextContent('Nuevo ejemplar')
  expect(dialog).not.toHaveTextContent('Escucha y notas personales')
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Descartar cambios' }),
  )
  expect(screen.getByRole('textbox', { name: 'Notas personales' })).toHaveValue(
    'Experiencia ficticia por conservar',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Recomendaciones' }))
  expect(dialog).toHaveTextContent('Escucha y notas personales')
  expect(dialog).not.toHaveTextContent('Nuevo ejemplar')
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Seguir editando' }),
  )
  expect(await repository.readSnapshot()).toEqual(before)
})
