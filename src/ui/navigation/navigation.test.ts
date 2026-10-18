import { afterEach, expect, test, vi } from 'vitest'
import { DraftRegistry, type DraftEditor } from './drafts'
import { NavigationController } from './navigation'

const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  vi.restoreAllMocks()
})
function setup() {
  window.history.replaceState(null, '', '/')
  const drafts = new DraftRegistry()
  const navigation = new NavigationController(drafts)
  stops.push(navigation.start())
  return { drafts, navigation }
}
function editor(change: Partial<DraftEditor> = {}): DraftEditor {
  return {
    id: 'edit-1',
    label: 'Borrador ficticio',
    dirty: true,
    busy: false,
    pendingRead: false,
    submit: () => {},
    ...change,
  }
}

test('las rutas no reemplazan la base de Pages ni su query', () => {
  window.history.replaceState(null, '', '/Auditorium/?entrada=prueba')
  const navigation = new NavigationController(new DraftRegistry())
  stops.push(navigation.start())
  navigation.request({ kind: 'add' })
  expect(location.pathname + location.search + location.hash).toBe(
    '/Auditorium/?entrada=prueba#/anadir',
  )
})

test('cancelar navegación conserva borrador, URL y foco', () => {
  const { drafts, navigation } = setup()
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  drafts.write('edit-1\0title', 'Un título ficticio')
  drafts.update(editor())
  navigation.request({ kind: 'ratings' })
  expect(navigation.getSnapshot().prompt).toBe(true)
  expect(location.hash).toBe('#/biblioteca')
  navigation.cancel()
  expect(drafts.read('edit-1\0title', '')).toBe('Un título ficticio')
  expect(document.activeElement).toBe(input)
  expect(navigation.getSnapshot().route.kind).toBe('library')
  input.remove()
})

test('descartar borra sólo el borrador del editor cancelado', () => {
  const { drafts, navigation } = setup()
  drafts.write('edit-1\0title', 'Descartable')
  drafts.write('edit-2\0title', 'Conservar')
  drafts.update(editor())
  drafts.update(editor({ id: 'edit-2' }))
  const close = vi.fn()
  navigation.closeEditor('edit-1', close)
  expect(navigation.pendingEditors().map((editor) => editor.id)).toEqual([
    'edit-1',
  ])
  navigation.discard()
  expect(close).toHaveBeenCalledOnce()
  expect(drafts.read('edit-1\0title', '')).toBe('')
  expect(drafts.read('edit-2\0title', '')).toBe('Conservar')
})

test('guardar y salir espera confirmación y lectura antes de cambiar ruta', async () => {
  const { drafts, navigation } = setup()
  let finish: (() => void) | undefined
  const draft = editor({
    submit: () => {
      drafts.update({ ...draft, busy: true })
      finish = () => drafts.update({ ...draft, busy: false, dirty: false })
    },
  })
  drafts.update(draft)
  navigation.request({ kind: 'ratings' })
  const saving = navigation.saveAndLeave()
  expect(navigation.getSnapshot().route.kind).toBe('library')
  expect(navigation.getSnapshot().resolving).toBe(true)
  finish?.()
  await saving
  expect(navigation.getSnapshot().route.kind).toBe('ratings')
  expect(draft.submit).toBeDefined()
})

test('validación sin escritura mantiene editor y cancela la salida', async () => {
  const { drafts, navigation } = setup()
  const submit = vi.fn()
  drafts.update(editor({ submit }))
  navigation.request({ kind: 'add' })
  await navigation.saveAndLeave()
  expect(submit).toHaveBeenCalledOnce()
  expect(navigation.getSnapshot().route.kind).toBe('library')
  expect(navigation.getSnapshot().prompt).toBe(false)
  expect(drafts.dirty()).toHaveLength(1)
})

test('lectura fallida después de commit impide repetir escritura o salir', async () => {
  const { drafts, navigation } = setup()
  const submit = vi.fn(() =>
    drafts.update(editor({ dirty: false, pendingRead: true })),
  )
  drafts.update(editor({ submit }))
  navigation.request({ kind: 'ratings' })
  await navigation.saveAndLeave()
  expect(navigation.getSnapshot().route.kind).toBe('library')
  navigation.request({ kind: 'collection' })
  expect(navigation.getSnapshot().route.kind).toBe('library')
  expect(submit).toHaveBeenCalledOnce()
  expect(navigation.getSnapshot().message).toMatch(/pendiente/)
})

test('salida de la pestaña advierte sólo si hay trabajo pendiente', () => {
  const { drafts } = setup()
  const clean = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(clean)
  expect(clean.defaultPrevented).toBe(false)
  drafts.update(editor())
  const dirty = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(dirty)
  expect(dirty.defaultPrevented).toBe(true)
})

test('reiniciar el controlador recupera la posición propia del historial sin datos de borradores', () => {
  const { navigation } = setup()
  navigation.request({ kind: 'add' })
  const position: unknown = window.history.state
  stops.pop()?.()
  const fresh = new NavigationController(new DraftRegistry())
  stops.push(fresh.start())
  expect(window.history.state).toEqual(position)
  expect(fresh.getSnapshot().route.kind).toBe('add')
  expect(fresh.drafts.dirty()).toHaveLength(0)
})
