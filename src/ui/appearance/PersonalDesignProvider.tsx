import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  parsePersonalDesign,
  type PersonalDesign,
} from '../../domain/personal-design'
import {
  PERSONAL_DESIGN_STORAGE_KEY,
  readPersonalDesign,
  writePersonalDesign,
} from '../../infrastructure/browser/personal-design-storage'
import { PersonalDesignContext } from './personal-design-context'

function Provider({ children }: { children: ReactNode }) {
  const [design, setDesign] = useState(readPersonalDesign)
  const [storageError, setStorageError] = useState<string | null>(null)
  const current = useRef(design)
  const update = useCallback(
    (
      change: (value: PersonalDesign) => PersonalDesign,
      sessionFallback = true,
    ) => {
      const next = change(current.current)
      try {
        writePersonalDesign(next)
        setStorageError(null)
      } catch {
        setStorageError(
          sessionFallback
            ? 'El navegador no permite guardar el diseño. Los cambios se verán durante esta apertura; puedes descargar una copia.'
            : 'No pudimos guardar el diseño. Libera espacio en el navegador y vuelve a intentarlo. Tu diseño anterior se conserva.',
        )
        if (!sessionFallback) return false
      }
      current.current = next
      setDesign(next)
      return true
    },
    [],
  )
  useEffect(() => {
    function refresh(event: StorageEvent) {
      if (event.key !== PERSONAL_DESIGN_STORAGE_KEY || !event.newValue) return
      try {
        const next = parsePersonalDesign(event.newValue)
        current.current = next
        setDesign(next)
        setStorageError(null)
      } catch {
        /* Ignore corrupt or future data from another tab. */
      }
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])
  return (
    <PersonalDesignContext value={{ design, storageError, update }}>
      {children}
    </PersonalDesignContext>
  )
}
export function PersonalDesignProvider({ children }: { children: ReactNode }) {
  const inherited = useContext(PersonalDesignContext)
  return inherited ? children : <Provider>{children}</Provider>
}
