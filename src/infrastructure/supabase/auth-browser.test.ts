import { AuthApiError } from '@supabase/supabase-js'
import { afterEach, expect, test, vi } from 'vitest'
import {
  cloudAuthStorage,
  consumeAuthExchangeError,
  consumeAuthReturnError,
} from './auth-browser'

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  history.replaceState(null, '', '/')
})

test.each([
  '#error=access_denied&error_code=otp_expired',
  '?error_description=untrusted-description&code=fictitious-code',
])(
  'un enlace fallido vuelve a Cuenta sin conservar el error en la URL: %s',
  (error) => {
    history.replaceState({ previous: 'kept' }, '', `/Auditorium/${error}`)
    expect(consumeAuthReturnError()).toContain('Solicita uno nuevo')
    expect(location.pathname + location.search + location.hash).toBe(
      '/Auditorium/#/opciones/cuenta',
    )
    expect(history.state).toEqual({ previous: 'kept' })
  },
)

test('un callback válido queda intacto para el intercambio PKCE', () => {
  history.replaceState(
    null,
    '',
    '/Auditorium/?code=fictitious-code&sb_flow_id=fictitious-flow',
  )
  expect(consumeAuthReturnError()).toBe('')
  expect(location.search).toBe(
    '?code=fictitious-code&sb_flow_id=fictitious-flow',
  )
})

test('la recuperación conserva la base y las consultas ajenas a Auth', () => {
  history.replaceState(
    null,
    '',
    '/Auditorium/?entrada=prueba&error=denied#untrusted-fragment',
  )
  consumeAuthReturnError()
  expect(location.pathname + location.search + location.hash).toBe(
    '/Auditorium/?entrada=prueba#/opciones/cuenta',
  )
})

test('un intercambio rechazado limpia el código, conserva datos y notifica al navegador', async () => {
  history.replaceState(
    { previous: 'kept' },
    '',
    '/Auditorium/?entrada=prueba&code=fictitious-code&sb_flow_id=fictitious-flow#/biblioteca',
  )
  sessionStorage.setItem('fictitious-session', 'keep-session')
  localStorage.setItem('fictitious-library', 'keep-library')
  const onHistory = vi.fn()
  window.addEventListener('popstate', onHistory, { once: true })
  const auth = {
    initialize: vi.fn(() =>
      Promise.resolve({
        error: new AuthApiError(
          'fictitious-private-error',
          422,
          'flow_state_expired',
        ),
      }),
    ),
  }
  const notice = await consumeAuthExchangeError(auth)
  expect(notice).toContain('Solicita uno nuevo')
  expect(notice).not.toContain('fictitious-private-error')
  expect(location.pathname + location.search + location.hash).toBe(
    '/Auditorium/?entrada=prueba#/opciones/cuenta',
  )
  expect(history.state).toEqual({ previous: 'kept' })
  expect(onHistory).toHaveBeenCalledOnce()
  expect(sessionStorage.getItem('fictitious-session')).toBe('keep-session')
  expect(localStorage.getItem('fictitious-library')).toBe('keep-library')
})

test('un intercambio correcto conserva su destino y no muestra un fallo', async () => {
  history.replaceState(null, '', '/Auditorium/?code=fictitious-code')
  const auth = {
    initialize: () => {
      history.replaceState(null, '', '/Auditorium/#/opciones/cuenta')
      return Promise.resolve({ error: null })
    },
  }
  expect(await consumeAuthExchangeError(auth)).toBe('')
  expect(location.hash).toBe('#/opciones/cuenta')
})

test('un callback sin verificador ofrece pedir otro enlace', async () => {
  history.replaceState(null, '', '/Auditorium/?code=fictitious-code')
  expect(
    await consumeAuthExchangeError({
      initialize: () => Promise.resolve({ error: null }),
    }),
  ).toContain('Solicita uno nuevo')
  expect(location.search).toBe('')
})

test('no interpreta ni modifica URLs ajenas a un retorno pendiente', async () => {
  history.replaceState(null, '', '/Auditorium/?entrada=prueba#/biblioteca')
  const initialize = vi.fn(() => Promise.resolve({ error: null }))
  expect(await consumeAuthExchangeError({ initialize })).toBe('')
  expect(initialize).not.toHaveBeenCalled()
  expect(location.search + location.hash).toBe('?entrada=prueba#/biblioteca')
})

test('los verificadores de distintos flujos y su índice no se sobrescriben', () => {
  const first = cloudAuthStorage('example.invalid', 'first')
  const second = cloudAuthStorage('example.invalid', 'second')
  const a = 'auditorium-auth:example.invalid:first'
  const b = 'auditorium-auth:example.invalid:second'
  first.setItem(`${a}-flow-aaaaaaaa-code-verifier`, 'first-verifier')
  first.setItem(`${a}-flows-code-verifier`, '["aaaaaaaa"]')
  second.setItem(`${b}-flow-bbbbbbbb-code-verifier`, 'second-verifier')
  second.setItem(`${b}-code-verifier`, 'legacy-verifier')
  expect(second.getItem(`${b}-flow-aaaaaaaa-code-verifier`)).toBe(
    'first-verifier',
  )
  expect(first.getItem(`${a}-flow-bbbbbbbb-code-verifier`)).toBe(
    'second-verifier',
  )
  first.removeItem(`${a}-flow-aaaaaaaa-code-verifier`)
  expect(second.getItem(`${b}-flow-bbbbbbbb-code-verifier`)).toBe(
    'second-verifier',
  )
  expect(first.getItem(`${a}-flows-code-verifier`)).toBe('["aaaaaaaa"]')
  expect(second.getItem(`${b}-code-verifier`)).toBe('legacy-verifier')
})

test('las sesiones no se comparten y otro proyecto no lee los verificadores', () => {
  const first = cloudAuthStorage('example.invalid', 'first')
  const second = cloudAuthStorage('example.invalid', 'second')
  const otherProject = cloudAuthStorage('other.invalid', 'first')
  first.setItem('auditorium-auth:example.invalid:first', 'fictitious-session')
  first.setItem(
    'auditorium-auth:example.invalid:first-code-verifier',
    'fictitious-verifier',
  )
  expect(
    localStorage.getItem('auditorium-auth:example.invalid:first'),
  ).toBeNull()
  expect(second.getItem('auditorium-auth:example.invalid:second')).toBeNull()
  expect(
    otherProject.getItem('auditorium-auth:other.invalid:first-code-verifier'),
  ).toBeNull()
})
