import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { handleArrowStep } from './lib/number-step'
import { parseImportant } from './embedHelpers'

// The value reads as a single scrollable line when idle. Once focused, it
// expands to a full-width, auto-height field the moment its content is too long
// to sit on one line — so long values wrap and grow tall instead of scrolling.
const ValueField = forwardRef<HTMLTextAreaElement, {
  value: string
  important: boolean
  busy: boolean
  /** Marks the field with [data-prop] so it can be focused programmatically. */
  dataProp?: string
  onCommit: (value: string, important: boolean) => void
  /** Fires (debounced) on every keystroke/step to push the value to the embed live. */
  onLiveCommit: (value: string, important: boolean) => void
}>(function ValueField({ value, important, busy, dataProp, onCommit, onLiveCommit }, forwardedRef) {
  const external = important ? `${value} !important` : value
  const [draft, setDraft] = useState(external)
  const [expanded, setExpanded] = useState(false)
  const focused = useRef(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  // Keep the local ref (used for sizing/caret work) and hand the same node to
  // whoever wrapped us.
  const attachRef = (el: HTMLTextAreaElement | null) => {
    ;(ref as { current: HTMLTextAreaElement | null }).current = el
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) (forwardedRef as { current: HTMLTextAreaElement | null }).current = el
  }
  const liveTimer = useRef<number | null>(null)

  // Mirror external edits, but never clobber what the user is typing.
  useEffect(() => { if (!focused.current) setDraft(external) }, [value, important])

  // Push the current draft to the embed as you type/scrub — debounced so the
  // canvas updates in near-real-time without a write per keystroke.
  const cancelLive = () => {
    if (liveTimer.current != null) { window.clearTimeout(liveTimer.current); liveTimer.current = null }
  }
  const scheduleLive = (text: string) => {
    cancelLive()
    liveTimer.current = window.setTimeout(() => {
      liveTimer.current = null
      const parsed = parseImportant(text)
      if (parsed.value) onLiveCommit(parsed.value, parsed.important)
    }, 100)
  }
  useEffect(() => cancelLive, [])

  // Expand the instant the collapsed single line can no longer hold the content.
  const maybeExpand = () => {
    const el = ref.current
    if (!el || !focused.current || expanded) return
    if (el.scrollWidth > el.clientWidth + 1) setExpanded(true)
  }

  // Grow the expanded field to fit its content (no inner scroll); reset on collapse.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (expanded) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    } else {
      el.style.height = ''
    }
  }, [expanded, draft])

  const commit = () => {
    const parsed = parseImportant(draft)
    if (parsed.value && (parsed.value !== value || parsed.important !== important)) {
      onCommit(parsed.value, parsed.important)
    }
  }

  return (
    <textarea
      ref={attachRef}
      data-prop={dataProp}
      className={`u-input embed-editor_value-input ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      rows={1}
      value={draft}
      onChange={(event) => { setDraft(event.target.value); maybeExpand(); scheduleLive(event.target.value) }}
      onFocus={() => { focused.current = true; maybeExpand() }}
      // Blur is the authoritative commit — cancel any pending live write first.
      onBlur={() => { focused.current = false; setExpanded(false); cancelLive(); commit() }}
      // Enter commits — a CSS value is one line, so we never insert a hard break.
      // Up/Down scrub the number under the caret (Shift = ×10, Alt = per-px).
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); return }
        const stepped = handleArrowStep(event)
        if (!stepped) return
        event.preventDefault()
        const el = event.currentTarget
        el.value = stepped.text
        el.setSelectionRange(stepped.caret, stepped.caret)
        setDraft(stepped.text)
        maybeExpand()
        scheduleLive(stepped.text)
      }}
      disabled={busy}
      spellCheck={false}
      aria-label="Value"
    />
  )
})

export { ValueField }
