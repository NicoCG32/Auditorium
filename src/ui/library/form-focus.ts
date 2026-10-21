export function focusFormField(field: HTMLElement | null | undefined) {
  for (
    let parent = field?.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (parent instanceof HTMLDetailsElement) parent.open = true
  }
  field?.focus()
}
