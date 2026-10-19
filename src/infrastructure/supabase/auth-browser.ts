type AuthStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function cloudAuthStorage(
  project: string,
  tabId: string,
  session: AuthStorage = sessionStorage,
  shared: AuthStorage = localStorage,
) {
  const prefix = `auditorium-auth:${project}:${tabId}`
  const sharedVerifier = (key: string) =>
    key.startsWith(prefix) && key.endsWith('-code-verifier')
  const name = (key: string) => {
    const suffix = key.slice(prefix.length)
    // Keep the legacy verifier address while preserving the SDK's separate
    // flow slots and index. Tokens always keep their tab-specific key.
    return `auditorium-pkce:${project}${suffix === '-code-verifier' ? '' : suffix}`
  }
  const target = (key: string) => (sharedVerifier(key) ? shared : session)
  const address = (key: string) => (sharedVerifier(key) ? name(key) : key)
  return {
    getItem: (key: string) => target(key).getItem(address(key)),
    setItem: (key: string, value: string) =>
      target(key).setItem(address(key), value),
    removeItem: (key: string) => target(key).removeItem(address(key)),
  }
}

export function consumeAuthReturnError(browser: Window = window) {
  const url = new URL(browser.location.href)
  const fragment = new URLSearchParams(url.hash.slice(1))
  const errors = ['error', 'error_code', 'error_description']
  if (!errors.some((key) => url.searchParams.has(key) || fragment.has(key)))
    return ''
  for (const key of [...errors, 'code', 'sb_flow_id'])
    url.searchParams.delete(key)
  url.hash = '#/opciones/cuenta'
  browser.history.replaceState(browser.history.state, '', url.href)
  return 'El enlace de acceso ha caducado, ya fue utilizado o no es válido. Solicita uno nuevo en «Olvidé mi contraseña» y abre sólo el correo más reciente en el mismo navegador.'
}
