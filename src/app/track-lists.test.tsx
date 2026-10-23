import { openAlbumArea, openExperience } from '../test/library-navigation'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  makeContext,
  makeLibrary,
  libraryIds,
  times,
} from '../domain/library/library.fixture'
import { createLibrarySchema } from '../domain/library/library'
import { ids } from '../domain/catalog/catalog.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { LocalStorageError } from '../infrastructure/db/errors'
import { MusicLibrary } from '../application/music-library'
import { trackListRows, trackListToken } from '../application/track-lists'
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
  const database = new AuditoriumDatabase('track-lists-ui', {
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
async function open() {
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
  render(<App repository={repository} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Eclipse' }))
  openAlbumArea('tracks')
  openExperience()
  return repository
}
function chooseDeluxe() {
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Lista que quieres consultar' }),
    { target: { value: ids.deluxe } },
  )
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
function editEdition() {
  chooseDeluxe()
  fireEvent.click(
    screen.getByRole('button', { name: 'Editar lista de edición' }),
  )
}
async function saved() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Editar lista de edición' }),
    ).toBeEnabled(),
  )
}

test('original y Deluxe comparten ficha, muestran variantes, orden y datos sin escribir', async () => {
  const repository = await open(),
    before = await repository.readSnapshot()
  expect(
    within(screen.getByRole('list', { name: 'Lista original' })).getAllByRole(
      'listitem',
    ),
  ).toHaveLength(3)
  chooseDeluxe()
  const edition = screen.getByRole('list', { name: 'Deluxe · Vinilo' })
  expect(within(edition).getAllByRole('listitem')).toHaveLength(4)
  expect(within(edition).getByText('Variante de Eclipse')).toBeVisible()
  expect(await repository.readSnapshot()).toEqual(before)
})

test('álbum sin listas permite registrar original antes de crear una edición', async () => {
  const repository = await open(),
    before = await repository.readSnapshot()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  fireEvent.click(screen.getByRole('button', { name: 'Otra órbita' }))
  fireEvent.click(screen.getByRole('button', { name: 'Editar lista original' }))
  fireEvent.click(screen.getByRole('button', { name: 'Añadir aparición' }))
  change('Título nuevo 1', 'Apertura ficticia')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar lista' }))
  await screen.findByRole('list', { name: 'Lista original' })
  const after = await repository.readSnapshot()
  expect(
    after.catalog.coreTracks.filter((row) => row.albumId === ids.otherAlbum),
  ).toHaveLength(1)
  expect(
    after.catalog.coreTracks.filter((row) => row.albumId === ids.album),
  ).toEqual(before.catalog.coreTracks)
  expect(after.catalog.releaseTracks).toEqual(before.catalog.releaseTracks)
  expect(after.library).toEqual(before.library)
})

test('edición confirmada con lectura fallida se recupera sin crear una segunda edición', async () => {
  const repository = await open(),
    before = await repository.readSnapshot()
  const create = vi.spyOn(MusicLibrary.prototype, 'addRelease')
  fireEvent.click(screen.getByRole('button', { name: 'Nueva edición' }))
  change('Nombre de edición', 'Edición confirmada ficticia')
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Fallo ficticio'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar edición' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'El cambio se guardó',
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar lectura de listas' }),
  )
  await saved()
  expect(create).toHaveBeenCalledTimes(1)
  expect((await repository.readSnapshot()).catalog.releases).toHaveLength(
    before.catalog.releases.length + 1,
  )
})

test('crear edición copia original y permite metadatos incompletos sin duplicar álbum', async () => {
  const repository = await open(),
    before = await repository.readSnapshot()
  // IDs de aparición en orden inverso: el array físico no define la lista.
  vi.spyOn(globalThis.crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000900')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000903')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000902')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000901')
  fireEvent.click(screen.getByRole('button', { name: 'Nueva edición' }))
  change('Nombre de edición', 'Deluxe ficticia')
  change('Formato de edición', 'cd')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar edición' }))
  await screen.findByRole('list', { name: 'Deluxe ficticia · CD' })
  const after = await repository.readSnapshot(),
    release = after.catalog.releases.at(-1)!
  expect(release).not.toHaveProperty('releaseYear')
  expect(
    trackListRows(after.catalog, ids.album, release.id).map((row) => ({
      trackId: row.trackId,
      discNumber: row.discNumber,
      trackNumber: row.trackNumber,
    })),
  ).toEqual(
    trackListRows(before.catalog, ids.album).map((row) => ({
      trackId: row.trackId,
      discNumber: row.discNumber,
      trackNumber: row.trackNumber,
    })),
  )
  expect(after.catalog.albums).toEqual(before.catalog.albums)
  expect(after.library).toEqual(before.library)
})

test('edición vacía sin copiar original y año inválido conserva formulario', async () => {
  const repository = await open(),
    before = await repository.readSnapshot()
  fireEvent.click(screen.getByRole('button', { name: 'Nueva edición' }))
  change('Año de edición', '10000')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar edición' }))
  await screen.findByRole('alert')
  expect(await repository.readSnapshot()).toEqual(before)
  expect(screen.getByLabelText('Año de edición')).toHaveValue(10000)
  change('Año de edición', '')
  fireEvent.click(screen.getByLabelText('Copiar lista original'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar edición' }))
  await screen.findByText('Edición guardada dentro de este álbum.')
  await saved()
  expect(screen.getByText('Esta lista aún no tiene pistas.')).toBeVisible()
})

test('reordenar Deluxe y añadir bonus variante conserva CoreTrack, IDs compartidos y ratings', async () => {
  const repository = await open(),
    before = await repository.readSnapshot()
  editEdition()
  change('Posición 1', '2')
  change('Posición 2', '1')
  fireEvent.click(screen.getByRole('button', { name: 'Añadir aparición' }))
  change('Título nuevo 5', 'Otra demo ficticia')
  change('Variante de 5', ids.eclipse)
  change('Versión 5', 'Demo alternativa')
  change('Contenido 5', 'bonus')
  change('Duración (m:ss) 5', '3:45.123')
  change('Disco 5', '2')
  change('Posición 5', '1')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar lista' }))
  await saved()
  expect(screen.getByText('Otra demo ficticia')).toBeVisible()
  const after = await repository.readSnapshot()
  expect(after.catalog.coreTracks).toEqual(before.catalog.coreTracks)
  expect(
    after.catalog.releaseTracks.filter((row) => row.releaseId === ids.original),
  ).toEqual(
    before.catalog.releaseTracks.filter(
      (row) => row.releaseId === ids.original,
    ),
  )
  expect(after.library).toEqual(before.library)
  expect(after.catalog.tracks.at(-1)).toMatchObject({
    variantOfTrackId: ids.eclipse,
    versionLabel: 'Demo alternativa',
  })
  expect(after.catalog.releaseTracks.at(-1)).toMatchObject({
    durationMs: 225123,
  })
  chooseDeluxe()
  expect(
    within(screen.getByRole('list', { name: 'Deluxe · Vinilo' })).getAllByRole(
      'listitem',
    )[0],
  ).toHaveTextContent('Eclipse')
})

test('posiciones repetidas muestran error enfocado y conservan borrador; corrección guarda', async () => {
  const repository = await open(),
    before = await repository.readSnapshot()
  editEdition()
  change('Posición 1', '2')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar lista' }))
  const alert = await screen.findByRole('alert')
  await waitFor(() => expect(alert).toHaveFocus())
  expect(screen.getByLabelText('Posición 1')).toHaveValue(2)
  expect(await repository.readSnapshot()).toEqual(before)
  change('Posición 2', '1')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar lista' }))
  await saved()
})

test('quota al guardar conserva lista y borrador; reintento no pierde texto', async () => {
  const repository = await open(),
    before = await repository.readSnapshot()
  editEdition()
  change('Título en esta edición 1', 'Título ficticio conservado')
  const failure = vi
    .spyOn(databases[0]!.releaseTracks, 'bulkPut')
    .mockRejectedValue(new DOMException('Quota ficticia', 'QuotaExceededError'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar lista' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
  expect(screen.getByLabelText('Título en esta edición 1')).toHaveValue(
    'Título ficticio conservado',
  )
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar lista' }))
  await saved()
  expect(screen.getByText('Título ficticio conservado')).toBeVisible()
})

test('fallo de lectura tras commit bloquea navegación y reintenta solo lectura', async () => {
  const repository = await open()
  const save = vi.spyOn(MusicLibrary.prototype, 'saveTrackList')
  editEdition()
  change('Título en esta edición 1', 'Guardado ficticio')
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Fallo ficticio'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Guardar lista' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'El cambio se guardó',
  )
  expect(
    screen.getByRole('button', { name: 'Guardar experiencia' }),
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Volver a biblioteca' }),
  ).toBeDisabled()
  const retry = screen.getByRole('button', {
    name: 'Reintentar lectura de listas',
  })
  await waitFor(() => expect(retry).toHaveFocus())
  fireEvent.click(retry)
  await saved()
  expect(save).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Guardado ficticio')).toBeVisible()
})

test('otra conexión no se sobrescribe; cargar explícitamente descarta borrador y permite editar', async () => {
  const repository = await open()
  editEdition()
  change('Título en esta edición 1', 'Borrador ficticio local')
  const peer = new MusicLibrary(connect()),
    snapshot = await repository.readSnapshot()
  const rows = snapshot.catalog.releaseTracks.filter(
    (row) => row.releaseId === ids.deluxe,
  )
  await peer.saveTrackList({
    albumId: ids.album,
    releaseId: ids.deluxe,
    expected: trackListToken(snapshot.catalog, ids.album, ids.deluxe),
    rows: rows.map((row) => ({
      trackId: row.trackId,
      occurrenceId: row.id,
      discNumber: row.discNumber,
      trackNumber: row.trackNumber,
      contentRole: row.contentRole,
      displayTitleOverride: 'Texto ficticio remoto',
    })),
  })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar lista' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Esta lista cambió',
  )
  expect(screen.getByLabelText('Título en esta edición 1')).toHaveValue(
    'Borrador ficticio local',
  )
  expect(screen.getByRole('button', { name: 'Guardar lista' })).toBeDisabled()
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Fallo ficticio'),
  )
  const load = screen.getByRole('button', {
    name: 'Descartar borrador y cargar lista guardada',
  })
  fireEvent.click(load)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No se pudo cargar',
  )
  expect(screen.getByLabelText('Título en esta edición 1')).toHaveValue(
    'Borrador ficticio local',
  )
  fireEvent.click(load)
  await saved()
  fireEvent.click(
    screen.getByRole('button', { name: 'Editar lista de edición' }),
  )
  expect(screen.getByLabelText('Título en esta edición 1')).toHaveValue(
    'Texto ficticio remoto',
  )
})

test('doble envío escribe una vez; valoración no puede escribir simultáneamente', async () => {
  const repository = await open()
  editEdition()
  change('Título en esta edición 1', 'Cambio ficticio')
  const save = vi.spyOn(MusicLibrary.prototype, 'saveTrackList'),
    rate = vi.spyOn(MusicLibrary.prototype, 'rateAlbum')
  const form = screen
    .getByRole('button', { name: 'Guardar lista' })
    .closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(save).toHaveBeenCalledTimes(1)
  expect(
    screen.getByRole('button', { name: 'Guardar experiencia' }),
  ).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  expect(rate).not.toHaveBeenCalled()
  await saved()
  expect(
    (await repository.readSnapshot()).catalog.releaseTracks.find(
      (row) => row.releaseId === ids.deluxe,
    )?.displayTitleOverride,
  ).toBe('Cambio ficticio')
})

test('quitar aparición y descartar borrador no escriben; refresco de rating preserva borrador', async () => {
  const repository = await open(),
    before = await repository.readSnapshot()
  fireEvent.click(screen.getByRole('button', { name: 'Editar lista original' }))
  fireEvent.click(screen.getByRole('button', { name: 'Quitar aparición 1' }))
  expect(screen.getByLabelText('Pista a utilizar 1')).toHaveValue(ids.eclipse)
  expect(await repository.readSnapshot()).toEqual(before)
  fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador' }))
  expect(
    screen.getByRole('list', { name: 'Lista original' }),
  ).toHaveTextContent('Overture')
  editEdition()
  change('Título en esta edición 1', 'Borrador ficticio')
  change('Nota del álbum', '8')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar experiencia' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Guardar experiencia' }),
    ).toBeEnabled(),
  )
  expect(screen.getByLabelText('Título en esta edición 1')).toHaveValue(
    'Borrador ficticio',
  )
})
