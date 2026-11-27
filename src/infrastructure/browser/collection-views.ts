import {
  collectionViewNameSchema,
  collectionViewSettingsSchema,
  savedCollectionViewSchema,
  type CollectionViewSettings,
  type SavedCollectionView,
} from '../../application/collection-views'
import type { LocalIdentity } from '../../domain/identity'
import { canonical } from '../../domain/sync'

type ViewStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>
export const MAX_SAVED_COLLECTION_VIEWS = 20
const nameKey = (name: string) =>
  name.normalize('NFKC').toLocaleLowerCase('es').replace(/\s+/gu, ' ')

/** Each view has its own key, so another tab cannot erase unrelated views. */
export class SavedCollectionViews {
  readonly prefix: string
  private readonly storage: () => ViewStorage
  private readonly createId: () => string
  private cached: SavedCollectionView[] = []

  constructor(
    identity: LocalIdentity,
    options: { storage?: ViewStorage; createId?: () => string } = {},
  ) {
    this.prefix = `auditorium.collection-views.v1.${identity.userId}.${identity.createdAt}.`
    this.storage = () => options.storage ?? localStorage
    this.createId = options.createId ?? (() => crypto.randomUUID())
  }

  list(): SavedCollectionView[] {
    try {
      this.cached = this.read()
    } catch {
      // Already-read views remain usable if browser storage becomes unavailable.
    }
    return structuredClone(this.cached)
  }

  create(
    nameInput: string,
    settingsInput: CollectionViewSettings,
  ): SavedCollectionView {
    const name = collectionViewNameSchema.parse(nameInput)
    const settings = collectionViewSettingsSchema.parse(settingsInput)
    const all = this.readForChange()
    if (all.length >= MAX_SAVED_COLLECTION_VIEWS)
      throw new Error(
        'Puedes guardar hasta 20 vistas. Elimina alguna que ya no uses para guardar otra.',
      )
    this.checkName(name, all)
    const view = savedCollectionViewSchema.parse({
      version: 1,
      id: this.createId(),
      name,
      settings,
    })
    try {
      const storage = this.storage()
      if (storage.getItem(this.prefix + view.id) !== null)
        throw new Error('Identificador de vista ya utilizado.')
      storage.setItem(this.prefix + view.id, JSON.stringify(view))
    } catch {
      throw new Error(
        'No pudimos guardar la vista en este navegador. Puedes seguir usando los filtros y volver a intentar.',
      )
    }
    return view
  }

  rename(
    expected: SavedCollectionView,
    nameInput: string,
  ): SavedCollectionView {
    const name = collectionViewNameSchema.parse(nameInput)
    const all = this.readForChange()
    const current = this.requireCurrent(expected, all)
    this.checkName(
      name,
      all.filter((view) => view.id !== current.id),
    )
    const next = { ...current, name }
    try {
      this.storage().setItem(this.prefix + next.id, JSON.stringify(next))
    } catch {
      throw new Error(
        'No pudimos guardar el nombre. La vista anterior se conserva.',
      )
    }
    return next
  }

  remove(expected: SavedCollectionView): void {
    const current = this.requireCurrent(expected, this.readForChange())
    try {
      this.storage().removeItem(this.prefix + current.id)
    } catch {
      throw new Error('No pudimos eliminar la vista. Vuelve a intentar.')
    }
  }

  restore(viewInput: SavedCollectionView): void {
    const view = savedCollectionViewSchema.parse(viewInput)
    const all = this.readForChange()
    if (all.length >= MAX_SAVED_COLLECTION_VIEWS)
      throw new Error('Ya tienes 20 vistas guardadas.')
    this.checkName(view.name, all)
    try {
      const storage = this.storage()
      if (storage.getItem(this.prefix + view.id) !== null)
        throw new Error('La vista ya existe.')
      storage.setItem(this.prefix + view.id, JSON.stringify(view))
    } catch {
      throw new Error('No pudimos recuperar la vista. Vuelve a intentar.')
    }
  }

  private checkName(name: string, views: SavedCollectionView[]) {
    if (views.some((view) => nameKey(view.name) === nameKey(name)))
      throw new Error('Ya tienes una vista con ese nombre. Elige otro.')
  }
  private read(): SavedCollectionView[] {
    const storage = this.storage()
    const found: SavedCollectionView[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (!key?.startsWith(this.prefix)) continue
      // A failed storage read must not look like an absent or corrupt record.
      const raw = storage.getItem(key)
      try {
        const view = savedCollectionViewSchema.safeParse(
          JSON.parse(raw ?? 'null'),
        )
        if (view.success && key === this.prefix + view.data.id)
          found.push(view.data)
      } catch {
        // Invalid or future records remain untouched in browser storage.
      }
    }
    return found.toSorted((a, b) => a.name.localeCompare(b.name, 'es'))
  }
  private readForChange(): SavedCollectionView[] {
    try {
      return this.read()
    } catch {
      throw new Error(
        'No pudimos leer las vistas guardadas. Vuelve a intentar antes de modificarlas.',
      )
    }
  }
  private requireCurrent(
    expected: SavedCollectionView,
    views: SavedCollectionView[],
  ) {
    const current = views.find((view) => view.id === expected.id)
    if (!current || canonical(current) !== canonical(expected))
      throw new Error(
        'Esta vista cambió en otra ventana. Vuelve a abrirla antes de modificarla.',
      )
    return current
  }
}
