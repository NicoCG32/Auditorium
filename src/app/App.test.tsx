import {
  openLibraryOptions,
  openAlbumArea,
  openExperience,
} from '../test/library-navigation'
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
  BackupLocalRepository,
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
  fireEvent.click(screen.getByText('Detalles del álbum (opcionales)'))
}
function fillAlbum(artist = 'Umbral Ficticio', title = 'Eclipse Nuevo') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Artista' }), {
    target: { value: artist },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
    target: { value: title },
  })
  const homonym = screen.queryByRole('radio', {
    name: 'Es otro artista con este nombre (crear uno nuevo)',
  })
  if (homonym) fireEvent.click(homonym)
}

test('un conflicto al reutilizar un álbum permite actualizar coincidencias conservando los enlaces preparados', async () => {
  const repository = await populated()
  const before = await repository.readSnapshot()
  await openAlbumForm(repository)
  fillAlbum('UMBRAL ELECTRICO', 'ECLIPSE')
  fireEvent.click(screen.getByRole('button', { name: 'Añadir enlace' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'URL del enlace 1' }), {
    target: { value: 'https://servicio.example/album/nuevo' },
  })
  await repository.mutate((snapshot) => {
    const entry = snapshot.library.userAlbums.find(
      (row) => row.id === libraryIds.entry,
    )!
    entry.links = [
      {
        id: '00000000-0000-4000-8000-000000032222',
        purpose: 'playback',
        url: 'https://servicio.example/album/anterior',
        createdAt: entry.addedAt,
        updatedAt: entry.updatedAt,
      },
    ]
    return { snapshot, result: undefined }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Usar este álbum y añadir mis enlaces',
    }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'enlaces del álbum seleccionado cambiaron',
  )
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Actualizar coincidencias conservando formulario',
    }),
  )
  await screen.findByText(/Datos actualizados. Tu formulario se conserva/)
  expect(screen.getByRole('textbox', { name: 'URL del enlace 1' })).toHaveValue(
    'https://servicio.example/album/nuevo',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Usar este álbum y añadir mis enlaces',
    }),
  )
  await screen.findByRole('button', { name: 'Volver a biblioteca' })
  const after = await repository.readSnapshot()
  expect(after.catalog).toEqual(before.catalog)
  expect(
    after.library.userAlbums.find((row) => row.id === libraryIds.entry)!.links,
  ).toHaveLength(2)
  expect(after.library.albumRatings).toEqual(before.library.albumRatings)
})

async function openRating(repository: IndexedDbRepository) {
  render(<App repository={repository} />)
  const button = await screen.findByRole('button', { name: 'Eclipse' })
  fireEvent.click(button)
  openExperience()
  return screen.getByRole('textbox', { name: 'Nota del álbum' })
}

function changeExperience(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
function saveExperience() {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
}
async function experienceSaved() {
  await screen.findByText('Experiencia guardada.')
  expect(
    screen.queryByRole('button', { name: 'Guardar experiencia' }),
  ).not.toBeInTheDocument()
}

test('la ficha prioriza consulta y experiencia sin formularios secundarios abiertos', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  render(<App repository={repository} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Eclipse' }))
  expect(
    screen.getByRole('button', { name: 'Recalificar álbum' }),
  ).toBeVisible()
  expect(
    screen.queryByRole('textbox', { name: 'Nota del álbum' }),
  ).not.toBeInTheDocument()
  for (const area of ['data', 'tracks', 'collection', 'actions']) {
    expect(
      document.querySelector('details[data-album-area="' + area + '"]'),
    ).not.toHaveAttribute('open')
  }
  expect(await repository.readSnapshot()).toEqual(before)
})

test('escucha, comentario, nota y referencia se guardan una vez y sobreviven la reapertura', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await openRating(repository)
  const save = vi.spyOn(MusicLibrary.prototype, 'saveAlbumExperience')
  changeExperience('Estado de escucha', 'completed')
  changeExperience('Notas personales', '  Recuerdo ficticio.\nOtra línea.  ')
  changeExperience('Nota del álbum', '8,5')
  changeExperience('Edición de referencia', ids.deluxe)
  saveExperience()
  await experienceSaved()
  expect(save).toHaveBeenCalledTimes(1)
  const after = await repository.readSnapshot()
  expect(after.catalog).toEqual(before.catalog)
  expect(after.library.trackRatings).toEqual(before.library.trackRatings)
  expect(
    after.library.albumRatings.find((r) => r.userAlbumId === libraryIds.entry),
  ).toMatchObject({ scoreUnits: 17, referenceReleaseId: ids.deluxe })
  openExperience()
  expect(screen.getByLabelText('Notas personales')).toHaveValue(
    '  Recuerdo ficticio.\nOtra línea.  ',
  )
  expect(screen.getByLabelText('Nota del álbum')).toHaveValue('8,5')
  expect(screen.getByLabelText('Edición de referencia')).toHaveValue(ids.deluxe)
  repository.close()
  expect(await connect().readSnapshot()).toEqual(after)
})

test('cambiar sólo escucha y comentario conserva exactamente la nota y las pistas', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await openRating(repository)
  changeExperience('Estado de escucha', 'completed')
  changeExperience('Notas personales', '')
  saveExperience()
  await experienceSaved()
  const after = await repository.readSnapshot()
  expect(after.library.albumRatings).toEqual(before.library.albumRatings)
  expect(after.library.trackRatings).toEqual(before.library.trackRatings)
  expect(after.library.userAlbums[0]?.personalNotes).toBeUndefined()
})

test('quitar nota es reversible en el borrador y sólo guardar quita nota y referencia', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  await openRating(repository)
  fireEvent.click(
    screen.getByRole('button', { name: 'Quitar nota del borrador' }),
  )
  expect(screen.getByLabelText('Nota del álbum')).toHaveValue('')
  expect(screen.getByLabelText('Edición de referencia')).toBeDisabled()
  expect(await repository.readSnapshot()).toEqual(before)
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar experiencia' }))
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
  openExperience()
  expect(screen.getByLabelText('Nota del álbum')).toHaveValue('9,5')
  fireEvent.click(
    screen.getByRole('button', { name: 'Quitar nota del borrador' }),
  )
  saveExperience()
  await experienceSaved()
  const after = await repository.readSnapshot()
  expect(after.library.albumRatings).toEqual(
    before.library.albumRatings.filter(
      (r) => r.userAlbumId !== libraryIds.entry,
    ),
  )
  expect(after.library.trackRatings).toEqual(before.library.trackRatings)
  expect(after.library.ownedItems).toEqual(before.library.ownedItems)
  expect(after.library.userAlbums[0]?.personalNotes).toBe(
    before.library.userAlbums[0]?.personalNotes,
  )
})

test.each(['0', '9,3', '10,5'])(
  'una nota inválida %s no guarda ninguna parte de la experiencia',
  async (value) => {
    const repository = await populated(),
      before = await repository.readSnapshot()
    await openRating(repository)
    changeExperience('Nota del álbum', value)
    changeExperience('Notas personales', 'No guardar parcialmente')
    saveExperience()
    expect(screen.getByRole('alert')).toHaveTextContent('pasos de 0,5')
    expect(screen.getByLabelText('Nota del álbum')).toHaveFocus()
    expect(await repository.readSnapshot()).toEqual(before)
  },
)

test.each(['guardar', 'quitar'])(
  'cuota al %s conserva todos los datos y permite reintentar',
  async (action) => {
    const repository = await populated(),
      before = await repository.readSnapshot()
    await openRating(repository)
    if (action === 'quitar')
      fireEvent.click(
        screen.getByRole('button', { name: 'Quitar nota del borrador' }),
      )
    else changeExperience('Nota del álbum', '10')
    changeExperience('Notas personales', 'Borrador conservado')
    vi.spyOn(
      databases[0]!.albumRatings,
      action === 'quitar' ? 'bulkDelete' : 'bulkPut',
    ).mockRejectedValueOnce(new DOMException('Ficticio', 'QuotaExceededError'))
    saveExperience()
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
    expect(screen.getByLabelText('Notas personales')).toHaveValue(
      'Borrador conservado',
    )
    expect(await repository.readSnapshot()).toEqual(before)
    saveExperience()
    await experienceSaved()
  },
)

test('lectura fallida tras commit bloquea editores y reintenta sólo lectura', async () => {
  const repository = await populated()
  await openRating(repository)
  const save = vi.spyOn(MusicLibrary.prototype, 'saveAlbumExperience')
  changeExperience('Nota del álbum', '10')
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Ficticio'),
  )
  saveExperience()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'La experiencia se guardó',
  )
  expect(
    screen.getByRole('button', { name: 'Guardar experiencia' }),
  ).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Editar álbum' })).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar lectura de experiencia' }),
  )
  await experienceSaved()
  expect(save).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('heading', { name: 'Eclipse' })).toHaveFocus()
})

test('otra pestaña no pierde su experiencia; recargar requiere acción explícita y conserva borrador ante error', async () => {
  const repository = await populated()
  await openRating(repository)
  changeExperience('Notas personales', 'Borrador ficticio')
  await new MusicLibrary(connect()).rateAlbum(libraryIds.entry, 10)
  saveExperience()
  expect(await screen.findByRole('alert')).toHaveTextContent('cambió')
  expect(screen.getByLabelText('Notas personales')).toHaveValue(
    'Borrador ficticio',
  )
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Ficticio'),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Cargar datos guardados' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No se pudieron cargar',
  )
  expect(screen.getByLabelText('Notas personales')).toHaveValue(
    'Borrador ficticio',
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
  expect(screen.getByLabelText('Nota del álbum')).toHaveValue('10')
})

test('doble envío sólo ejecuta una transacción', async () => {
  const repository = await populated(),
    input = await openRating(repository)
  const save = vi.spyOn(MusicLibrary.prototype, 'saveAlbumExperience')
  fireEvent.change(input, { target: { value: '10' } })
  fireEvent.submit(input.closest('form')!)
  fireEvent.submit(input.closest('form')!)
  await experienceSaved()
  expect(save).toHaveBeenCalledTimes(1)
})

test('cambiar de álbum permite descartar y carga su propia experiencia', async () => {
  const repository = await populated(),
    before = await repository.readSnapshot()
  const input = await openRating(repository)
  fireEvent.change(input, { target: { value: '1,5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
  fireEvent.click(screen.getByRole('button', { name: 'Otra órbita' }))
  openExperience()
  expect(screen.getByLabelText('Nota del álbum')).toHaveValue('8')
  expect(await repository.readSnapshot()).toEqual(before)
})

test('portada automática y datos plegables permiten consultar sin escribir', async () => {
  const repository = await populated()
  await repository.mutate((snapshot) => {
    snapshot.catalog.albums[0] = {
      ...snapshot.catalog.albums[0]!,
      description: 'Descripción ficticia.',
      coverUrl: 'https://example.invalid/portada.svg',
    }
    return { snapshot, result: undefined }
  })
  await openRating(repository)
  expect(
    screen.getByRole('img', { name: 'Portada de Eclipse' }),
  ).toHaveAttribute('src', 'https://example.invalid/portada.svg')
  openAlbumArea('data')
  expect(screen.getByText('Descripción ficticia.')).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Abrir enlace de portada' }),
  ).toHaveAttribute('href', 'https://example.invalid/portada.svg')
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
  expect(
    await screen.findByRole('heading', { name: 'Eclipse Nuevo' }),
  ).toHaveFocus()
  const snapshot = await repository.readSnapshot()
  expect(snapshot.catalog.albums[0]?.primaryType).toBe('unspecified')
  expect(snapshot.catalog.albums[0]).not.toHaveProperty('originalYear')
  expect(snapshot.library.userAlbums).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  expect(screen.getByRole('button', { name: 'Eclipse Nuevo' })).toBeVisible()
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
  fireEvent.change(screen.getByLabelText('Tipo principal'), {
    target: { value: 'ep' },
  })
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
    'Eclipse Nuevo',
  )
  fireEvent.change(screen.getByLabelText('Año original'), {
    target: { value: '1998' },
  })
  fireEvent.change(screen.getByLabelText('Descripción del álbum'), {
    target: { value: 'Descripción ficticia' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('heading', { name: 'Eclipse Nuevo' })
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  await screen.findByRole('button', { name: 'Eclipse Nuevo' })
  expect((await repository.readSnapshot()).catalog.albums[0]).toMatchObject({
    primaryType: 'ep',
    categories: [],
    publicationStatus: 'unknown' as const,
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
    name: 'Coincidencias en tu catálogo local',
  })
  await waitFor(() =>
    expect(
      screen.getByRole('heading', {
        name: 'Coincidencias en tu catálogo local',
      }),
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
  await screen.findByRole('heading', { name: 'Eclipse' })
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  await screen.findByRole('searchbox')
  expect((await repository.readSnapshot()).catalog.albums).toHaveLength(3)
  expect((await repository.readSnapshot()).catalog.artists).toHaveLength(2)
})

test('elige un artista existente por referencia al crear una obra distinta', async () => {
  const repository = await populated()
  await openAlbumForm(repository)
  fillAlbum('Umbral Eléctrico', 'Nueva Órbita')
  fireEvent.click(screen.getByRole('radio', { name: /^Usar Umbral Eléctrico/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('heading', { name: 'Nueva Órbita' })
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  await screen.findByRole('button', { name: 'Nueva Órbita' })
  expect((await repository.readSnapshot()).catalog.artists).toHaveLength(1)
})

test('añadir un álbum del catálogo crea solo la relación y abre su ficha', async () => {
  const repository = connect()
  await new MusicLibrary(repository).createAlbum({
    title: 'Solo Catálogo',
    artists: [{ name: 'Umbral Ficticio' }],
    addToLibrary: false,
  })
  const before = await repository.readSnapshot()
  await openAlbumForm(repository)
  fillAlbum('Umbral Ficticio', 'Solo Catálogo')
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
    'Eclipse Nuevo',
  )
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar álbum' }))
  await screen.findByRole('heading', { name: 'Eclipse Nuevo' })
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  await screen.findByRole('button', { name: 'Eclipse Nuevo' })
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
  await screen.findByRole('heading', { name: 'Eclipse Nuevo' })
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  await screen.findByRole('button', { name: 'Eclipse Nuevo' })
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
  expect(screen.getByRole('alert')).toHaveTextContent('El álbum se guardó')
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar lectura del álbum' }),
  )
  await screen.findByRole('heading', { name: 'Eclipse Nuevo' })
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  await screen.findByRole('button', { name: 'Eclipse Nuevo' })
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
  openLibraryOptions()
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
  const slow: BackupLocalRepository = {
    open: vi.fn(),
    readSnapshot: () => promise,
    close: vi.fn(),
    mutate: vi.fn(),
    restoreEmpty: vi.fn(),
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
