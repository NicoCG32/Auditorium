import { expect, test, vi } from 'vitest'
import { OfflineController, type OfflineBrowser } from './offline-controller'

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installing'
  change(state: ServiceWorkerState) {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
}
class FakeRegistration extends EventTarget {
  active: FakeWorker | null = null
  waiting: FakeWorker | null = null
  installing: FakeWorker | null = new FakeWorker()
  update = vi.fn(() => Promise.resolve())
}
class FakeWorkers extends EventTarget {
  controller: FakeWorker | null = null
  registration = new FakeRegistration()
  register = vi.fn(() => Promise.resolve(this.registration))
}
function environment(baseUrl = '/') {
  const workers = new FakeWorkers()
  const events = new EventTarget()
  const storage = {
    persisted: vi.fn(() => Promise.resolve(false)),
    persist: vi.fn(() => Promise.resolve(true)),
    estimate: vi.fn(() => Promise.resolve({ usage: 2048, quota: 4096 })),
  }
  const browser: OfflineBrowser = {
    enabled: true,
    workers,
    events,
    storage,
    baseUrl,
    isOnline: vi.fn(() => true),
    isInstalled: () => false,
  }
  const controller = new OfflineController(browser)
  return {
    controller,
    browser,
    events,
    workers,
    storage,
    registration: workers.registration,
  }
}
async function started(baseUrl = '/') {
  const context = environment(baseUrl)
  context.controller.start()
  await vi.waitFor(() =>
    expect(context.controller.getSnapshot().storage).toBe('available'),
  )
  return context
}
function activate(context: ReturnType<typeof environment>) {
  const worker = context.registration.installing
  if (!worker) throw new Error('Missing fictitious worker')
  context.registration.active = worker
  context.registration.installing = null
  worker.change('activated')
  context.workers.controller = worker
  context.workers.dispatchEvent(new Event('controllerchange'))
}
class FakePrompt extends Event {
  prompt = vi.fn(() => Promise.resolve())
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> = Promise.resolve({
    outcome: 'accepted',
  })
  constructor() {
    super('beforeinstallprompt', { cancelable: true })
  }
}

test.each(['/', '/Auditorium/'])(
  'registra una vez bajo %s; espera a activar y controlar para declarar listo',
  async (baseUrl) => {
    const context = await started(baseUrl)
    context.controller.start()
    expect(context.workers.register).toHaveBeenCalledExactlyOnceWith(
      `${baseUrl}sw.js`,
      {
        scope: baseUrl,
        updateViaCache: 'none',
      },
    )
    expect(context.controller.getSnapshot().shell).toBe('preparing')
    context.registration.installing?.change('installed')
    expect(context.controller.getSnapshot().shell).toBe('preparing')
    activate(context)
    expect(context.controller.getSnapshot().shell).toBe('ready')
    expect(context.controller.getSnapshot().update).toBe('idle')
  },
)
test('una inscripción existente activa también queda lista', async () => {
  const context = environment()
  activate(context)
  context.controller.start()
  await vi.waitFor(() =>
    expect(context.controller.getSnapshot().shell).toBe('ready'),
  )
})
test('waiting transitorio de la primera instalación no es una actualización', async () => {
  const context = environment()
  context.registration.waiting = context.registration.installing
  context.registration.waiting?.change('installed')
  context.controller.start()
  await vi.waitFor(() => expect(context.workers.register).toHaveBeenCalled())
  expect(context.controller.getSnapshot().update).toBe('idle')
  context.registration.waiting = null
  activate(context)
  expect(context.controller.getSnapshot()).toMatchObject({
    shell: 'ready',
    update: 'idle',
  })
})
test('una versión esperando desde otra apertura se anuncia sin forzar activación', async () => {
  const context = environment()
  activate(context)
  context.registration.waiting = new FakeWorker()
  context.registration.waiting.change('installed')
  context.controller.start()
  await vi.waitFor(() =>
    expect(context.controller.getSnapshot().update).toBe('available'),
  )
  expect(context.controller.getSnapshot().shell).toBe('ready')
  expect(context.registration.waiting.state).toBe('installed')
})
test('detecta una instalación nueva mientras la versión anterior sigue controlando', async () => {
  const context = await started()
  activate(context)
  const next = new FakeWorker()
  context.registration.installing = next
  context.registration.dispatchEvent(new Event('updatefound'))
  next.change('installed')
  expect(context.controller.getSnapshot()).toMatchObject({
    shell: 'ready',
    update: 'available',
  })
})
test('fallo de descarga inicial impide prometer offline', async () => {
  const context = await started()
  context.registration.installing?.change('redundant')
  expect(context.controller.getSnapshot().shell).toBe('failed')
})
test('actualización fallida conserva la shell anterior', async () => {
  const context = await started()
  activate(context)
  context.registration.installing = new FakeWorker()
  context.registration.dispatchEvent(new Event('updatefound'))
  context.registration.installing.change('redundant')
  expect(context.controller.getSnapshot()).toMatchObject({
    shell: 'ready',
    update: 'failed',
  })
})
test('permiso denegado al registrar es un estado recuperable', async () => {
  const context = environment()
  context.workers.register.mockRejectedValueOnce(
    new Error('Fictitious rejection'),
  )
  context.controller.start()
  await vi.waitFor(() =>
    expect(context.controller.getSnapshot().shell).toBe('failed'),
  )
})
test('desarrollo y navegador sin soporte no intentan registrar', async () => {
  for (const enabled of [false, true]) {
    const context = environment()
    context.browser.enabled = enabled
    context.browser.workers = undefined
    const controller = new OfflineController(context.browser)
    controller.start()
    await vi.waitFor(() =>
      expect(controller.getSnapshot().storage).toBe('available'),
    )
    expect(controller.getSnapshot().shell).toBe(
      enabled ? 'unsupported' : 'development',
    )
    expect(context.workers.register).not.toHaveBeenCalled()
  }
})
test('eventos de conexión actualizan información sin detener CRUD ni recargar', async () => {
  const context = await started()
  context.browser.isOnline = () => false
  context.events.dispatchEvent(new Event('offline'))
  expect(context.controller.getSnapshot().online).toBe(false)
  context.browser.isOnline = () => true
  context.events.dispatchEvent(new Event('online'))
  expect(context.controller.getSnapshot().online).toBe(true)
})
test('comprobación fallida se puede reintentar sin cambiar la biblioteca', async () => {
  const context = await started()
  activate(context)
  context.registration.update.mockRejectedValueOnce(new Error('Offline'))
  await context.controller.checkUpdate()
  expect(context.controller.getSnapshot()).toMatchObject({
    shell: 'ready',
    update: 'failed',
  })
  await context.controller.checkUpdate()
  expect(context.controller.getSnapshot().update).toBe('idle')
})
test('comprobación detecta waiting y serializa clics concurrentes', async () => {
  const context = await started()
  let finish: (() => void) | undefined
  context.registration.update.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const first = context.controller.checkUpdate()
  await context.controller.checkUpdate()
  expect(context.registration.update).toHaveBeenCalledTimes(1)
  context.registration.waiting = new FakeWorker()
  finish?.()
  await first
  expect(context.controller.getSnapshot().update).toBe('available')
})
test('consulta estimación y protección sin pedir permisos automáticamente', async () => {
  const context = await started()
  await vi.waitFor(() =>
    expect(context.controller.getSnapshot().usage).toBe(2048),
  )
  expect(context.controller.getSnapshot().quota).toBe(4096)
  expect(context.storage.persist).not.toHaveBeenCalled()
  await context.controller.requestPersistence()
  expect(context.controller.getSnapshot().storage).toBe('persistent')
  await context.controller.requestPersistence()
  expect(context.storage.persist).toHaveBeenCalledTimes(1)
})
test('denegación de persistencia permite reintentar', async () => {
  const context = await started()
  context.storage.persist.mockResolvedValueOnce(false)
  await context.controller.requestPersistence()
  expect(context.controller.getSnapshot().storage).toBe('denied')
  await context.controller.requestPersistence()
  expect(context.controller.getSnapshot().storage).toBe('persistent')
})
test('rechazo al solicitar persistencia conserva la estimación y permite retry', async () => {
  const context = await started()
  context.storage.persist.mockRejectedValueOnce(new Error('Fictitious failure'))
  await context.controller.requestPersistence()
  expect(context.controller.getSnapshot().storage).toBe('failed')
  await context.controller.requestPersistence()
  expect(context.controller.getSnapshot().storage).toBe('persistent')
})
test('protección ya concedida se consulta, no se vuelve a pedir', async () => {
  const context = environment()
  context.storage.persisted.mockResolvedValue(true)
  context.controller.start()
  await vi.waitFor(() =>
    expect(context.controller.getSnapshot().storage).toBe('persistent'),
  )
  await context.controller.requestPersistence()
  expect(context.storage.persist).not.toHaveBeenCalled()
})
test('storage ausente o incompleto informa soporte y no inventa cuota', async () => {
  for (const storage of [undefined, {}]) {
    const context = environment()
    context.browser.storage = storage
    const controller = new OfflineController(context.browser)
    controller.start()
    await controller.requestPersistence()
    expect(controller.getSnapshot()).toMatchObject({
      storage: 'unsupported',
      usage: undefined,
      quota: undefined,
    })
    expect(controller.canRequestPersistence()).toBe(false)
  }
})
test('estimación fallida no anula protección concedida', async () => {
  const context = environment()
  context.storage.persisted.mockResolvedValue(true)
  context.storage.estimate.mockRejectedValue(new Error('Fictitious failure'))
  context.controller.start()
  await vi.waitFor(() =>
    expect(context.controller.getSnapshot().storage).toBe('persistent'),
  )
  expect(context.controller.getSnapshot().quota).toBeUndefined()
})
test('rechaza estimaciones inválidas sin mostrar números engañosos', async () => {
  const context = environment()
  context.storage.estimate.mockResolvedValue({ usage: Number.NaN, quota: -1 })
  context.controller.start()
  await vi.waitFor(() => expect(context.storage.estimate).toHaveBeenCalled())
  expect(context.controller.getSnapshot().usage).toBeUndefined()
  expect(context.controller.getSnapshot().quota).toBeUndefined()
})
test('la instalación se solicita por clic y cancelarla no equivale a instalar', async () => {
  const context = await started()
  const event = new FakePrompt()
  event.userChoice = Promise.resolve({ outcome: 'dismissed' })
  context.events.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  expect(context.controller.getSnapshot().installation).toBe('available')
  expect(event.prompt).not.toHaveBeenCalled()
  await context.controller.install()
  expect(context.controller.getSnapshot().installation).toBe('dismissed')
})
test('aceptación del diálogo no se presenta como instalación completada', async () => {
  const context = await started()
  const event = new FakePrompt()
  context.events.dispatchEvent(event)
  await context.controller.install()
  expect(context.controller.getSnapshot().installation).toBe('unavailable')
  context.events.dispatchEvent(new Event('appinstalled'))
  expect(context.controller.getSnapshot().installation).toBe('installed')
})
test('appinstalled durante el prompt no se revierte al terminar la promesa', async () => {
  const context = await started()
  const event = new FakePrompt()
  event.prompt.mockImplementationOnce(() => {
    context.events.dispatchEvent(new Event('appinstalled'))
    return Promise.resolve()
  })
  context.events.dispatchEvent(event)
  await context.controller.install()
  expect(context.controller.getSnapshot().installation).toBe('installed')
})
test('fallo de prompt no queda pendiente y un nuevo evento permite reintentar', async () => {
  const context = await started()
  const event = new FakePrompt()
  event.prompt.mockRejectedValueOnce(new Error('Fictitious failure'))
  context.events.dispatchEvent(event)
  await context.controller.install()
  expect(context.controller.getSnapshot().installation).toBe('failed')
  context.events.dispatchEvent(new FakePrompt())
  expect(context.controller.getSnapshot().installation).toBe('available')
})
test('stop elimina suscripciones e ignora registro y almacenamiento aún pendientes', async () => {
  const context = environment()
  const listener = vi.fn()
  const unsubscribe = context.controller.subscribe(listener)
  unsubscribe()
  context.controller.start()
  context.controller.stop()
  const snapshot = context.controller.getSnapshot()
  await Promise.resolve()
  context.events.dispatchEvent(new Event('offline'))
  expect(context.controller.getSnapshot()).toBe(snapshot)
  expect(listener).not.toHaveBeenCalled()
})
