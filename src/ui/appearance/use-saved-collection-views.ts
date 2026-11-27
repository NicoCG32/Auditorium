import { useEffect, useMemo, useState } from 'react'
import type { LocalIdentity } from '../../domain/identity'
import { SavedCollectionViews } from '../../infrastructure/browser/collection-views'
import type {
  CollectionViewSettings,
  SavedCollectionView,
} from '../../application/collection-views'

export function useSavedCollectionViews(identity: LocalIdentity | undefined) {
  const userId = identity?.userId,
    createdAt = identity?.createdAt
  const store = useMemo(
    () =>
      userId && createdAt
        ? new SavedCollectionViews({ userId, createdAt })
        : undefined,
    [userId, createdAt],
  )
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key === null || (store && event.key?.startsWith(store.prefix)))
        setRevision((value) => value + 1)
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [store])
  const views = useMemo(() => store?.list() ?? [], [store, revision])
  function change<T>(action: (value: SavedCollectionViews) => T): T {
    if (!store) throw new Error('Espera a que termine de abrirse la colección.')
    const result = action(store)
    setRevision((value) => value + 1)
    return result
  }
  return {
    views,
    create: (name: string, settings: CollectionViewSettings) =>
      change((value) => value.create(name, settings)),
    rename: (expected: SavedCollectionView, name: string) =>
      change((value) => value.rename(expected, name)),
    remove: (expected: SavedCollectionView) =>
      change((value) => value.remove(expected)),
    restore: (view: SavedCollectionView) =>
      change((value) => value.restore(view)),
  }
}
export type SavedCollectionViewsState = ReturnType<
  typeof useSavedCollectionViews
>
