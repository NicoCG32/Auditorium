import { openAlbumArea, openExperience } from '../test/library-navigation'
import { openLibraryFilters } from '../test/library-navigation'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from './App'
import { MusicLibrary } from '../application/music-library'
import {
  buildAlbumEditExpected,
  updateAlbumInputSchema,
} from '../application/album-edit'
import { makeBackup } from '../domain/backup.fixture'
import { libraryIds, times } from '../domain/library/library.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { LocalStorageError } from '../infrastructure/db/errors'

let database: AuditoriumDatabase
let repository: IndexedDbRepository
beforeEach(async () => {
  database = new AuditoriumDatabase('album-editor-ui', {
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
async function edit() {
  render(<App repository={repository} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Eclipse' }))
  fireEvent.click(screen.getByRole('button', { name: 'Editar álbum' }))
  expect(screen.getByRole('heading', { name: 'Editar álbum' })).toHaveFocus()
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: label }), {
    target: { value },
  })
}
test('editar y guardar corrige metadatos, conserva relaciones y permite filtrar por género y origen', async () => {
  const before = await repository.readSnapshot()
  await edit()
  change('Título', 'Eclipse Corregido')
  change('Géneros (separados por comas)', 'Metal, Progresivo, metal')
  change('País de origen 1', 'Chile')
  change('Año original', '2001')
  fireEvent.click(
    screen.getByRole('button', { name: 'Guardar cambios del álbum' }),
  )
  await screen.findByText('Datos del álbum guardados.')
  expect(
    screen.getByRole('heading', { name: 'Eclipse Corregido' }),
  ).toBeVisible()
  openAlbumArea('data')
  expect(screen.getByText('Metal · Progresivo')).toBeVisible()
  const after = await repository.readSnapshot()
  expect(after.library).toEqual(before.library)
  expect(after.catalog.albumArtists).toEqual(before.catalog.albumArtists)
  expect(after.catalog.releases).toEqual(before.catalog.releases)
  expect(after.catalog.tracks).toEqual(before.catalog.tracks)
  expect(
    after.catalog.albums.find((album) => album.title === 'Eclipse Corregido'),
  ).toMatchObject({
    id: before.catalog.albums[0]!.id,
    genres: ['Metal', 'Progresivo'],
    originalYear: 2001,
  })
  fireEvent.click(screen.getByRole('button', { name: 'Volver a biblioteca' }))
  openLibraryFilters()
  fireEvent.change(screen.getByRole('combobox', { name: 'Género' }), {
    target: { value: 'metal' },
  })
  openLibraryFilters()
  fireEvent.change(screen.getByRole('combobox', { name: 'País de origen' }), {
    target: { value: 'chile' },
  })
  expect(
    screen.getByRole('button', { name: 'Eclipse Corregido' }),
  ).toBeVisible()
})
test('cambiar de editor permite conservar el borrador o guardarlo antes de editar metadatos', async () => {
  const before = await repository.readSnapshot()
  render(<App repository={repository} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Eclipse' }))
  openExperience()
  change('Notas personales', 'Borrador ficticio por guardar')
  fireEvent.click(screen.getByRole('button', { name: 'Editar álbum' }))
  expect(
    screen.getByRole('dialog', { name: 'Cambios sin guardar' }),
  ).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
  expect(screen.getByRole('textbox', { name: 'Notas personales' })).toHaveValue(
    'Borrador ficticio por guardar',
  )
  expect(await repository.readSnapshot()).toEqual(before)
  fireEvent.click(screen.getByRole('button', { name: 'Editar álbum' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar y salir' }))
  await screen.findByRole('textbox', { name: 'Título' })
  change('Título', 'Edición que se cancela')
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }))
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
  expect(screen.getByRole('heading', { name: 'Eclipse' })).toBeVisible()
  expect(screen.getByText('Borrador ficticio por guardar')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Eclipse' })).toHaveFocus()
  const after = await repository.readSnapshot()
  expect(after.catalog).toEqual(before.catalog)
  expect(after.library.userAlbums[0]?.personalNotes).toBe(
    'Borrador ficticio por guardar',
  )
})
test('cuota mantiene álbum y borrador, reintentar guarda una sola edición', async () => {
  const before = await repository.readSnapshot()
  await edit()
  change('Título', 'Corrección tras cuota')
  const failure = vi
    .spyOn(database.albums, 'bulkPut')
    .mockRejectedValueOnce(
      new DOMException('Fallo ficticio', 'QuotaExceededError'),
    )
  fireEvent.click(
    screen.getByRole('button', { name: 'Guardar cambios del álbum' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
  expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue(
    'Corrección tras cuota',
  )
  expect(await repository.readSnapshot()).toEqual(before)
  failure.mockRestore()
  fireEvent.click(
    screen.getByRole('button', { name: 'Guardar cambios del álbum' }),
  )
  await screen.findByText('Datos del álbum guardados.')
  expect((await repository.readSnapshot()).catalog.albums).toHaveLength(
    before.catalog.albums.length,
  )
})
test('una lectura fallida después de commit bloquea navegación y reintenta sólo lectura', async () => {
  await edit()
  change('Título', 'Cambios confirmados')
  fireEvent.click(screen.getByRole('button', { name: 'Añadir enlace' }))
  change('URL del enlace 1', 'https://servicio.example/album/ficticio')
  const update = vi.spyOn(MusicLibrary.prototype, 'updateAlbum')
  vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
    new LocalStorageError('unexpected', 'Fallo ficticio'),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Guardar cambios del álbum' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Los cambios se guardaron',
  )
  expect(screen.getByRole('button', { name: 'Añadir álbum' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Cancelar edición' }),
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar lectura del álbum' }),
  )
  await screen.findByText('Datos del álbum guardados.')
  expect(update).toHaveBeenCalledTimes(1)
  const confirmed = await repository.readSnapshot()
  expect(
    confirmed.library.userAlbums.find((entry) => entry.id === libraryIds.entry)!
      .links,
  ).toHaveLength(1)
})
test('una corrección concurrente no se sobrescribe y cargar datos reemplaza el borrador explícitamente', async () => {
  await edit()
  const before = await repository.readSnapshot()
  const album = before.catalog.albums.find((row) => row.title === 'Eclipse')!
  const expected = buildAlbumEditExpected(before, album.id)
  const request = updateAlbumInputSchema.parse({
    ...Object.fromEntries(
      Object.entries(album).filter(
        ([key]) => !['id', 'catalogScope', 'createdBy'].includes(key),
      ),
    ),
    albumId: album.id,
    expected,
    title: 'Corrección Desde Otra Pestaña',
    artists: expected.credits.map((credit) => ({
      artistId: credit.artistId,
      name: expected.artists.find((artist) => artist.id === credit.artistId)!
        .name,
      role: credit.role,
    })),
  })
  await new MusicLibrary(repository).updateAlbum(request)
  change('Título', 'Mi borrador obsoleto')
  fireEvent.click(
    screen.getByRole('button', { name: 'Guardar cambios del álbum' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'cambiaron desde que abriste',
  )
  expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue(
    'Mi borrador obsoleto',
  )
  expect(
    screen.getByRole('button', { name: 'Guardar cambios del álbum' }),
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Cargar datos guardados del álbum' }),
  )
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue(
      'Corrección Desde Otra Pestaña',
    ),
  )
  expect(
    screen.getByRole('button', { name: 'Guardar cambios del álbum' }),
  ).toBeEnabled()
})

test('corregir el título conserva los géneros con separadores como etiquetas completas al capitalizar', async () => {
  await repository.mutate((snapshot) => {
    snapshot.catalog.albums.find((album) => album.title === 'Eclipse')!.genres =
      ['Rock, experimental', 'Jazz; fusión']
    return { snapshot, result: undefined }
  })
  await edit()
  change('Título', 'Título Corregido Sin Cambiar Géneros')
  fireEvent.click(
    screen.getByRole('button', { name: 'Guardar cambios del álbum' }),
  )
  await screen.findByText('Datos del álbum guardados.')
  expect(
    (await repository.readSnapshot()).catalog.albums.find(
      (album) => album.title === 'Título Corregido Sin Cambiar Géneros',
    )!.genres,
  ).toEqual(['Rock, Experimental', 'Jazz; Fusión'])
})

test('el país de un artista con varios roles se edita de forma coherente en todos sus créditos', async () => {
  await repository.mutate((snapshot) => {
    const credit = snapshot.catalog.albumArtists.find(
      (row) =>
        snapshot.catalog.albums.find((album) => album.id === row.albumId)
          ?.title === 'Eclipse',
    )!
    snapshot.catalog.albumArtists.push({
      ...credit,
      role: 'featured',
      position: 2,
    })
    return { snapshot, result: undefined }
  })
  await edit()
  change('País de origen 1', 'Chile')
  expect(screen.getByRole('textbox', { name: 'País de origen 2' })).toHaveValue(
    'Chile',
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Guardar cambios del álbum' }),
  )
  await screen.findByText('Datos del álbum guardados.')
  expect((await repository.readSnapshot()).catalog.artists[0]?.country).toBe(
    'Chile',
  )
})
