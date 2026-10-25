import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type Ref,
} from 'react'
import {
  completeGenre,
  genreToken,
  suggestNames,
  type CatalogSuggestion,
} from '../../application/catalog-suggestions'

type Props = Omit<
  ComponentProps<'input'>,
  'onChange' | 'value' | 'onSelect'
> & {
  value: string
  onChange: (value: string) => void
  options: CatalogSuggestion[]
  onChoose?: (suggestion: CatalogSuggestion) => void
  genres?: boolean
  suggestionsLabel: string
}

/** Editable combobox with manual selection: typing and blur never choose a row. */
export function CatalogNameInput({
  value,
  onChange,
  options,
  onChoose,
  genres = false,
  suggestionsLabel,
  ref,
  ...input
}: Props) {
  const id = useId()
  const field = useRef<HTMLInputElement>(null)
  const selection = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [caret, setCaret] = useState(value.length)
  const [activeId, setActiveId] = useState<string>()
  const token = genres ? genreToken(value, caret) : undefined
  const matches = suggestNames(options, token?.term ?? value, token?.excluded)
  const visible = open && matches.length > 0
  const active = visible
    ? matches.findIndex((option) => option.id === activeId)
    : -1
  useEffect(() => {
    if (active >= 0)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView?.({ block: 'nearest' })
  }, [active, id])
  useLayoutEffect(() => {
    if (selection.current !== undefined) {
      if (document.activeElement === field.current)
        field.current?.setSelectionRange(selection.current, selection.current)
      selection.current = undefined
    }
  }, [value, open])
  function attach(node: HTMLInputElement | null) {
    field.current = node
    const forwarded: Ref<HTMLInputElement> | undefined = ref
    if (typeof forwarded === 'function') forwarded(node)
    else if (forwarded) forwarded.current = node
  }
  function choose(option: CatalogSuggestion) {
    const next = genres
      ? completeGenre(value, caret, option.label)
      : { value: option.label, caret: option.label.length }
    field.current?.focus()
    selection.current = next.caret
    onChange(next.value)
    onChoose?.(option)
    setOpen(false)
    setActiveId(undefined)
    setCaret(next.caret)
  }
  return (
    <span className="catalog-name-input">
      <input
        {...input}
        ref={attach}
        value={value}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? `${id}-options` : undefined}
        aria-activedescendant={
          active >= 0 ? `${id}-option-${active}` : undefined
        }
        onChange={(event) => {
          setCaret(event.target.selectionStart ?? event.target.value.length)
          setActiveId(undefined)
          setOpen(true)
          onChange(event.target.value)
        }}
        onSelect={(event) => {
          const position = event.currentTarget.selectionStart ?? value.length
          if (position !== caret) {
            setCaret(position)
            setActiveId(undefined)
          }
        }}
        onFocus={(event) =>
          setCaret(event.currentTarget.selectionStart ?? value.length)
        }
        onBlur={() => {
          setOpen(false)
          setActiveId(undefined)
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (
            (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
            matches.length
          ) {
            event.preventDefault()
            setOpen(true)
            const next =
              event.key === 'ArrowDown'
                ? Math.min(active + 1, matches.length - 1)
                : active < 0
                  ? matches.length - 1
                  : Math.max(active - 1, 0)
            setActiveId(matches[next]!.id)
          } else if (event.key === 'Enter' && visible) {
            event.preventDefault()
            if (active >= 0) choose(matches[active]!)
            else setOpen(false)
          } else if (event.key === 'Escape' && visible) {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
            setActiveId(undefined)
          } else if (event.key === 'Tab') setOpen(false)
        }}
      />
      {visible ? (
        <span
          id={`${id}-options`}
          role="listbox"
          aria-label={suggestionsLabel}
          className="catalog-suggestions"
        >
          {matches.map((option, index) => (
            <span
              key={option.id}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={active === index}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              className="catalog-suggestion"
            >
              <span>{option.label}</span>
              {option.detail ? <small>{option.detail}</small> : null}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  )
}
