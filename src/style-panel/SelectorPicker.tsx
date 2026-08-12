import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { MatchedSelector } from './lib/resolved'
import { selectorsMatch } from './lib/resolved'

// One entry in the source dropdown: the Webflow class layer, or a specific embed.
// `value` is 'native' or the embed's key; `marked` dots embeds that already carry
// a rule for this element; `fromComponent` flags a component-shared embed.
export type SourceOption = {
  value: string
  label: string
  marked?: boolean
  fromComponent?: boolean
  /** A non-selectable component subheader grouping the embeds beneath it. */
  heading?: boolean
  /** Nested under a component subheader (indented in the list). */
  indent?: boolean
  /** Full name shown on the closed trigger (e.g. "Global Styles #1"), while the
   *  list row stays the group-scoped "Embed #1". */
  triggerLabel?: string
}

// A selector the element can be targeted by, offered as an autocomplete suggestion:
// its tag, each class, each data attribute (presence then valued), and its combo
// class chains.
export type SelectorSuggestion = { selector: string; kind: 'tag' | 'class' | 'attribute' | 'attribute-value' | 'combo' }
export const SUGGESTION_KIND_LABEL: Record<SelectorSuggestion['kind'], string> = {
  tag: 'tag', class: 'class', attribute: 'attribute', 'attribute-value': 'attribute', combo: 'combo',
}

// The selector picker: a chip per selector that styles the element (its own
// classes, stateful, and complex/ancestor selectors), plus an input to add a new
// one. Clicking a chip makes it the edit target (like clicking a combo class);
// the active selector's chip is highlighted, a not-yet-created one dashed. The
// input offers an autocomplete list of the element's targetable selectors:
// ↑/↓ move, Enter applies the highlighted one (or the typed text), Tab fills it
// into the input to keep typing.
export function SelectorPicker({ selectors, suggestions, activeSelector, busy, onSelect, onDeselect, onAdd }: {
  selectors: MatchedSelector[]
  suggestions: SelectorSuggestion[]
  activeSelector: string
  busy: boolean
  onSelect: (selector: string) => void
  onDeselect: () => void
  onAdd: (selector: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [inputOpen, setInputOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wantFocus = useRef(false)
  // The selector that was active when the add input took focus — restored on blur
  // if no new selector was added (cleared once one is, or a chip is clicked instead).
  const restoreRef = useRef<string | null>(null)

  // The add input stays hidden until you click into the well (like Webflow's Style
  // selector) — including while selectors are still loading, so the empty box shows
  // as just the black well (with its min-height) rather than an add-selector field.
  const showInput = inputOpen

  const q = draft.trim().toLowerCase()
  const filtered = useMemo(
    () => suggestions.filter((s) => !q || s.selector.toLowerCase().includes(q)),
    [suggestions, q],
  )
  const showList = open && filtered.length > 0

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    if (!showList || highlight < 0) return
    ;(listRef.current?.children[highlight] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
  }, [highlight, showList])

  // Focus the input once it's revealed by a well click (it may have just mounted).
  useEffect(() => {
    if (showInput && wantFocus.current) { wantFocus.current = false; inputRef.current?.focus() }
  }, [showInput])

  // Clicking empty space in the well reveals + focuses the add input; clicks on a
  // chip (select/deselect), the input, or the suggestion list are left alone.
  const onWellMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (busy) return
    const target = event.target as HTMLElement
    // Clicking a chip selects/deselects it — don't let the input's blur restore the
    // previously-active selector over that choice.
    if (target.closest('.embed-editor_selector-chip')) { restoreRef.current = null; return }
    if (target.closest('.embed-editor_selector-suggest')) return
    if (inputRef.current && target === inputRef.current) return
    event.preventDefault() // keep focus on the input rather than blurring it
    if (showInput) inputRef.current?.focus()
    else { wantFocus.current = true; setInputOpen(true) }
  }

  const apply = (text: string) => {
    const t = text.trim()
    if (!t) return
    restoreRef.current = null // a new selector is now the active one — nothing to restore
    onAdd(t)
    setDraft('')
    setOpen(false)
    setHighlight(-1)
  }
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => Math.max(h - 1, -1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      apply(showList && highlight >= 0 && filtered[highlight] ? filtered[highlight].selector : draft)
    } else if (event.key === 'Tab') {
      // Fill the highlighted (or first) suggestion into the input to keep editing.
      const pick = highlight >= 0 ? filtered[highlight] : filtered[0]
      if (showList && pick) { event.preventDefault(); setDraft(pick.selector); setHighlight(-1) }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      setHighlight(-1)
    }
  }

  return (
    <div className="embed-editor_selectors">
      {/* One grey well wraps the selector tags; clicking empty space reveals the add
          input at its bottom (the input has no chrome of its own). */}
      <div className="embed-editor_selector-well" onMouseDown={onWellMouseDown}>
        {selectors.length ? (
          <div className="embed-editor_selector-chips">
            {selectors.map((sel) => {
              const active = selectorsMatch(sel.text, activeSelector)
              const dimmed = sel.inContext === false
              // Nested rules show their nesting (`.hero { .title }`); selection/matching
              // still uses the resolved selector (sel.text).
              const label = sel.display ?? sel.text
              return (
                <button
                  key={sel.key}
                  type="button"
                  className={`embed-editor_selector-chip ${active ? 'is-active' : ''} ${sel.pending ? 'is-pending' : ''} ${dimmed ? 'is-dimmed' : ''}`}
                  disabled={busy}
                  // Click the active chip again to deselect (show all winners read-only).
                  onClick={() => (active ? onDeselect() : onSelect(sel.text))}
                  title={active ? `${label} — click to deselect` : dimmed ? `${label} — styled in another query` : sel.pending ? `${label} — no styles yet` : label}
                >
                  {label}
                </button>
              )
            })}
          </div>
        ) : null}
        {showInput ? (
          <div className="embed-editor_selector-field">
            <input
              ref={inputRef}
              className="u-input embed-editor_selector-add"
              value={draft}
              placeholder="Add a selector (e.g. .card:hover)"
              spellCheck={false}
              disabled={busy}
              role="combobox"
              aria-expanded={showList}
              aria-autocomplete="list"
              // Focusing the add field clears the active pick — you're composing a new
              // selector, so the panel drops back to showing all winners read-only. Stash
              // the previously-active selector to restore if you leave without adding one.
              onFocus={() => { restoreRef.current = activeSelector || null; onDeselect(); setOpen(true) }}
              // On blur: collapse the empty input, and if no new selector was added,
              // re-select whatever was active before (rather than leaving it deselected).
              onBlur={() => {
                setOpen(false)
                if (!draft.trim()) setInputOpen(false)
                if (restoreRef.current) { onSelect(restoreRef.current); restoreRef.current = null }
              }}
              onChange={(event) => { setDraft(event.target.value); setOpen(true); setHighlight(-1) }}
              onKeyDown={onKeyDown}
              aria-label="Add a selector"
            />
            {showList ? (
              <div className="embed-editor_selector-suggest" ref={listRef} role="listbox" aria-label="Selector suggestions">
                {filtered.map((s, i) => (
                  <button
                    key={`${s.kind}:${s.selector}`}
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    className={`embed-editor_suggest-item ${i === highlight ? 'is-active' : ''}`}
                    // Keep the input focused so its blur doesn't close the list before the click.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setHighlight(i)}
                    onClick={() => apply(s.selector)}
                  >
                    <span className="embed-editor_suggest-sel">{s.selector}</span>
                    <span className="embed-editor_suggest-kind">{SUGGESTION_KIND_LABEL[s.kind]}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
