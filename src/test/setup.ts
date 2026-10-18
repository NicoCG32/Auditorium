import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom does not implement viewport scrolling or modal dialog behavior.
if (typeof window !== 'undefined')
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    value: () => {},
  })
if (
  typeof HTMLDialogElement !== 'undefined' &&
  !HTMLDialogElement.prototype.showModal
) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
}

afterEach(() => {
  cleanup()
  if (typeof window !== 'undefined')
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    )
})
