import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { OfflineController } from '../../infrastructure/browser/offline-controller'
import { OfflinePanel } from './OfflinePanel'

function setup({ supported = true, persistent = false, granted = true } = {}) {
  const events = new EventTarget()
  const worker = Object.assign(new EventTarget(), {
    state: 'activated' as const,
  })
  const registration = Object.assign(new EventTarget(), {
    active: worker,
    waiting: null,
    installing: null,
    update: vi.fn(() => Promise.resolve()),
  })
  const workers = Object.assign(new EventTarget(), {
    controller: worker,
    register: () => Promise.resolve(registration),
  })
  const storage = {
    persisted: () => Promise.resolve(persistent),
    persist: vi.fn(() => Promise.resolve(granted)),
    estimate: () =>
      Promise.resolve({ usage: 1024 * 1024, quota: 10 * 1024 * 1024 }),
  }
  const browser = {
    enabled: true,
    events,
    isOnline: () => true,
    isInstalled: () => false,
    workers: supported ? workers : undefined,
    storage,
    baseUrl: '/',
  }
  const controller = new OfflineController(browser)
  controller.start()
  render(<OfflinePanel controller={controller} />)
  fireEvent.click(screen.getByText('Aplicación y almacenamiento'))
  return { controller, events, storage, registration, browser }
}

test('muestra límites, instrucciones de instalación y cuota estimada sin prometer protección', async () => {
  const context = setup()
  await screen.findByText('Aplicación preparada para usar sin conexión.')
  expect(await screen.findByText(/1 MiB de 10 MiB/)).toBeVisible()
  expect(
    screen.getByText(/Los datos permanecen en este navegador/),
  ).toHaveTextContent('incluso con protección')
  expect(screen.getByText(/Si tu navegador lo permite/)).toHaveTextContent(
    'Si la aplicación instalada aparece vacía',
  )
  expect(context.storage.persist).not.toHaveBeenCalled()
  context.controller.stop()
})
test('persistencia denegada se comunica y deja reintento accesible', async () => {
  const context = setup({ granted: false })
  const button = screen.getByRole('button', {
    name: 'Solicitar protección del almacenamiento',
  })
  await waitFor(() => expect(button).toBeEnabled())
  fireEvent.click(button)
  await screen.findByText(/no concedió protección/)
  expect(button).toBeEnabled()
  expect(context.storage.persist).toHaveBeenCalledTimes(1)
  context.controller.stop()
})
test('persistencia concedida mantiene consejo de respaldo y retira solicitud', async () => {
  const context = setup({ persistent: true })
  await screen.findByText(/protección frente a la limpieza automática/)
  expect(
    screen.queryByRole('button', {
      name: 'Solicitar protección del almacenamiento',
    }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByText(/Los datos permanecen en este navegador/),
  ).toHaveTextContent('Descarga respaldos JSON')
  context.controller.stop()
})
test('navegador sin SW informa limitación y mantiene instrucciones de biblioteca', () => {
  const context = setup({ supported: false })
  expect(screen.getByText(/no permite preparar la aplicación/)).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Comprobar actualización' }),
  ).not.toBeInTheDocument()
  expect(screen.getByText(/Después de prepararse/)).toHaveTextContent(
    'Las portadas y enlaces externos necesitan red',
  )
  context.controller.stop()
})
test('fallo de comprobación conserva la versión actual y ofrece reintento', async () => {
  const context = setup()
  context.registration.update.mockRejectedValueOnce(new Error('Fallo ficticio'))
  fireEvent.click(
    await screen.findByRole('button', { name: 'Comprobar actualización' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'La versión actual sigue disponible',
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Comprobar actualización' }),
  )
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  )
  context.controller.stop()
})
test('evento offline cambia indicación y desactiva comprobación, sin perder información local', async () => {
  const context = setup()
  const button = await screen.findByRole('button', {
    name: 'Comprobar actualización',
  })
  context.browser.isOnline = () => false
  act(() => {
    context.events.dispatchEvent(new Event('offline'))
  })
  expect(
    screen.getByText(/El navegador indica que no hay conexión/),
  ).toBeVisible()
  expect(button).toBeDisabled()
  expect(
    screen.getByText(/Los datos permanecen en este navegador/),
  ).toBeVisible()
  context.controller.stop()
})
