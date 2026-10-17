import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { LibraryBackups } from '../application/library-backups'
import { makeBackup } from '../domain/backup.fixture'
import { parseBackupText } from '../domain/backup'
import { libraryIds, times } from '../domain/library/library.fixture'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import * as ai from '../infrastructure/ai/recommendation-client'
import { APPEARANCE_STORAGE_KEY } from '../ui/appearance/use-appearance'
import { App } from './App'

const fictitiousKey = 'clave-ficticia-no-es-una-credencial'
let indexedDB: IDBFactory
let databases: AuditoriumDatabase[]

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
  const database = new AuditoriumDatabase('recommendation-session-ui', {
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
  const repository = connect()
  await repository.mutate(() => ({
    snapshot: makeBackup().data,
    result: undefined,
  }))
  return repository
}

async function ready() {
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Recomendaciones' }),
    ).toBeEnabled(),
  )
}

function openRecommendations() {
  fireEvent.click(screen.getByRole('button', { name: 'Recomendaciones' }))
}

function enterKey(value = fictitiousKey, provider = 'Groq') {
  fireEvent.change(screen.getByLabelText(`Clave API de ${provider}`), {
    target: { value },
  })
}

test('la clave de sesión permanece al cerrar el panel, visitar respaldos y abrir una ficha sin llamadas automáticas', async () => {
  const repository = await populated()
  const before = await repository.readSnapshot()
  const request = vi
    .spyOn(ai, 'requestRecommendations')
    .mockRejectedValue(new Error('Solicitud ficticia inesperada'))
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  render(<App repository={repository} />)
  await ready()
  openRecommendations()
  enterKey()
  fireEvent.click(
    screen.getByRole('checkbox', { name: /Acepto enviar estos datos/u }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Volver a la biblioteca' }),
  )
  openRecommendations()
  expect(screen.getByLabelText('Clave API de Groq')).toHaveValue(fictitiousKey)
  expect(
    screen.getByRole('checkbox', { name: /Acepto enviar estos datos/u }),
  ).not.toBeChecked()

  fireEvent.click(screen.getByRole('button', { name: 'Respaldos' }))
  expect(
    screen.getByRole('heading', { name: 'Respaldos de tu biblioteca' }),
  ).toBeVisible()
  openRecommendations()
  expect(screen.getByLabelText('Clave API de Groq')).toHaveValue(fictitiousKey)

  fireEvent.click(
    screen.getByRole('button', { name: 'Volver a la biblioteca' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Eclipse' }))
  expect(screen.getByRole('textbox', { name: 'Nota del álbum' })).toBeVisible()
  openRecommendations()
  expect(screen.getByLabelText('Clave API de Groq')).toHaveValue(fictitiousKey)
  expect(request).not.toHaveBeenCalled()
  expect(await repository.readSnapshot()).toEqual(before)
  expect(storage.mock.calls.length).toBeGreaterThan(0)
  expect(
    storage.mock.calls.every(([key]) => key === APPEARANCE_STORAGE_KEY),
  ).toBe(true)
  expect(JSON.stringify(storage.mock.calls)).not.toContain(fictitiousKey)
})

test('una apertura nueva conserva la biblioteca e identidad pero olvida clave y proveedor de la sesión anterior', async () => {
  const repository = await populated()
  const before = await repository.readSnapshot()
  const request = vi
    .spyOn(ai, 'requestRecommendations')
    .mockRejectedValue(new Error('Solicitud ficticia inesperada'))
  const view = render(<App repository={repository} />)
  await ready()
  openRecommendations()
  fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), {
    target: { value: 'gemini' },
  })
  enterKey(fictitiousKey, 'Gemini')
  expect(screen.getByLabelText('Clave API de Gemini')).toHaveValue(
    fictitiousKey,
  )
  view.unmount()

  const reloadedRepository = connect()
  render(<App repository={reloadedRepository} />)
  await ready()
  openRecommendations()
  expect(screen.getByRole('combobox', { name: 'Proveedor' })).toHaveValue(
    'groq',
  )
  expect(screen.getByLabelText('Clave API de Groq')).toHaveValue('')
  expect(
    screen.getByRole('checkbox', { name: /Acepto enviar estos datos/u }),
  ).not.toBeChecked()
  expect(await reloadedRepository.readSnapshot()).toEqual(before)
  expect(request).not.toHaveBeenCalled()
})

test('cambiar proveedor y olvidar clave borran el estado del padre y no lo recuperan al volver al panel', async () => {
  const repository = await populated()
  const request = vi
    .spyOn(ai, 'requestRecommendations')
    .mockRejectedValue(new Error('Solicitud ficticia inesperada'))
  render(<App repository={repository} />)
  await ready()
  openRecommendations()
  enterKey()
  fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), {
    target: { value: 'gemini' },
  })
  expect(screen.getByLabelText('Clave API de Gemini')).toHaveValue('')
  enterKey('otra-clave-ficticia-temporal', 'Gemini')
  fireEvent.click(screen.getByRole('button', { name: 'Olvidar clave' }))
  expect(screen.getByLabelText('Clave API de Gemini')).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Respaldos' }))
  openRecommendations()
  expect(screen.getByRole('combobox', { name: 'Proveedor' })).toHaveValue(
    'gemini',
  )
  expect(screen.getByLabelText('Clave API de Gemini')).toHaveValue('')
  expect(
    screen.getByRole('button', { name: 'Generar recomendaciones' }),
  ).toBeDisabled()
  expect(request).not.toHaveBeenCalled()
})

test('generar abre un álbum existente sin mutar datos y el respaldo excluye claves, contexto y resultados', async () => {
  const repository = await populated()
  const before = await repository.readSnapshot()
  const reason = 'Motivo ficticio generado para esta sesión solamente.'
  const request = vi
    .spyOn(ai, 'requestRecommendations')
    .mockImplementation(({ context }) =>
      Promise.resolve([
        {
          entryId: context.candidates[0]!.entryId,
          action: 'reevaluate',
          reason,
        },
      ]),
    )
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  render(<App repository={repository} />)
  await ready()
  openRecommendations()
  enterKey()
  expect(request).not.toHaveBeenCalled()
  expect(
    screen.getByRole('button', { name: 'Generar recomendaciones' }),
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('checkbox', { name: /Acepto enviar estos datos/u }),
  )
  expect(request).not.toHaveBeenCalled()
  fireEvent.click(
    screen.getByRole('button', { name: 'Generar recomendaciones' }),
  )
  await screen.findByRole('list', { name: 'Orden recomendado' })
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]![0]).toMatchObject({
    provider: 'groq',
    apiKey: fictitiousKey,
    context: { candidates: [{ entryId: libraryIds.entry }] },
  })
  expect(screen.getByText(reason)).toBeVisible()
  expect(await repository.readSnapshot()).toEqual(before)

  const exported = await new LibraryBackups(
    repository,
    () => new Date(times.later),
  ).export()
  expect(parseBackupText(exported.text).data).toEqual(before)
  for (const transient of [
    fictitiousKey,
    reason,
    'recentReferences',
    'apiKey',
    'recommendationProvider',
  ])
    expect(exported.text).not.toContain(transient)
  expect(JSON.stringify(storage.mock.calls)).not.toContain(fictitiousKey)
  expect(JSON.stringify(storage.mock.calls)).not.toContain(reason)

  fireEvent.click(screen.getByRole('button', { name: 'Abrir álbum Eclipse' }))
  expect(screen.getByRole('textbox', { name: 'Nota del álbum' })).toBeVisible()
  expect(await repository.readSnapshot()).toEqual(before)
  openRecommendations()
  expect(screen.getByLabelText('Clave API de Groq')).toHaveValue(fictitiousKey)
  expect(
    screen.queryByRole('list', { name: 'Orden recomendado' }),
  ).not.toBeInTheDocument()
  expect(request).toHaveBeenCalledTimes(1)
})
