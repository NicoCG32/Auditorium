import { expect, test, vi } from 'vitest'
import { defaultLibraryFilters } from '../../application/library-query'
import {
  collectionViewSettingsSchema,
  sameCollectionView,
} from '../../application/collection-views'
import { fixtureId } from '../../domain/catalog/catalog.fixture'
import { libraryIds, times } from '../../domain/library/library.fixture'
import {
  MAX_SAVED_COLLECTION_VIEWS,
  SavedCollectionViews,
} from './collection-views'

const identity = { userId: libraryIds.user, createdAt: times.added }
const settings = collectionViewSettingsSchema.parse({
  filters: { ...defaultLibraryFilters, order: 'artist', genre: 'Death Metal' },
  medium: 'physical',
  format: 'vinyl',
  view: 'list',
})
function setup() {
  const records = new Map<string, string>()
  const storage = {
    get length() {
      return records.size
    },
    key: (index: number) => [...records.keys()][index] ?? null,
    getItem: vi.fn((key: string) => records.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      records.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      records.delete(key)
    }),
  }
  let nextId = 9600
  const options = { storage, createId: () => fixtureId(nextId++) }
  return {
    records,
    storage,
    options,
    store: new SavedCollectionViews(identity, options),
  }
}

test('crear y renombrar conserva filtros, formato, orden y vista al reabrir, sin compartir identidad', () => {
  const { store, options } = setup()
  const first = store.create('  Mis vinilos  ', settings)
  expect(first.name).toBe('Mis vinilos')
  store.rename(first, 'Vinilos de casa')
  const restored = new SavedCollectionViews(identity, options).list()
  expect(restored).toEqual([{ ...first, name: 'Vinilos de casa' }])
  expect(restored[0]!.settings).toEqual(settings)
  for (const changed of [
    { ...identity, userId: libraryIds.otherUser },
    { ...identity, createdAt: times.later },
  ]) {
    expect(new SavedCollectionViews(changed, options).list()).toEqual([])
  }
})

test('dos ventanas conservan vistas distintas y rechazan una edición o eliminación obsoleta', () => {
  const { store, options } = setup()
  const secondWindow = new SavedCollectionViews(identity, options)
  const first = store.create('Vinilos', settings)
  const second = secondWindow.create('Para escuchar', {
    ...settings,
    filters: { ...settings.filters, listening: 'queued' },
  })
  expect(store.list()).toHaveLength(2)
  const updated = secondWindow.rename(first, 'Mis vinilos')
  expect(() => store.rename(first, 'Nombre obsoleto')).toThrow('otra ventana')
  expect(() => store.remove(first)).toThrow('otra ventana')
  expect(store.list()).toEqual(expect.arrayContaining([updated, second]))
  store.remove(updated)
  expect(secondWindow.list()).toEqual([second])
  store.restore(updated)
  expect(secondWindow.list()).toHaveLength(2)
})

test('los nombres se validan y no permiten duplicados equivalentes', () => {
  const { store } = setup()
  const first = store.create('Mis   vinilos', settings)
  expect(() => store.create('  MIS vinilos  ', settings)).toThrow('ese nombre')
  expect(() => store.create('Ｍis vinilos', settings)).toThrow('ese nombre')
  for (const name of ['', '  ', 'a'.repeat(61), 'Dos\nlíneas'])
    expect(() => store.create(name, settings)).toThrow()
  const other = store.create('Otra', settings)
  expect(() => store.rename(other, first.name)).toThrow('ese nombre')
  expect(store.list()).toHaveLength(2)
})

test('límite y deshacer no reemplazan vistas existentes', () => {
  const { store } = setup()
  const removed = store.create('Primera', settings)
  store.remove(removed)
  for (let index = 0; index < MAX_SAVED_COLLECTION_VIEWS; index++)
    store.create(`Vista ${index}`, settings)
  const before = store.list()
  expect(() => store.create('Otra más', settings)).toThrow('20 vistas')
  expect(() => store.restore(removed)).toThrow('20 vistas')
  expect(store.list()).toEqual(before)
})

test('registros dañados, futuros o con clave ajena permanecen intactos y no impiden usar las vistas válidas', () => {
  const { store, records } = setup()
  const valid = store.create('Una vista', settings)
  records.set(store.prefix + fixtureId(9700), '{')
  records.set(
    store.prefix + fixtureId(9701),
    JSON.stringify({ ...valid, version: 2 }),
  )
  records.set(store.prefix + fixtureId(9702), JSON.stringify(valid))
  records.set('otro-producto', 'no tocar')
  const before = new Map(records)
  expect(store.list()).toEqual([valid])
  expect(records).toEqual(before)
  records.set(store.prefix + valid.id, JSON.stringify({ ...valid, version: 2 }))
  expect(() => store.remove(valid)).toThrow('otra ventana')
  expect(records.get(store.prefix + valid.id)).toContain('"version":2')
})

test('un fallo de lectura conserva la última lista pero bloquea las escrituras sobre datos no comprobados', () => {
  const { store, storage, records } = setup()
  const first = store.create('Vinilos', settings)
  expect(store.list()).toEqual([first])
  const before = new Map(records)
  storage.getItem.mockImplementation(() => {
    throw new Error('Lectura bloqueada')
  })
  expect(store.list()).toEqual([first])
  for (const change of [
    () => store.create('Otra', settings),
    () => store.rename(first, 'Otro nombre'),
    () => store.remove(first),
    () => store.restore(first),
  ])
    expect(change).toThrow('leer las vistas')
  expect(records).toEqual(before)
})

test('cuota de escritura o eliminación fallida no fingen éxito y conservan el registro anterior', () => {
  const { store, storage, records } = setup()
  const first = store.create('Vinilos', settings)
  const before = new Map(records)
  storage.setItem.mockImplementation(() => {
    throw new DOMException('Cuota', 'QuotaExceededError')
  })
  expect(() => store.create('Otra', settings)).toThrow('No pudimos guardar')
  expect(() => store.rename(first, 'Otro nombre')).toThrow(
    'vista anterior se conserva',
  )
  storage.removeItem.mockImplementation(() => {
    throw new Error('Bloqueado')
  })
  expect(() => store.remove(first)).toThrow('No pudimos eliminar')
  expect(records).toEqual(before)
})

test('no se puede deshacer sobre una vista o un nombre que otra ventana ya reutilizó', () => {
  const { store } = setup()
  const first = store.create('Vinilos', settings)
  expect(() => store.restore(first)).toThrow()
  store.remove(first)
  const other = store.create('Vinilos', settings)
  expect(() => store.restore(first)).toThrow('ese nombre')
  expect(store.list()).toEqual([other])
})

test('la lista no permite modificar los registros desde fuera y la igualdad normaliza filtros opcionales', () => {
  const { store } = setup()
  const first = store.create('Vinilos', settings)
  store.list()[0]!.settings.filters.search = 'No persistir'
  expect(store.list()).toEqual([first])
  const normalized = collectionViewSettingsSchema.parse({
    ...settings,
    filters: { search: '', listening: 'all', rating: 'all', order: 'artist' },
  })
  expect(
    sameCollectionView(normalized, {
      ...normalized,
      filters: {
        ...normalized.filters,
        genre: '',
        country: '',
        ratingBasis: 'auto',
      },
    }),
  ).toBe(true)
  expect(() =>
    collectionViewSettingsSchema.parse({ ...settings, medium: 'digital' }),
  ).toThrow()
  expect(() =>
    collectionViewSettingsSchema.parse({
      ...settings,
      filters: { ...settings.filters, unknown: true },
    }),
  ).toThrow()
})
