import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { DraftRegistry } from './drafts'
import { DraftContext } from './draft-context'
import { NavigationController } from './navigation'
import { NavigationContext } from './navigation-context'

function DraftDialog({ navigation }: { navigation: NavigationController }) {
  const state = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
  )
  const dialog = useRef<HTMLDialogElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (state.prompt) {
      dialog.current?.showModal()
      keep.current?.focus()
    } else {
      dialog.current?.close()
      navigation.focusFailure()
    }
  }, [state.prompt, navigation])
  return (
    <>
      {state.message ? (
        <p role="alert" className="navigation-notice">
          {state.message}
        </p>
      ) : null}
      <dialog
        ref={dialog}
        aria-labelledby="draft-dialog-title"
        className="draft-dialog"
        onCancel={(event) => {
          event.preventDefault()
          navigation.cancel()
        }}
      >
        <h2 id="draft-dialog-title" className="text-xl font-semibold">
          Cambios sin guardar
        </h2>
        <p className="mt-3 text-sm text-muted">
          Antes de salir, guarda los cambios o descártalos. También puedes
          seguir editando.
        </p>
        <ul className="my-4 text-sm">
          {navigation.pendingEditors().map((editor) => (
            <li key={editor.id}>{editor.label}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="primary-button"
            disabled={state.resolving || state.restoring}
            onClick={() => void navigation.saveAndLeave()}
          >
            Guardar y salir
          </button>
          <button
            type="button"
            className="action-button"
            disabled={state.resolving || state.restoring}
            onClick={navigation.discard}
          >
            Descartar cambios
          </button>
          <button
            ref={keep}
            type="button"
            className="text-button"
            disabled={state.resolving || state.restoring}
            onClick={navigation.cancel}
          >
            Seguir editando
          </button>
        </div>
        {state.resolving ? (
          <p role="status" className="mt-4 text-sm">
            Guardando los cambios pendientes…
          </p>
        ) : null}
      </dialog>
    </>
  )
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new DraftRegistry())
  const [navigation] = useState(() => new NavigationController(drafts))
  useEffect(() => navigation.start(), [navigation])
  return (
    <DraftContext value={drafts}>
      <NavigationContext value={navigation}>
        {children}
        <DraftDialog navigation={navigation} />
      </NavigationContext>
    </DraftContext>
  )
}
