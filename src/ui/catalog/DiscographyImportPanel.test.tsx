import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DiscographyImportPanel } from './DiscographyImportPanel'
import type {
  DiscographyAlbum,
  DiscographyCatalog,
  DiscographyPage,
} from '../../application/discography-catalog'
import { makeBackup } from '../../domain/backup.fixture'
import { fixtureId } from '../../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../../domain/library/library.fixture'
import { AuditoriumDatabase } from '../../infrastructure/db/database'
import { IndexedDbRepository } from '../../infrastructure/repositories/indexeddb-repository'

const artist = { id: fixtureId(9000), name: 'Banda Ficticia' }
const first: DiscographyAlbum = {
  id: fixtureId(9001),
  title: 'Primer Horizonte',
  primaryType: 'Album',
  secondaryTypes: [],
  firstReleaseDate: '2001',
  artists: [artist],
}
const live = {
  ...first,
  id: fixtureId(9002),
  title: 'Horizonte en Vivo',
  secondaryTypes: ['Live'],
}
const second = {
  ...first,
  id: fixtureId(9003),
  title: 'Segundo Horizonte',
  firstReleaseDate: '2002',
}
let database: AuditoriumDatabase
beforeEach(() => {
  database = new AuditoriumDatabase('discography-ui', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  database.close()
  await database.delete()
})
async function setup(
  overrides: Partial<DiscographyCatalog> = {},
  failRead = false,
) {
  const repository = new IndexedDbRepository({
    database,
    createId: () => libraryIds.user,
    now: () => new Date(times.added),
  })
  await repository.mutate(() => ({
    snapshot: makeBackup().data,
    result: undefined,
  }))
  const before = await repository.readSnapshot()
  const client: DiscographyCatalog = {
    available: true,
    searchArtists: vi.fn(() => Promise.resolve([artist])),
    browseAlbums: vi.fn((_, offset) =>
      Promise.resolve(
        offset
          ? { albums: [second], total: 3 }
          : { albums: [first, live], total: 3, nextOffset: 2 },
      ),
    ),
    ...overrides,
  }
  const onImported = vi.fn(),
    onCommitted = vi.fn(() => repository.readSnapshot())
  if (failRead)
    onCommitted.mockRejectedValueOnce(new Error('Fallo de lectura de prueba'))
  render(
    <DiscographyImportPanel
      snapshot={before}
      repository={repository}
      client={client}
      onImported={onImported}
      onCommitted={onCommitted}
      onBusyChange={vi.fn()}
    />,
  )
  return { repository, before, client, onImported, onCommitted }
}
async function findArtist() {
  fireEvent.change(screen.getByLabelText('Banda o artista'), {
    target: { value: 'Banda Ficticia' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar artista' }))
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Ver discografía de Banda Ficticia',
    }),
  )
  await screen.findByRole('checkbox', { name: /Primer Horizonte/ })
}
test('buscar, paginar y revisar no escriben; confirmar incorpora sólo los discos elegidos en distintos filtros', async () => {
  const { repository, before, onImported } = await setup()
  await findArtist()
  expect(
    screen.queryByRole('checkbox', { name: /Horizonte en Vivo/ }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: /Primer Horizonte/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Cargar más obras' }))
  fireEvent.click(
    await screen.findByRole('checkbox', { name: /Segundo Horizonte/ }),
  )
  fireEvent.change(screen.getByLabelText('Mostrar'), {
    target: { value: 'live' },
  })
  expect(screen.getByText(/incluye otros filtros/)).toBeInTheDocument()
  expect(await repository.readSnapshot()).toEqual(before)
  fireEvent.click(screen.getByRole('button', { name: 'Revisar importación' }))
  await screen.findByRole('heading', { name: 'Confirma tu selección' })
  expect(await repository.readSnapshot()).toEqual(before)
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }))
  await waitFor(() =>
    expect(onImported).toHaveBeenCalledWith({ added: 2, linked: 0 }),
  )
  const after = await repository.readSnapshot()
  expect(
    after.catalog.albums
      .filter((row) => row.musicBrainz)
      .map((row) => row.title)
      .sort(),
  ).toEqual(['Primer Horizonte', 'Segundo Horizonte'])
  expect(after.library.ownedItems).toEqual(before.library.ownedItems)
})
test('un fallo de lectura después del commit sólo reintenta leer y nunca duplica la escritura', async () => {
  const { repository, onImported, onCommitted } = await setup({}, true)
  await findArtist()
  fireEvent.click(screen.getByRole('checkbox', { name: /Primer Horizonte/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Revisar importación' }))
  await screen.findByRole('heading', { name: 'Confirma tu selección' })
  const mutation = vi.spyOn(repository, 'mutate')
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }))
  await screen.findByText(/La importación se guardó, pero/)
  expect(
    screen.getByRole('button', { name: 'Confirmar importación' }),
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Reintentar lectura tras importación' }),
  )
  await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1))
  expect(onCommitted).toHaveBeenCalledTimes(2)
  expect(mutation).toHaveBeenCalledTimes(1)
})
test('cancelar una consulta descarta respuestas tardías y no escribe datos', async () => {
  let resolve!: (page: DiscographyPage) => void
  const { repository, before } = await setup({
    browseAlbums: () =>
      new Promise((done) => {
        resolve = done
      }),
  })
  fireEvent.change(screen.getByLabelText('Banda o artista'), {
    target: { value: 'Banda Ficticia' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar artista' }))
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Ver discografía de Banda Ficticia',
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar consulta' }))
  resolve({ albums: [first], total: 1 })
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Consulta cancelada'),
  )
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(await repository.readSnapshot()).toEqual(before)
})
