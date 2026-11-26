import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, test, vi } from 'vitest'
import { LocalCovers } from './LocalCovers'
import { CoverActivity } from './cover-context'
import { makeBackup } from '../../domain/backup.fixture'
import { fixtureId } from '../../domain/catalog/catalog.fixture'
import { AuditoriumDatabase } from '../../infrastructure/db/database'
import { IndexedDbRepository } from '../../infrastructure/repositories/indexeddb-repository'
import { AlbumCovers, type CoverProgress } from '../../application/album-covers'

afterEach(() => vi.restoreAllMocks())
function Receipt() {
  const [value, setValue] = useState('')
  return (
    <label>
      Recibo de la operación
      <input
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
    </label>
  )
}
function setup() {
  const database = new AuditoriumDatabase('cover-session', {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
  const repository = new IndexedDbRepository({ database })
  const snapshot = makeBackup().data
  const onCommitted = vi.fn(() => Promise.resolve(snapshot))
  const view = (data = snapshot) => (
    <LocalCovers
      repository={repository}
      snapshot={data}
      onCommitted={onCommitted}
    >
      <Receipt />
      <CoverActivity />
    </LocalCovers>
  )
  return { database, snapshot, onCommitted, view }
}
test('adoptar otra identidad conserva los formularios y recibos que rodean la búsqueda', () => {
  const { database, snapshot, view } = setup()
  const { rerender } = render(view())
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Operación confirmada' },
  })
  rerender(
    view({
      ...snapshot,
      identity: { ...snapshot.identity, userId: fixtureId(250000) },
    }),
  )
  expect(screen.getByRole('textbox')).toHaveValue('Operación confirmada')
  database.close()
})
test('cambiar de identidad cancela el lote y descarta su respuesta tardía sin borrar el recibo', async () => {
  const { database, snapshot, view, onCommitted } = setup()
  let release: (() => void) | undefined
  const result: CoverProgress = {
    total: 1,
    done: 0,
    saved: 0,
    missing: 0,
    failed: 0,
    skipped: 0,
    choices: [],
    current: 'Álbum nuevo',
  }
  const complete = vi
    .spyOn(AlbumCovers.prototype, 'complete')
    .mockImplementation(
      (ids, signal, progress) =>
        new Promise((resolve) => {
          expect(ids).toEqual([fixtureId(250001)])
          expect(signal.aborted).toBe(false)
          progress(result)
          release = () => {
            const late = {
              ...result,
              done: 1,
              saved: 1,
              current: 'Respuesta anterior',
            }
            progress(late)
            resolve(late)
          }
        }),
    )
  const { rerender } = render(view())
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Recibo conservado' },
  })
  const next = structuredClone(snapshot)
  next.catalog.albums.push({
    ...next.catalog.albums[0]!,
    id: fixtureId(250001),
    title: 'Álbum nuevo',
  })
  next.catalog.albumArtists.push({
    ...next.catalog.albumArtists[0]!,
    albumId: fixtureId(250001),
  })
  next.library.userAlbums.push({
    ...next.library.userAlbums[0]!,
    id: fixtureId(250002),
    albumId: fixtureId(250001),
  })
  rerender(view(next))
  await waitFor(() => expect(complete).toHaveBeenCalledOnce())
  rerender(
    view({
      ...next,
      identity: { ...next.identity, userId: fixtureId(250003) },
    }),
  )
  expect(complete.mock.calls[0]![1].aborted).toBe(true)
  await act(async () => {
    release?.()
    await Promise.resolve()
  })
  expect(screen.getByRole('textbox')).toHaveValue('Recibo conservado')
  expect(
    screen.queryByRole('region', { name: 'Portadas de la colección' }),
  ).not.toBeInTheDocument()
  expect(onCommitted).not.toHaveBeenCalled()
  database.close()
})
