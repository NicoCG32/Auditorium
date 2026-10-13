export interface OfflineState {
  shell: 'development' | 'unsupported' | 'preparing' | 'ready' | 'failed'
  update: 'idle' | 'checking' | 'available' | 'failed'
  online: boolean
  installation:
    | 'unavailable'
    | 'available'
    | 'pending'
    | 'installed'
    | 'dismissed'
    | 'failed'
  storage:
    | 'checking'
    | 'available'
    | 'persistent'
    | 'denied'
    | 'unsupported'
    | 'failed'
  usage: number | undefined
  quota: number | undefined
}

type Worker = Pick<
  ServiceWorker,
  'state' | 'addEventListener' | 'removeEventListener'
>
interface Registration extends Pick<
  EventTarget,
  'addEventListener' | 'removeEventListener'
> {
  active: Worker | null
  waiting: Worker | null
  installing: Worker | null
  update: () => Promise<unknown>
}
export interface OfflineBrowser {
  enabled: boolean
  events: EventTarget
  isOnline: () => boolean
  isInstalled: () => boolean
  workers:
    | {
        controller: Worker | null
        register: (
          url: string,
          options: RegistrationOptions,
        ) => Promise<Registration>
        addEventListener: EventTarget['addEventListener']
        removeEventListener: EventTarget['removeEventListener']
      }
    | undefined
  storage:
    | Partial<Pick<StorageManager, 'persisted' | 'persist' | 'estimate'>>
    | undefined
  baseUrl: string
}

interface InstallPrompt extends Event {
  prompt: () => Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isInstallPrompt(event: Event): event is InstallPrompt {
  return (
    'prompt' in event &&
    typeof event.prompt === 'function' &&
    'userChoice' in event
  )
}

function validBytes(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

/** Browser capabilities only; never reads or modifies the music database. */
export class OfflineController {
  private readonly browser: OfflineBrowser
  private state: OfflineState
  private readonly listeners = new Set<() => void>()
  private readonly cleanups: (() => void)[] = []
  private readonly watchedWorkers = new Set<Worker>()
  private registration: Registration | undefined
  private installPrompt: InstallPrompt | undefined
  private started = false
  private stopped = false
  private requestingStorage = false

  constructor(browser: OfflineBrowser) {
    this.browser = browser
    this.state = {
      shell: !browser.enabled
        ? 'development'
        : browser.workers
          ? 'preparing'
          : 'unsupported',
      update: 'idle',
      online: browser.isOnline(),
      installation: browser.isInstalled() ? 'installed' : 'unavailable',
      storage: 'checking',
      usage: undefined,
      quota: undefined,
    }
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(change: Partial<OfflineState>) {
    if (this.stopped) return
    this.state = { ...this.state, ...change }
    this.listeners.forEach((listener) => listener())
  }
  private listen(
    target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
    type: string,
    callback: EventListener,
  ) {
    target.addEventListener(type, callback)
    this.cleanups.push(() => target.removeEventListener(type, callback))
  }

  start() {
    if (this.started) return
    this.started = true
    const connection = () => this.publish({ online: this.browser.isOnline() })
    this.listen(this.browser.events, 'online', connection)
    this.listen(this.browser.events, 'offline', connection)
    if (this.browser.enabled) {
      this.listen(this.browser.events, 'beforeinstallprompt', (event) => {
        if (!isInstallPrompt(event) || this.state.installation === 'installed')
          return
        event.preventDefault()
        this.installPrompt = event
        this.publish({ installation: 'available' })
      })
      this.listen(this.browser.events, 'appinstalled', () => {
        this.installPrompt = undefined
        this.publish({ installation: 'installed' })
      })
      void this.register()
    }
    void this.readStorage()
  }

  stop() {
    this.stopped = true
    this.cleanups.forEach((cleanup) => cleanup())
    this.cleanups.length = 0
    this.listeners.clear()
  }

  private syncWorkers() {
    if (this.registration?.waiting && this.registration.active) {
      this.publish({ update: 'available' })
    }
    if (
      this.browser.workers?.controller?.state === 'activated' &&
      this.registration?.active?.state === 'activated'
    ) {
      this.publish({ shell: 'ready' })
    }
  }
  private watch(worker: Worker | null) {
    if (!worker || this.watchedWorkers.has(worker)) return
    this.watchedWorkers.add(worker)
    const changed = () => {
      this.syncWorkers()
      if (
        worker.state === 'installed' &&
        this.registration?.active &&
        this.registration.active !== worker
      ) {
        this.publish({ update: 'available' })
      }
      if (worker.state === 'redundant') {
        this.publish(
          this.registration?.active
            ? { update: 'failed' }
            : { shell: 'failed' },
        )
      }
    }
    this.listen(worker, 'statechange', changed)
    changed()
  }
  private async register() {
    const workers = this.browser.workers
    if (!workers) return
    try {
      const registration = await workers.register(
        `${this.browser.baseUrl}sw.js`,
        {
          scope: this.browser.baseUrl,
          updateViaCache: 'none',
        },
      )
      if (this.stopped) return
      this.registration = registration
      this.listen(workers, 'controllerchange', () => this.syncWorkers())
      this.listen(registration, 'updatefound', () =>
        this.watch(registration.installing),
      )
      this.watch(registration.installing)
      this.watch(registration.active)
      this.syncWorkers()
    } catch {
      this.publish({ shell: 'failed' })
    }
  }

  async checkUpdate() {
    if (!this.registration || this.state.update === 'checking') return
    this.publish({ update: 'checking' })
    try {
      await this.registration.update()
      this.publish({ update: this.registration.waiting ? 'available' : 'idle' })
    } catch {
      this.publish({
        update: this.registration.waiting ? 'available' : 'failed',
      })
    }
  }

  async install() {
    const prompt = this.installPrompt
    if (!prompt || this.state.installation === 'pending') return
    this.installPrompt = undefined
    this.publish({ installation: 'pending' })
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (this.state.installation !== 'installed') {
        // Acceptance is not evidence that installation completed.
        this.publish({
          installation:
            choice.outcome === 'dismissed' ? 'dismissed' : 'unavailable',
        })
      }
    } catch {
      if (this.state.installation !== 'installed')
        this.publish({ installation: 'failed' })
    }
  }

  private async readStorage() {
    const storage = this.browser.storage
    if (!storage?.persisted) {
      this.publish({ storage: 'unsupported' })
    } else {
      try {
        const persisted = await storage.persisted()
        this.publish({ storage: persisted ? 'persistent' : 'available' })
      } catch {
        this.publish({ storage: 'failed' })
      }
    }
    await this.readEstimate()
  }
  private async readEstimate() {
    try {
      const estimate = await this.browser.storage?.estimate?.()
      this.publish({
        usage: validBytes(estimate?.usage),
        quota: validBytes(estimate?.quota),
      })
    } catch {
      this.publish({ usage: undefined, quota: undefined })
    }
  }
  async requestPersistence() {
    const storage = this.browser.storage
    if (
      !storage?.persist ||
      this.requestingStorage ||
      this.state.storage === 'persistent'
    )
      return
    this.requestingStorage = true
    this.publish({ storage: 'checking' })
    try {
      const persisted = await storage.persist()
      this.publish({ storage: persisted ? 'persistent' : 'denied' })
    } catch {
      this.publish({ storage: 'failed' })
    } finally {
      this.requestingStorage = false
    }
    await this.readEstimate()
  }
  canRequestPersistence() {
    return typeof this.browser.storage?.persist === 'function'
  }
}

export function createOfflineController() {
  return new OfflineController({
    enabled: import.meta.env.PROD,
    events: window,
    isOnline: () => navigator.onLine,
    isInstalled: () => window.matchMedia('(display-mode: standalone)').matches,
    workers:
      window.isSecureContext && 'serviceWorker' in navigator
        ? navigator.serviceWorker
        : undefined,
    storage: navigator.storage,
    baseUrl: import.meta.env.BASE_URL,
  })
}
