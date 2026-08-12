import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ResolvedProp } from './lib/resolved'
import ProvenanceList, { ProvenanceEmbedNav } from './ProvenanceList'

// ─────────────────────────── Provenance popover ───────────────────────────

// Lists every selector that sets an "orange" property (applied through a selector
// other than the picked one): its value + the cascade winner, so you can see who
// wins and where a style comes from.
export function ProvenancePopover({ prop, anchor, resolved, onClose, onAnchorReclick, onSelectSelector }: { prop: string; anchor: DOMRect; resolved: ResolvedProp; onClose: () => void; onAnchorReclick: (prop: string) => void; onSelectSelector: (selectorText: string, prop?: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const headerLabel = prop
  // Anchor to the clicked label's bottom-left, then clamp into the viewport and
  // flip above the label if it would run off the bottom. Portaled to the body so
  // no card overflow / stacking context can clip it.
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.left, top: anchor.bottom + 6 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const margin = 8
    const { width, height } = el.getBoundingClientRect()
    let left = anchor.left
    let top = anchor.bottom + 6
    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width
    if (left < margin) left = margin
    if (top + height > window.innerHeight - margin) {
      const above = anchor.top - 6 - height
      top = above >= margin ? above : Math.max(margin, window.innerHeight - margin - height)
    }
    setPos({ left, top })
  }, [anchor])

  // Dismiss on a pointerdown anywhere outside the popover, or on Escape. Mounted
  // after the opening click, so that click can't immediately close it.
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      // Pressing back on the label that opened this popover toggles it closed —
      // flag it so that label's click doesn't immediately re-open it.
      if (
        event.clientX >= anchor.left && event.clientX <= anchor.right &&
        event.clientY >= anchor.top && event.clientY <= anchor.bottom
      ) {
        onAnchorReclick(prop)
      }
      onClose()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, onAnchorReclick, anchor, prop])

  return createPortal(
    <div
      ref={ref}
      className="embed-editor_provenance"
      role="dialog"
      aria-label={`Selectors setting ${headerLabel}`}
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="embed-editor_provenance-head">
        <code>{headerLabel}</code>
        <button type="button" className="embed-editor_icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <ProvenanceList
        contributors={resolved.contributors}
        prop={prop}
        onSelect={(sel, p) => { onSelectSelector(sel, p); onClose() }}
      />
    </div>,
    document.body,
  )
}
