import { flushSync } from 'react-dom'
import { DraftRegistry, type DraftEditor } from './drafts'
import { parseRoute, routeHash, type Route } from './routes'

interface Position {
  session: string
  index: number
}
interface Intent {
  route: Route
  index?: number
  replace?: boolean
  action?: () => void
  editorId?: string
}
interface ViewContext {
  scroll: number
  focus?: string
}
export interface NavigationState {
  route: Route
  prompt: boolean
  resolving: boolean
  restoring: boolean
  blocked: boolean
  message: string
}

/** Only routes and an index enter history; drafts and keys stay in memory. */
export class NavigationController {
  readonly drafts: DraftRegistry
  private browser: Window
  private session: string = crypto.randomUUID()
  private index = 0
  private state: NavigationState
  private listeners = new Set<() => void>()
  private intent: Intent | undefined
  private returning = false
  private allowedIndex: number | undefined
  private initialized = false
  private stopDrafts: (() => void) | undefined
  private contexts = new Map<string, ViewContext>()
  private origins = new Map<string, Route>()
  private promptFocus: HTMLElement | null = null
  private failedEditor: DraftEditor | undefined

  constructor(drafts: DraftRegistry, browser: Window = window) {
    this.drafts = drafts
    this.browser = browser
    const previous = this.historyState().auditoriumNavigation
    if (
      previous &&
      typeof previous === 'object' &&
      'session' in previous &&
      typeof previous.session === 'string' &&
      /^[a-f\d-]{36}$/iu.test(previous.session) &&
      'index' in previous &&
      typeof previous.index === 'number' &&
      Number.isSafeInteger(previous.index) &&
      previous.index >= 0
    ) {
      this.session = previous.session
      this.index = previous.index
    }
    this.state = {
      route: parseRoute(browser.location.hash),
      prompt: false,
      resolving: false,
      restoring: false,
      blocked: false,
      message: '',
    }
  }

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(change: Partial<NavigationState>) {
    this.state = { ...this.state, ...change }
    for (const listener of this.listeners) listener()
  }

  private position(): Position | undefined {
    const value = this.historyState().auditoriumNavigation
    if (
      value &&
      typeof value === 'object' &&
      'session' in value &&
      value.session === this.session &&
      'index' in value &&
      Number.isInteger(value.index)
    )
      return value as Position
    return undefined
  }

  private historyState(): Record<string, unknown> {
    const state: unknown = this.browser.history.state
    return state && typeof state === 'object' && !Array.isArray(state)
      ? (state as Record<string, unknown>)
      : {}
  }

  private tag(index: number, route: Route) {
    this.browser.history.replaceState(
      {
        ...this.historyState(),
        auditoriumNavigation: { session: this.session, index },
      },
      '',
      routeHash(route),
    )
  }

  start() {
    if (!this.initialized) {
      this.initialized = true
      this.tag(this.index, this.state.route)
    }
    this.stopDrafts = this.drafts.subscribe(() =>
      this.update({ blocked: this.drafts.blocked() }),
    )
    this.browser.addEventListener('popstate', this.onHistory)
    this.browser.addEventListener('hashchange', this.onHistory)
    this.browser.addEventListener('beforeunload', this.onUnload)
    return () => {
      this.stopDrafts?.()
      this.browser.removeEventListener('popstate', this.onHistory)
      this.browser.removeEventListener('hashchange', this.onHistory)
      this.browser.removeEventListener('beforeunload', this.onUnload)
    }
  }

  private onUnload = (event: BeforeUnloadEvent) => {
    if (this.drafts.unsettled()) {
      event.preventDefault()
      event.returnValue = ''
    }
  }

  private capture() {
    const focused = this.browser.document.activeElement
    const focus =
      focused instanceof HTMLElement
        ? focused.id || focused.dataset.focusKey
        : undefined
    this.contexts.set(routeHash(this.state.route), {
      scroll: this.browser.scrollY,
      ...(focus ? { focus } : {}),
    })
  }

  restore(root: HTMLElement) {
    const context = this.contexts.get(routeHash(this.state.route))
    const target = context?.focus
      ? (this.browser.document.getElementById(context.focus) ??
        [...root.querySelectorAll<HTMLElement>('[data-focus-key]')].find(
          (element) => element.dataset.focusKey === context.focus,
        ))
      : undefined
    const fallback = context?.focus
      ? root.querySelector<HTMLElement>('input[type="search"]')
      : undefined
    const heading = root.querySelector<HTMLElement>(
      '[data-route-heading], h1, h2',
    )
    ;(target ?? fallback ?? heading)?.focus({ preventScroll: true })
    this.browser.scrollTo({ top: context?.scroll ?? 0, behavior: 'instant' })
  }

  origin(id: string): Route {
    return this.origins.get(`${this.index}:${id}`) ?? { kind: 'library' }
  }
  openAlbum(id: string, editor?: 'experience' | 'collection') {
    this.request({ kind: 'album', id, ...(editor ? { editor } : {}) })
  }

  private commit(intent: Intent) {
    if (intent.action) {
      if (!intent.editorId) this.drafts.releaseClean()
      intent.action()
      this.update({ prompt: false, message: '' })
      return
    }
    this.drafts.releaseClean()
    if (intent.index !== undefined) {
      this.allowedIndex = intent.index
      this.update({ prompt: false, restoring: true, message: '' })
      this.browser.history.go(intent.index - this.index)
      return
    }
    if (intent.route.kind === 'album') {
      const source = this.state.route
      const origin: Route =
        source.kind === 'album'
          ? this.origin(source.id)
          : source.kind === 'add'
            ? { kind: 'library' }
            : source
      this.origins.set(
        `${intent.replace ? this.index : this.index + 1}:${intent.route.id}`,
        origin,
      )
    }
    if (intent.replace) this.tag(this.index, intent.route)
    else {
      this.index++
      this.browser.history.pushState(
        { auditoriumNavigation: { session: this.session, index: this.index } },
        '',
        routeHash(intent.route),
      )
    }
    this.update({
      route: intent.route,
      prompt: false,
      restoring: false,
      message: '',
    })
  }

  request(route: Route, replace = false) {
    this.requestIntent({ route, replace })
  }
  requestAction(action: () => void) {
    this.requestIntent({ route: this.state.route, action })
  }
  pendingEditors() {
    return this.intent ? this.relevantDirty(this.intent) : []
  }
  focusFailure() {
    const editor = this.failedEditor
    this.failedEditor = undefined
    editor?.focus?.()
  }

  closeEditor(id: string, action: () => void) {
    this.requestIntent({
      route: this.state.route,
      editorId: id,
      action: () => {
        this.drafts.forget(id)
        action()
      },
    })
  }

  private relevantDirty(intent: Intent) {
    return this.drafts
      .dirty()
      .filter((editor) => !intent.editorId || editor.id === intent.editorId)
  }

  private requestIntent(intent: Intent) {
    if (this.state.restoring || this.state.resolving || this.state.prompt)
      return
    if (
      !intent.action &&
      routeHash(intent.route) === routeHash(this.state.route)
    )
      return
    this.capture()
    if (this.drafts.blocked()) {
      this.update({
        message:
          'Hay un guardado o una lectura pendiente. Termina la operación en el editor antes de salir.',
      })
      return
    }
    if (this.relevantDirty(intent).length) {
      this.intent = intent
      this.promptFocus =
        this.browser.document.activeElement instanceof HTMLElement
          ? this.browser.document.activeElement
          : null
      this.update({ prompt: true, message: '' })
    } else this.commit(intent)
  }

  completed(route: Route, editorId: string) {
    this.drafts.forget(editorId)
    this.drafts.forget('operation')
    if (!this.state.resolving) this.request(route, true)
  }

  cancel = () => {
    if (this.state.resolving || this.state.restoring) return
    this.intent = undefined
    this.update({ prompt: false })
    this.promptFocus?.focus({ preventScroll: true })
  }

  discard = () => {
    if (!this.intent || this.state.resolving || this.state.restoring) return
    const intent = this.intent
    for (const editor of this.relevantDirty(intent))
      this.drafts.forget(editor.id)
    this.intent = undefined
    this.commit(intent)
  }

  saveAndLeave = async () => {
    if (!this.intent || this.state.resolving || this.state.restoring) return
    const intent = this.intent
    this.update({ resolving: true, message: '' })
    for (const editor of this.relevantDirty(intent)) {
      // Publish synchronous validation and busy state before awaiting the write.
      flushSync(() => editor.submit())
      if (!(await this.drafts.settle(editor.id))) {
        this.failedEditor =
          this.drafts.active().find((current) => current.id === editor.id) ??
          editor
        this.intent = undefined
        this.update({
          resolving: false,
          prompt: false,
          message:
            'No se completó la salida. Revisa el editor; los cambios pendientes se conservan.',
        })
        return
      }
    }
    this.intent = undefined
    this.update({ resolving: false })
    this.commit(intent)
  }

  private onHistory = () => {
    const route = parseRoute(this.browser.location.hash)
    const position = this.position()
    if (this.returning && position?.index === this.index) {
      this.returning = false
      this.update({ restoring: false })
      return
    }
    if (
      this.allowedIndex !== undefined &&
      position?.index === this.allowedIndex
    ) {
      this.index = this.allowedIndex
      this.allowedIndex = undefined
      this.update({ route, restoring: false, prompt: false })
      return
    }
    if (this.returning || this.allowedIndex !== undefined) return
    if (
      position?.index === this.index &&
      routeHash(route) === routeHash(this.state.route)
    )
      return
    const guarded =
      this.drafts.unsettled() || this.state.prompt || this.state.resolving
    if (guarded) {
      if (!this.state.prompt && !this.state.resolving) this.capture()
      if (position && position.index !== this.index) {
        this.returning = true
        this.browser.history.go(this.index - position.index)
        this.update({ restoring: true })
      } else this.tag(this.index, this.state.route)
      if (this.drafts.blocked() || this.state.resolving) {
        this.update({
          message:
            'Hay un guardado o una lectura pendiente. Termina la operación en el editor antes de salir.',
        })
      } else if (!this.state.prompt) {
        this.intent = { route, ...(position ? { index: position.index } : {}) }
        this.promptFocus =
          this.browser.document.activeElement instanceof HTMLElement
            ? this.browser.document.activeElement
            : null
        this.update({ prompt: true })
      }
      return
    }
    this.capture()
    this.drafts.releaseClean()
    if (position) this.index = position.index
    else {
      this.index++
      this.tag(this.index, route)
    }
    this.update({ route, message: '' })
  }
}
