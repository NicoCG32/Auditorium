import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import type { CloudAccount } from '../../application/cloud-account'
import { useDraftGuard } from '../navigation/draft-context'
import { downloadBackup } from '../../infrastructure/browser/backup-download'
import { BACKUP_SCHEMA_VERSION, serializeBackup } from '../../domain/backup'
import type { LocalSnapshot } from '../../domain/repositories/local-repository'

export function AccountPanel({ account }: { account: CloudAccount }) {
  const state = useSyncExternalStore(account.subscribe, account.getSnapshot)
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resolution, setResolution] = useState<'local' | 'remote'>()
  const form = useRef<HTMLFormElement>(null)
  useDraftGuard({
    id: 'account',
    label: 'Cuenta y sincronización',
    dirty: false,
    busy,
    pendingRead: false,
    form,
  })
  async function act(action: () => Promise<void>, message: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(message)
      form.current?.reset()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo completar la operación.',
      )
    } finally {
      setBusy(false)
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const emailInput = data.get('email'),
      passwordInput = data.get('password')
    const email = typeof emailInput === 'string' ? emailInput.trim() : ''
    const password = typeof passwordInput === 'string' ? passwordInput : ''
    // Passwords only live in this form and the Auth request; never draft storage.
    void act(
      async () => {
        if (state.recovery) await account.updatePassword(password)
        else if (mode === 'login') await account.signIn(email, password)
        else if (mode === 'register') await account.signUp(email, password)
        else await account.resetPassword(email)
      },
      state.recovery
        ? 'Contraseña actualizada.'
        : mode === 'register'
          ? 'Revisa tu correo para confirmar la cuenta antes de iniciar sesión.'
          : mode === 'reset'
            ? 'Si el correo corresponde a una cuenta, recibirás un enlace de recuperación.'
            : 'Sesión iniciada.',
    )
    // Clear immediately even when the network fails.
    const input = form.current?.elements.namedItem('password')
    if (input instanceof HTMLInputElement) input.value = ''
  }
  return (
    <section className="panel-surface p-6" aria-label="Cuenta y dispositivos">
      {state.user && !state.recovery ? (
        <>
          <h2 className="text-xl font-semibold">Tu biblioteca conectada</h2>
          <p className="mt-3 text-muted">
            Sesión de {state.user.email}. Inicia sesión con esta misma cuenta en
            tus otros dispositivos.
          </p>
          <p className="mt-3 text-sm text-muted">
            Los cambios guardados se sincronizan con conexión cuando terminas de
            editar. Puedes continuar sin conexión en este dispositivo.
          </p>
          {state.engine ? (
            <SyncControls
              engine={state.engine}
              busy={busy}
              act={act}
              resolution={resolution}
              onResolution={setResolution}
            />
          ) : null}
          <details className="mt-6">
            <summary>Traer mi biblioteca sin cuenta</summary>
            <p className="my-3 text-sm text-muted">
              Copia la biblioteca de este navegador a una cuenta vacía. El
              original se conserva; una cuenta con datos no se reemplaza.
            </p>
            <button
              type="button"
              className="action-button"
              disabled={busy}
              onClick={() =>
                void act(
                  () => account.importGuest(),
                  'Biblioteca local incorporada. Comprueba el estado de sincronización.',
                )
              }
            >
              Copiar biblioteca a mi cuenta
            </button>
          </details>
          <details className="mt-4">
            <summary>Copias de la última resolución de conflicto</summary>
            <p className="my-3 text-sm text-muted">
              Si elegiste una biblioteca para resolver un conflicto, puedes
              recuperar aquí las dos copias anteriores. Se conserva la última
              resolución en este dispositivo.
            </p>
            <div className="flex flex-wrap gap-3">
              {(['local', 'remote'] as const).map((copy) => (
                <button
                  key={copy}
                  className="action-button"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const recovery = await account.recoveryCopies()
                      if (!recovery)
                        throw new Error(
                          'Todavía no hay copias de conflictos guardadas en este dispositivo.',
                        )
                      exportCopy(recovery[copy], `resolucion-${copy}`)
                    }, 'Descarga de la copia anterior iniciada.')
                  }
                >
                  Descargar copia anterior{' '}
                  {copy === 'local' ? 'local' : 'remota'}
                </button>
              ))}
            </div>
          </details>
          <p className="mt-6 text-sm text-muted">
            La sesión termina al cerrar esta pestaña. La copia de la biblioteca
            permanece en este navegador; usa un perfil propio en dispositivos
            compartidos.
          </p>
          <button
            type="button"
            className="text-button mt-4"
            disabled={busy}
            onClick={() => void act(() => account.signOut(), '')}
          >
            Cerrar sesión
          </button>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold">
            {state.recovery
              ? 'Elige una contraseña nueva'
              : mode === 'register'
                ? 'Crear cuenta'
                : mode === 'reset'
                  ? 'Recuperar contraseña'
                  : 'Iniciar sesión'}
          </h2>
          <p className="mt-3 text-sm text-muted">
            {state.recovery
              ? 'Guarda una contraseña nueva para volver a acceder a tu biblioteca.'
              : 'Accede a la misma biblioteca desde tus dispositivos. Tu biblioteca sin cuenta se conserva por separado.'}
          </p>
          <form
            ref={form}
            onSubmit={submit}
            className="mt-5 grid max-w-md gap-4"
          >
            {!state.recovery && (
              <label>
                Correo electrónico
                <input
                  className="text-input mt-1 w-full"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  disabled={busy}
                />
              </label>
            )}
            {(state.recovery || mode !== 'reset') && (
              <label>
                Contraseña
                <input
                  className="text-input mt-1 w-full"
                  name="password"
                  type="password"
                  minLength={state.recovery || mode === 'register' ? 12 : 1}
                  required
                  autoComplete={
                    state.recovery || mode === 'register'
                      ? 'new-password'
                      : 'current-password'
                  }
                  disabled={busy}
                />
              </label>
            )}
            {(state.recovery || mode === 'register') && (
              <p className="text-sm text-muted">
                Utiliza al menos 12 caracteres.
              </p>
            )}
            <button type="submit" className="primary-button" disabled={busy}>
              {busy
                ? 'Procesando…'
                : state.recovery
                  ? 'Guardar contraseña'
                  : mode === 'register'
                    ? 'Crear cuenta'
                    : mode === 'reset'
                      ? 'Enviar enlace'
                      : 'Entrar'}
            </button>
          </form>
          {!state.recovery && (
            <div className="mt-4 flex flex-wrap gap-4">
              {(['login', 'register', 'reset'] as const)
                .filter((next) => next !== mode)
                .map((next) => (
                  <button
                    type="button"
                    className="text-button"
                    key={next}
                    disabled={busy}
                    onClick={() => {
                      setMode(next)
                      setError('')
                      setNotice('')
                      form.current?.reset()
                    }}
                  >
                    {next === 'login'
                      ? 'Ya tengo una cuenta'
                      : next === 'register'
                        ? 'Crear una cuenta'
                        : 'Olvidé mi contraseña'}
                  </button>
                ))}
            </div>
          )}
        </>
      )}
      {busy && (
        <p role="status" className="mt-4">
          Procesando tu solicitud…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4">
          {notice}
        </p>
      )}
    </section>
  )
}

function exportCopy(snapshot: LocalSnapshot, name: string) {
  const exportedAt = new Date().toISOString()
  downloadBackup(
    serializeBackup({
      format: 'auditorium-backup',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt,
      data: snapshot,
    }),
    `${name}-${exportedAt}`,
  )
}

function SyncControls({
  engine,
  busy,
  act,
  resolution,
  onResolution,
}: {
  engine: NonNullable<ReturnType<CloudAccount['getSnapshot']>['engine']>
  busy: boolean
  act: (action: () => Promise<void>, message: string) => Promise<void>
  resolution: 'local' | 'remote' | undefined
  onResolution: (value: 'local' | 'remote' | undefined) => void
}) {
  const sync = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  return (
    <div className="mt-5">
      <p role="status">{sync.message}</p>
      {sync.conflict ? (
        <div className="mt-4 border border-current p-4">
          <p>
            Se conservarán ambas copias en este dispositivo antes de aplicar tu
            elección. También puedes descargarlas como respaldo.
          </p>
          <div className="my-4 flex flex-wrap gap-3">
            <button
              className="action-button"
              type="button"
              disabled={busy}
              onClick={() =>
                exportCopy(
                  sync.conflict!.frame.snapshot,
                  'auditorium-conflicto-local.json',
                )
              }
            >
              Descargar copia local
            </button>
            <button
              className="action-button"
              type="button"
              disabled={busy}
              onClick={() =>
                exportCopy(
                  sync.conflict!.remote.snapshot,
                  'auditorium-conflicto-remota.json',
                )
              }
            >
              Descargar copia remota
            </button>
          </div>
          <label>
            Biblioteca que deseas conservar
            <select
              className="text-input mt-2 block"
              value={resolution ?? ''}
              disabled={busy}
              onChange={(event) =>
                onResolution(
                  event.target.value === 'local' ||
                    event.target.value === 'remote'
                    ? event.target.value
                    : undefined,
                )
              }
            >
              <option value="">Seleccionar…</option>
              <option value="local">La de este dispositivo</option>
              <option value="remote">La de la cuenta</option>
            </select>
          </label>
          <p className="mt-3 text-sm text-muted">
            La elección reemplaza los datos de la otra copia. Si otro
            dispositivo cambia la cuenta mientras eliges, volveremos a comprobar
            el conflicto.
          </p>
          <button
            className="action-button mt-4"
            type="button"
            disabled={busy || !resolution}
            onClick={() =>
              void act(async () => {
                if (resolution) await engine.resolve(resolution)
                onResolution(undefined)
              }, 'Elección aplicada. Las dos copias anteriores se conservaron en este dispositivo.')
            }
          >
            Confirmar biblioteca elegida
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="action-button mt-3"
          disabled={busy || sync.phase === 'syncing'}
          onClick={() => void act(() => engine.sync(), '')}
        >
          Sincronizar ahora
        </button>
      )}
    </div>
  )
}
