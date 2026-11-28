import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { COLLECTION_VIEW_STORAGE_KEY } from '../ui/appearance/use-collection-preferences'
import { PERSONAL_DESIGN_STORAGE_KEY } from '../infrastructure/browser/personal-design-storage'

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
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(COLLECTION_VIEW_STORAGE_KEY)
    localStorage.removeItem(PERSONAL_DESIGN_STORAGE_KEY)
  }
  if (typeof window !== 'undefined')
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    )
})
