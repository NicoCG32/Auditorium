export interface DraftEditor {
  id: string
  label: string
  dirty: boolean
  busy: boolean
  pendingRead: boolean
  submit: () => void
  focus?: () => void
}

/** A tab owns these values. They never enter browser storage or backups. */
export class DraftRegistry {
  private values = new Map<string, unknown>()
  private valueListeners = new Map<string, Set<() => void>>()
  private listeners = new Set<() => void>()
  private editors = new Map<string, DraftEditor>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit() {
    for (const listener of this.listeners) listener()
  }

  claim<T>(key: string, initial: () => T): T {
    if (!this.values.has(key)) this.values.set(key, initial())
    return this.values.get(key) as T
  }

  read<T>(key: string, fallback: T): T {
    return this.values.has(key) ? (this.values.get(key) as T) : fallback
  }

  write<T>(key: string, value: T) {
    this.values.set(key, value)
    for (const listener of this.valueListeners.get(key) ?? []) listener()
  }

  subscribeValue(key: string, listener: () => void) {
    const listeners = this.valueListeners.get(key) ?? new Set()
    listeners.add(listener)
    this.valueListeners.set(key, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.valueListeners.delete(key)
    }
  }

  update(editor: DraftEditor) {
    const previous = this.editors.get(editor.id)
    this.editors.set(editor.id, editor)
    if (
      !previous ||
      previous.dirty !== editor.dirty ||
      previous.busy !== editor.busy ||
      previous.pendingRead !== editor.pendingRead ||
      previous.label !== editor.label
    )
      this.emit()
  }

  unregister(id: string) {
    if (this.editors.delete(id)) this.emit()
  }
  active() {
    return [...this.editors.values()]
  }
  dirty() {
    return this.active().filter((editor) => editor.dirty)
  }
  blocked() {
    return this.active().some((editor) => editor.busy || editor.pendingRead)
  }
  unsettled() {
    return this.active().some(
      (editor) => editor.dirty || editor.busy || editor.pendingRead,
    )
  }

  forget(id: string) {
    for (const key of this.values.keys()) {
      if (key.startsWith(`${id}\0`)) {
        this.values.delete(key)
        for (const listener of this.valueListeners.get(key) ?? []) listener()
      }
    }
    this.unregister(id)
  }

  releaseClean() {
    for (const editor of this.active())
      if (!editor.dirty && !editor.busy && !editor.pendingRead)
        this.forget(editor.id)
  }

  async settle(id: string): Promise<boolean> {
    const done = () => {
      const editor = this.editors.get(id)
      if (!editor) return true
      if (!editor.busy) return !editor.dirty && !editor.pendingRead
      return undefined
    }
    const result = done()
    if (result !== undefined) return result
    return new Promise((resolve) => {
      const stop = this.subscribe(() => {
        const result = done()
        if (result !== undefined) {
          stop()
          resolve(result)
        }
      })
    })
  }
}
