import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import { focusFormField } from '../library/form-focus'
import { DraftRegistry, type DraftEditor } from './drafts'

export const DraftContext = createContext<DraftRegistry | undefined>(undefined)

export function useDraftRegistry() {
  return useContext(DraftContext)
}

export function useDraftState<T>(
  id: string,
  slot: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const shared = useDraftRegistry()
  const [local] = useState(() => new DraftRegistry())
  const registry = shared ?? local
  const key = `${id}\0${slot}`
  const fallback = useMemo(
    () =>
      registry.claim(key, () =>
        typeof initial === 'function' ? (initial as () => T)() : initial,
      ),
    [registry, key, initial],
  )
  const subscribe = useCallback(
    (listener: () => void) => registry.subscribeValue(key, listener),
    [registry, key],
  )
  const read = useCallback(
    () => registry.read(key, fallback),
    [registry, key, fallback],
  )
  const value = useSyncExternalStore(subscribe, read)
  const set = useCallback(
    (next: SetStateAction<T>) => {
      registry.write(
        key,
        typeof next === 'function'
          ? (next as (previous: T) => T)(registry.read(key, fallback))
          : next,
      )
    },
    [registry, key, fallback],
  )
  return [value, set]
}

export function useDraftGuard({
  form,
  ...editor
}: Omit<DraftEditor, 'submit'> & { form: RefObject<HTMLFormElement | null> }) {
  const registry = useDraftRegistry()
  useLayoutEffect(() => {
    registry?.update({
      ...editor,
      submit: () => form.current?.requestSubmit(),
      focus:
        editor.focus ??
        (() => {
          const target =
            form.current?.querySelector<HTMLElement>(
              '[aria-invalid="true"], input:invalid, select:invalid, textarea:invalid',
            ) ??
            form.current?.querySelector<HTMLElement>('input, select, textarea')
          focusFormField(target)
        }),
    })
  })
  useLayoutEffect(
    () => () => registry?.unregister(editor.id),
    [registry, editor.id],
  )
}
