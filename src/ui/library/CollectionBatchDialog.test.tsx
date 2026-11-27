import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { TransactionalLocalRepository } from '../../domain/repositories/local-repository'
import { libraryIds } from '../../domain/library/library.fixture'
import { collectionShortcutsBackup } from '../../test/collection-shortcuts.fixture'
import { LocalStorageError } from '../../infrastructure/db/errors'
import { CollectionBatchDialog } from './CollectionBatchDialog'

function setup() {
  let snapshot = collectionShortcutsBackup().data
  const repository: TransactionalLocalRepository = {
    open: () => Promise.resolve(snapshot.identity),
    close: () => {},
    readSnapshot: () => Promise.resolve(structuredClone(snapshot)),
    mutate: (change) => {
      const next = change(structuredClone(snapshot))
      snapshot = next.snapshot
      return Promise.resolve(next.result)
    },
  }
  const props = {
    repository,
    ids: [libraryIds.otherEntry],
    initialAction: { kind: 'own' as const, format: 'cd' as const },
    onClose: vi.fn(),
    onBusyChange: vi.fn(),
    onCommitted: vi.fn(() => repository.readSnapshot()),
    onDone: vi.fn(),
  }
  return { repository, props }
}

test('un guardado seguido de lectura fallida ofrece sólo releer y nunca repite la escritura', async () => {
  const { repository, props } = setup()
  const mutate = vi.spyOn(repository, 'mutate')
  props.onCommitted.mockRejectedValueOnce(new Error('Lectura ficticia'))
  render(<CollectionBatchDialog {...props} />)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Confirmar cambios' }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambios' }))
  const retry = await screen.findByRole('button', {
    name: 'Reintentar lectura',
  })
  await waitFor(() => expect(retry).toBeEnabled())
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Los cambios se guardaron',
  )
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  expect(screen.getByRole('combobox', { name: 'Formato' })).toBeDisabled()
  expect(props.onDone).not.toHaveBeenCalled()
  fireEvent.click(retry)
  await waitFor(() =>
    expect(props.onDone).toHaveBeenCalledWith({ changed: 1, unchanged: 0 }),
  )
  expect(mutate).toHaveBeenCalledTimes(1)
  expect(props.onCommitted).toHaveBeenCalledTimes(2)
  expect(
    (await repository.readSnapshot()).library.ownedItems.filter(
      (row) => row.userAlbumId === libraryIds.otherEntry && row.format === 'cd',
    ),
  ).toHaveLength(1)
})

test('un fallo de escritura exige revisar otra vez y permite cancelar sin anunciar éxito', async () => {
  const { repository, props } = setup()
  const before = await repository.readSnapshot()
  vi.spyOn(repository, 'mutate').mockRejectedValueOnce(
    new LocalStorageError('quota_exceeded', 'Cuota ficticia'),
  )
  render(<CollectionBatchDialog {...props} />)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Confirmar cambios' }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambios' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio')
  expect(
    screen.queryByRole('button', { name: 'Confirmar cambios' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Revisar otra vez' })).toBeEnabled()
  expect(props.onDone).not.toHaveBeenCalled()
  expect(props.onCommitted).not.toHaveBeenCalled()
  expect(await repository.readSnapshot()).toEqual(before)
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(props.onClose).toHaveBeenCalledTimes(1)
})

test('cerrar durante una lectura de revisión descarta el resultado tardío y no escribe', async () => {
  const { repository, props } = setup()
  const snapshot = await repository.readSnapshot()
  let resolve!: (value: typeof snapshot) => void
  vi.spyOn(repository, 'readSnapshot').mockReturnValueOnce(
    new Promise((value) => {
      resolve = value
    }),
  )
  const mutate = vi.spyOn(repository, 'mutate')
  const rendered = render(<CollectionBatchDialog {...props} />)
  expect(screen.getByText('Revisando la selección…')).toBeInTheDocument()
  rendered.unmount()
  resolve(snapshot)
  await Promise.resolve()
  expect(mutate).not.toHaveBeenCalled()
  expect(props.onDone).not.toHaveBeenCalled()
})
