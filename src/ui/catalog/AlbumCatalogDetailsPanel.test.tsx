import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type {
  EditionCatalog,
  EditionDetails,
} from '../../application/edition-catalog'
import type { TransactionalLocalRepository } from '../../domain/repositories/local-repository'
import { makeBackup } from '../../domain/backup.fixture'
import { fixtureId, ids } from '../../domain/catalog/catalog.fixture'
import { AlbumCatalogDetailsPanel } from './AlbumCatalogDetailsPanel'

afterEach(cleanup)
const source: EditionDetails = {
  id: fixtureId(9000),
  groupId: fixtureId(9001),
  title: 'Eclipse',
  formats: ['CD'],
  trackCount: 1,
  completeTracks: true,
  tracks: [{ title: 'Pista ficticia', discNumber: 1, trackNumber: 1 }],
}
function setup(details: EditionCatalog['edition']) {
  const snapshot = makeBackup().data
  snapshot.catalog.albums.find((row) => row.id === ids.album)!.musicBrainz = {
    id: source.groupId,
    retrievedAt: '2026-11-16T12:00:00.000Z',
  }
  const mutate = vi.fn()
  const repository: TransactionalLocalRepository = {
    open: () => Promise.resolve(snapshot.identity),
    readSnapshot: () => Promise.resolve(structuredClone(snapshot)),
    close: () => {},
    mutate: () => {
      mutate()
      return Promise.reject(new Error('Unexpected write during preview'))
    },
  }
  const client: EditionCatalog = {
    available: true,
    browseEditions: vi.fn(() =>
      Promise.resolve({ editions: [source], total: 1 }),
    ),
    edition: details,
  }
  render(
    <AlbumCatalogDetailsPanel
      albumId={ids.album}
      snapshot={snapshot}
      repository={repository}
      client={client}
      onBusyChange={vi.fn()}
      onCommitted={() => Promise.resolve(snapshot)}
      onArtist={vi.fn()}
    />,
  )
  return { client, mutate }
}
test('cancelar una consulta descarta una respuesta tardía y no prepara ni escribe una edición', async () => {
  let resolve!: (value: EditionDetails) => void
  const pending = new Promise<EditionDetails>((done) => {
    resolve = done
  })
  const details = vi.fn<EditionCatalog['edition']>(() => pending)
  const { mutate } = setup(details)
  fireEvent.click(
    screen.getByRole('button', { name: 'Buscar ediciones y pistas' }),
  )
  fireEvent.click(
    await screen.findByRole('button', { name: 'Revisar edición' }),
  )
  const signal = details.mock.calls[0]![1]
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar consulta' }))
  expect(signal.aborted).toBe(true)
  await act(() => {
    resolve(source)
    return pending
  })
  expect(screen.queryByRole('heading', { name: 'Revisar Eclipse' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Revisar edición' })).toBeEnabled()
  expect(mutate).not.toHaveBeenCalled()
})
test('una respuesta de otra obra se rechaza antes de ofrecer confirmación o escritura', async () => {
  const { mutate } = setup(() =>
    Promise.resolve({ ...source, groupId: fixtureId(9999) }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Buscar ediciones y pistas' }),
  )
  fireEvent.click(
    await screen.findByRole('button', { name: 'Revisar edición' }),
  )
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No pudimos consultar las ediciones',
    ),
  )
  expect(
    screen.queryByRole('button', { name: 'Revisar datos para guardar' }),
  ).toBeNull()
  expect(mutate).not.toHaveBeenCalled()
})
