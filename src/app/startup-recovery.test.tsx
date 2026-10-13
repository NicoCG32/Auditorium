import { fireEvent, render, screen } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from './App'
import { makeBackup } from '../domain/backup.fixture'
import { fixtureId } from '../domain/catalog/catalog.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import {
  LocalStorageError,
  type LocalStorageCode,
} from '../infrastructure/db/errors'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'

const databases: AuditoriumDatabase[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const database of databases) {
    database.close()
    await database.delete()
  }
  databases.length = 0
})
const errors: [LocalStorageCode, string][] = [
  [
    'quota_exceeded',
    'No hay espacio para abrir tu biblioteca. Los datos existentes se conservan',
  ],
  [
    'aborted',
    'La apertura de tu biblioteca no pudo completarse. Los datos existentes se conservan',
  ],
  ['blocked', 'Otra pestaña impide abrir tu biblioteca'],
  ['unavailable', 'Este navegador no permite acceder al almacenamiento local'],
  [
    'corrupt_data',
    'No se puede abrir esta biblioteca con seguridad. Los datos se conservan',
  ],
  [
    'version_mismatch',
    'No se puede abrir esta biblioteca con seguridad. Los datos se conservan',
  ],
]
test.each(errors)(
  'informa %s al abrir y permite releer conservando toda la biblioteca',
  async (code, message) => {
    const database = new AuditoriumDatabase('startup-recovery', {
      indexedDB: new IDBFactory(),
      IDBKeyRange,
    })
    databases.push(database)
    const repository = new IndexedDbRepository({
      database,
      createId: () => fixtureId(999),
    })
    const empty = await repository.readSnapshot()
    await repository.restoreEmpty(makeBackup().data, empty.identity)
    const before = await repository.readSnapshot()
    vi.spyOn(repository, 'readSnapshot').mockRejectedValueOnce(
      new LocalStorageError(code, 'Fallo ficticio'),
    )
    render(<App repository={repository} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(
      screen.queryByRole('button', { name: /borrar|reiniciar|restablecer/i }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }))
    await screen.findByRole('button', { name: 'Eclipse' })
    expect(await repository.readSnapshot()).toEqual(before)
  },
)
