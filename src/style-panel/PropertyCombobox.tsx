import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { filterCssProperties } from './lib/css-properties'

// The property-name field with an autocomplete of every CSS property. The suggestion
// list is portaled to <body> and positioned above the input (the add row sits at the
// panel bottom), flipping below only when there's more room there. Arrow keys move the
// highlight, Enter/Tab/click pick it; Enter with nothing highlighted submits the row and
// Escape closes the list (a second Escape cancels the row).
function PropertyCombobox({ value, busy, onChange, onPick, onEnter, onEscape }: {
  value: string
  busy: boolean
  onChange: (value: string) => void
  onPick: (prop: string) => void
  onEnter: () => void
  onEscape: () => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const matches = useMemo(() => filterCssProperties(value), [value])
  const [pos, setPos] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' })

  // Reset the highlight to the top whenever the query (and so the list) changes.
  useEffect(() => { setActive(0) }, [value])

  // Position the list vertically against the input (above it, flipping below only when
  // there's more room there); span the FULL panel width — left:0/right:0 — like the
  // variable picker, so long property names aren't truncated in the input's narrow column.
  useLayoutEffect(() => {
    if (!open) return
    const input = inputRef.current
    if (!input) return
    const r = input.getBoundingClientRect()
    const margin = 8
    const gap = 4
    const spaceAbove = r.top - margin
    const spaceBelow = window.innerHeight - r.bottom - margin
    const up = spaceAbove >= spaceBelow
    const maxHeight = Math.max(120, Math.min(340, (up ? spaceAbove : spaceBelow) - gap))
    setPos(up
      ? { position: 'fixed', left: 0, right: 0, bottom: window.innerHeight - r.top + gap, maxHeight, visibility: 'visible' }
      : { position: 'fixed', left: 0, right: 0, top: r.bottom + gap, maxHeight, visibility: 'visible' })
  }, [open, matches.length, value])

  // Keep the highlighted option scrolled into view during keyboard nav.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const choose = (prop: string) => { onPick(prop); setOpen(false) }

  return (
    <div className="embed-editor_propcombo">
      <input
        ref={inputRef}
        className="u-input embed-editor_prop-input"
        value={value}
        autoFocus
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        disabled={busy}
        onChange={(event) => { onChange(event.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!open) { setOpen(true); return }
            setActive((a) => Math.min(a + 1, matches.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (open) setActive((a) => Math.max(a - 1, 0))
          } else if (event.key === 'Enter') {
            if (open && matches[active]) { event.preventDefault(); choose(matches[active]) }
            else onEnter()
          } else if (event.key === 'Tab') {
            if (open && matches[active]) { event.preventDefault(); choose(matches[active]) }
          } else if (event.key === 'Escape') {
            if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false) }
            else onEscape()
          }
        }}
        placeholder="property"
        spellCheck={false}
        aria-label="New property name"
      />
      {open && matches.length ? createPortal(
        <div ref={listRef} className="embed-editor_propsuggest" style={pos} role="listbox" aria-label="CSS properties">
          {matches.map((prop, i) => (
            <button
              key={prop}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`embed-editor_propsuggest-item${i === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              // mousedown (not click) + preventDefault so the input never blurs first.
              onMouseDown={(event) => { event.preventDefault(); choose(prop) }}
            >
              {prop}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

export { PropertyCombobox }
