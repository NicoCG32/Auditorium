import { afterEach, expect, test, vi } from 'vitest'
import { downloadBackup } from './backup-download'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
test('descarga Blob JSON con nombre seguro, dispara una vez y libera enlace/URL', () => {
  vi.useFakeTimers()
  const create = vi
      .fn<(blob: Blob) => string>()
      .mockReturnValue('blob:fixture-download'),
    revoke = vi.fn<(url: string) => void>()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = create
      static override revokeObjectURL = revoke
    },
  )
  let captured: { href: string; filename: string } | undefined
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      captured = { href: this.href, filename: this.download }
      expect(this.parentElement).toBe(document.body)
    })
  const text = '{"ficticio":"á"}\n'
  downloadBackup(text, '2026-01-01T12:10:00.000Z')
  expect(click).toHaveBeenCalledTimes(1)
  expect(captured).toEqual({
    href: 'blob:fixture-download',
    filename: 'auditorium-2026-01-01T12-10-00-000Z.json',
  })
  expect(create.mock.calls[0]?.[0].type).toBe('application/json;charset=utf-8')
  expect(create.mock.calls[0]?.[0].size).toBe(
    new TextEncoder().encode(text).byteLength,
  )
  expect(document.querySelector('a[download]')).toBeNull()
  expect(revoke).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1000)
  expect(revoke).toHaveBeenCalledWith('blob:fixture-download')
})
