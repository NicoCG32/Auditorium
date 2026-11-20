import { act, renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  defaultCollectionPreferences,
  COLLECTION_VIEW_STORAGE_KEY,
  useCollectionViewState,
} from './use-collection-preferences'

test('personalización, vista y orden se conservan al volver a abrir sin guardar datos musicales', () => {
  const first = renderHook(useCollectionViewState)
  act(() =>
    first.result.current.update({
      name: 'Los discos de casa',
      covers: 'small',
      view: 'list',
      order: 'title',
      details: true,
    }),
  )
  first.unmount()
  const restored = renderHook(useCollectionViewState)
  expect(restored.result.current).toMatchObject({
    name: 'Los discos de casa',
    covers: 'small',
    view: 'list',
    order: 'title',
    details: true,
  })
  expect(
    JSON.parse(localStorage.getItem(COLLECTION_VIEW_STORAGE_KEY)!),
  ).toEqual({
    name: 'Los discos de casa',
    covers: 'small',
    view: 'list',
    order: 'title',
    details: true,
  })
})

test('preferencias incompletas o dañadas no impiden abrir la colección', () => {
  for (const value of [
    '{',
    '[]',
    JSON.stringify({
      name: 42,
      view: 'shelf',
      covers: 'future',
      order: 'future',
      details: 'true',
    }),
  ]) {
    localStorage.setItem(COLLECTION_VIEW_STORAGE_KEY, value)
    const result = renderHook(useCollectionViewState)
    expect(result.result.current).toMatchObject(defaultCollectionPreferences)
    result.unmount()
  }
})

test('sin almacenamiento disponible los cambios de presentación siguen funcionando', () => {
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Bloqueado')
  })
  const write = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('Bloqueado')
    })
  try {
    const { result } = renderHook(useCollectionViewState)
    act(() => result.current.update({ view: 'list', covers: 'large' }))
    expect(result.current).toMatchObject({ view: 'list', covers: 'large' })
  } finally {
    read.mockRestore()
    write.mockRestore()
  }
})
