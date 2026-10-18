import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from '@supabase/supabase-js'
import type { BackupLocalRepository } from '../domain/repositories/local-repository'
import { isEmptySnapshot } from '../domain/backup'
import { IndexedDbRepository } from '../infrastructure/repositories/indexeddb-repository'
import { AuditoriumDatabase } from '../infrastructure/db/database'
import { SupabaseLibraryRepository } from '../infrastructure/supabase/client'
import { LibrarySync } from './library-sync'

export interface AccountState {
  loading: boolean
  user: { id: string; email: string } | null
  repository: BackupLocalRepository
  recovery: boolean
  engine?: LibrarySync
  notice: string
}

export class CloudAccount {
  private readonly client: SupabaseClient
  private readonly guest: BackupLocalRepository
  private readonly createRepository: (id: string) => IndexedDbRepository
  private state: AccountState
  private listeners = new Set<() => void>()
  private libraryListeners = new Set<() => void>()
  private disposeAuth: (() => void) | undefined
  private canSync: () => boolean = () => false
  private active = false
  constructor(
    client: SupabaseClient,
    guest: BackupLocalRepository,
    namespace: string,
    createRepository?: (id: string) => IndexedDbRepository,
  ) {
    this.client = client
    this.guest = guest
    this.createRepository =
      createRepository ??
      ((id) =>
        new IndexedDbRepository({
          database: new AuditoriumDatabase(
            `auditorium-account:${namespace}:${id}`,
          ),
        }))
    this.state = {
      loading: true,
      user: null,
      repository: guest,
      recovery: false,
      notice: '',
    }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  subscribeLibrary = (listener: () => void) => {
    this.libraryListeners.add(listener)
    return () => {
      this.libraryListeners.delete(listener)
    }
  }
  private update(change: Partial<AccountState>) {
    this.state = { ...this.state, ...change }
    this.listeners.forEach((listener) => listener())
  }
  private accept(event: AuthChangeEvent, session: Session | null) {
    if (!this.active) return
    const id = session?.user.id
    if (id !== this.state.user?.id) {
      this.state.engine?.stop()
      if (this.state.repository !== this.guest) this.state.repository.close()
      if (session) {
        const repository = this.createRepository(session.user.id)
        const engine = new LibrarySync(
          repository,
          new SupabaseLibraryRepository(this.client, session.user.id),
          () => this.libraryListeners.forEach((listener) => listener()),
          () => this.canSync(),
        )
        this.update({
          loading: false,
          repository,
          engine,
          user: { id: session.user.id, email: session.user.email ?? '' },
          recovery: event === 'PASSWORD_RECOVERY',
          notice: '',
        })
      } else {
        this.state = {
          loading: false,
          repository: this.guest,
          user: null,
          recovery: false,
          notice: 'Sesión cerrada. Tu biblioteca sin cuenta sigue disponible.',
        }
        this.listeners.forEach((listener) => listener())
      }
    } else
      this.update({
        loading: false,
        recovery: this.state.recovery || event === 'PASSWORD_RECOVERY',
      })
  }
  start() {
    this.active = true
    const { data } = this.client.auth.onAuthStateChange((event, session) =>
      this.accept(event, session),
    )
    this.disposeAuth = () => data.subscription.unsubscribe()
    void this.client.auth.getSession().then(({ data: initial, error }) => {
      if (!this.active || !this.state.loading) return
      if (error)
        this.update({
          loading: false,
          notice:
            'No se pudo recuperar la sesión. Puedes seguir usando la biblioteca local.',
        })
      else this.accept('INITIAL_SESSION', initial.session)
    })
    return () => {
      this.active = false
      this.disposeAuth?.()
    }
  }
  startSync(canSync: () => boolean) {
    this.canSync = canSync
    const tick = () => {
      if (
        !canSync() ||
        !navigator.onLine ||
        document.visibilityState === 'hidden' ||
        this.state.recovery
      )
        return
      if (this.state.engine?.getSnapshot().phase === 'conflict') return
      void this.state.engine?.sync()
    }
    const interval = window.setInterval(tick, 30_000)
    let pendingTimer: number | undefined
    const repository = this.state.repository
    const stopChanges =
      repository instanceof IndexedDbRepository
        ? repository.subscribeChanges(() => {
            this.state.engine?.markDirty()
            clearTimeout(pendingTimer)
            pendingTimer = window.setTimeout(tick, 1200)
          })
        : () => {}
    window.addEventListener('online', tick)
    window.addEventListener('focus', tick)
    const initial = window.setTimeout(tick, 200)
    return () => {
      this.canSync = () => false
      clearInterval(interval)
      clearTimeout(pendingTimer)
      stopChanges()
      clearTimeout(initial)
      window.removeEventListener('online', tick)
      window.removeEventListener('focus', tick)
    }
  }
  async signIn(email: string, password: string) {
    const { error } = await this.client.auth.signInWithPassword({
      email,
      password,
    })
    if (error)
      throw new Error(
        'No se pudo iniciar sesión. Revisa el correo, la contraseña y la confirmación de tu cuenta.',
      )
  }
  async signUp(email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: this.redirectUrl() },
    })
    if (error)
      throw new Error(
        'No se pudo crear la cuenta. Revisa los datos o vuelve a intentar más tarde.',
      )
    return data.session !== null
  }
  async signOut() {
    const { error } = await this.client.auth.signOut({ scope: 'local' })
    if (error)
      throw new Error('No se pudo cerrar la sesión. Vuelve a intentar.')
  }
  private redirectUrl() {
    return new URL(import.meta.env.BASE_URL, window.location.origin).href
  }
  async resetPassword(email: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: this.redirectUrl(),
    })
    if (error)
      throw new Error(
        'No se pudo solicitar el correo de recuperación. Vuelve a intentar más tarde.',
      )
  }
  async updatePassword(password: string) {
    const { error } = await this.client.auth.updateUser({ password })
    if (error)
      throw new Error(
        'No se pudo cambiar la contraseña. Solicita un enlace nuevo o vuelve a intentar.',
      )
    this.update({ recovery: false })
  }
  async importGuest() {
    const engine = this.state.engine,
      repository = this.state.repository
    if (
      !engine ||
      !(repository instanceof IndexedDbRepository) ||
      !this.state.user
    )
      return
    await engine.sync()
    const frame = await repository.readSyncFrame()
    if (
      !isEmptySnapshot(frame.snapshot) ||
      frame.checkpoint.revision !== 0 ||
      frame.checkpoint.pending
    )
      throw new Error(
        'La cuenta ya contiene una biblioteca. Conserva o exporta ambas; no se reemplazan automáticamente.',
      )
    const local = await this.guest.readSnapshot()
    if (isEmptySnapshot(local))
      throw new Error('La biblioteca sin cuenta está vacía.')
    await repository.applySyncFrame(frame, local, frame.checkpoint)
    this.libraryListeners.forEach((listener) => listener())
    await engine.sync()
  }
  async recoveryCopies() {
    const repository = this.state.repository
    if (!(repository instanceof IndexedDbRepository) || !this.state.user) return
    return (await repository.readSyncFrame()).checkpoint.recovery
  }
}
