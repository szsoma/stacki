import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import SegmentedControl, { type SegmentedOption } from './components/SegmentedControl'

// Sentinel option value for the "Add query" row in the context dropdown — a real
// context key is '' or an `@…` / `bp:…` string, so this can't collide.
export const ADD_QUERY = '\0add-query'

export function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export const QUERY_MODES: SegmentedOption<'wrap' | 'nest'>[] = [
  { value: 'wrap', label: 'Wrap', tooltip: 'New block — @query { selector { … } }' },
  { value: 'nest', label: 'Nest', tooltip: 'Inside the selector — selector { @query { … } }' },
]

export type QuerySuggestion = { query: string; kind: string }

// Common queries offered after any already used in the project — user-preference,
// interaction, orientation/aspect-ratio, container, and feature queries.
export const COMMON_QUERIES: QuerySuggestion[] = [
  { query: '@media (hover: hover)', kind: 'hover' },
  { query: '@media (pointer: coarse)', kind: 'touch' },
  { query: '@media (pointer: fine)', kind: 'pointer' },
  { query: '@media (prefers-color-scheme: dark)', kind: 'dark mode' },
  { query: '@media (prefers-color-scheme: light)', kind: 'light mode' },
  { query: '@media (prefers-reduced-motion: reduce)', kind: 'reduced motion' },
  { query: '@media (prefers-contrast: more)', kind: 'contrast' },
  { query: '@media (orientation: landscape)', kind: 'orientation' },
  { query: '@media (orientation: portrait)', kind: 'orientation' },
  { query: '@media (min-aspect-ratio: 16 / 9)', kind: 'aspect ratio' },
  { query: '@container (width < 50em)', kind: 'container' },
  { query: '@container (width > 30em)', kind: 'container' },
  { query: '@media (min-width: 48em)', kind: 'width' },
  { query: '@media (max-width: 47.99em)', kind: 'width' },
  { query: '@supports (display: grid)', kind: 'supports' },
]

// Inline form to add a custom query (@media/@container/@supports) to the current
// selector, choosing whether it WRAPS the selector (a new at-rule block) or NESTS
// inside the selector's existing rule (CSS nesting). Nesting needs a picked selector.
// The controls sit ABOVE the input so the suggestion list (opened below it) can't
// cover them; the input pre-fills `@` and offers project + common queries.
export function AddQueryForm({ canNest, suggestions, onAdd, onCancel }: {
  canNest: boolean
  suggestions: QuerySuggestion[]
  onAdd: (query: string, mode: 'wrap' | 'nest') => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState('@')
  const [mode, setMode] = useState<'wrap' | 'nest'>('nest')
  const [open, setOpen] = useState(true)
  const [highlight, setHighlight] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Focus with the caret after the pre-filled `@`.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const q = draft.trim().toLowerCase()
  const filtered = useMemo(
    () => suggestions.filter((s) => !q || q === '@' || s.query.toLowerCase().includes(q)),
    [suggestions, q],
  )
  const showList = open && filtered.length > 0
  useEffect(() => {
    if (!showList || highlight < 0) return
    ;(listRef.current?.children[highlight] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
  }, [highlight, showList])

  const submit = (text: string) => { const t = text.trim(); if (t && t !== '@') onAdd(t, canNest ? mode : 'wrap') }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault(); setHighlight((h) => Math.max(h - 1, -1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      submit(showList && highlight >= 0 && filtered[highlight] ? filtered[highlight].query : draft)
    } else if (event.key === 'Tab') {
      const pick = highlight >= 0 ? filtered[highlight] : filtered[0]
      if (showList && pick) { event.preventDefault(); setDraft(pick.query); setHighlight(-1) }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (open && draft.trim() !== '@') setOpen(false)
      else onCancel()
    }
  }

  return (
    <div className="embed-editor_add-query">
      <div className="embed-editor_add-query-controls">
        <SegmentedControl
          className="embed-editor_add-query-mode"
          options={QUERY_MODES}
          value={canNest ? mode : 'wrap'}
          onChange={setMode}
          ariaLabel="How to add the query"
          disabled={!canNest}
          widthMode="hug"
        />
        <div className="embed-editor_add-query-actions">
          <button type="button" className="u-button is-ghost is-small" onClick={onCancel}>Cancel</button>
          <button type="button" className="u-button is-primary is-small" onClick={() => submit(draft)} disabled={draft.trim() === '' || draft.trim() === '@'}>Add</button>
        </div>
      </div>
      {!canNest ? (
        <p className="embed-editor_add-query-note">Pick a selector to nest inside it.</p>
      ) : null}
      <div className="embed-editor_add-query-field">
        <input
          ref={inputRef}
          className="u-input embed-editor_add-query-input"
          value={draft}
          placeholder="@media (width < 50em)"
          spellCheck={false}
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(event) => { setDraft(event.target.value); setOpen(true); setHighlight(-1) }}
          onKeyDown={onKeyDown}
          aria-label="Query to add"
        />
        {showList ? (
          <div className="embed-editor_selector-suggest" ref={listRef} role="listbox" aria-label="Query suggestions">
            {filtered.map((s, i) => (
              <button
                key={`${s.kind}:${s.query}`}
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={`embed-editor_suggest-item ${i === highlight ? 'is-active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setHighlight(i)}
                onClick={() => submit(s.query)}
              >
                <span className="embed-editor_suggest-sel">{s.query}</span>
                <span className="embed-editor_suggest-kind">{s.kind}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
