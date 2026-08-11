# Break Up EmbedEditor.tsx Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the 3,996-line `EmbedEditor.tsx` monolith into focused modules — icons, input components, section blocks, the StyleCard router, and a thin orchestrator — following the existing patterns in `TypographySection.tsx`, `SizeSection.tsx`, etc.

**Architecture:** Each extracted module gets its own `.tsx` file in `src/style-panel/`. Pure helper functions go into `.ts` files. The main `EmbedEditor` component becomes the orchestrator (~800 lines) that imports all extracted pieces. No behavior changes — only code motion. The existing export path (`src/style-panel/index.tsx → export { default } from './EmbedEditor'`) stays unchanged.

**Tech Stack:** React 18 TSX, no new dependencies.

---

## File Structure

| Action | File | Lines (approx) |
|--------|------|---------------|
| Create | `src/style-panel/embedHelpers.ts` | ~70 |
| Create | `src/style-panel/EditorIcons.tsx` | ~150 |
| Create | `src/style-panel/propertySets.ts` | ~50 |
| Create | `src/style-panel/ValueField.tsx` | ~100 |
| Create | `src/style-panel/PropertyCombobox.tsx` | ~110 |
| Create | `src/style-panel/AddPropertyRow.tsx` | ~55 |
| Create | `src/style-panel/DeclRow.tsx` | ~90 |
| Create | `src/style-panel/SectionBlock.tsx` | ~35 |
| Create | `src/style-panel/ProvenancePopover.tsx` | ~80 |
| Create | `src/style-panel/ResolvedRows.tsx` | ~200 |
| Create | `src/style-panel/LayoutModeSections.tsx` | ~180 |
| Create | `src/style-panel/SelectorPicker.tsx` | ~190 |
| Create | `src/style-panel/AddQueryForm.tsx` | ~160 |
| Create | `src/style-panel/StyleCard.tsx` | ~380 |
| Modify | `src/style-panel/EmbedEditor.tsx` | 3996 → ~800 |

---

## Global Constraints

- **Zero behavioral changes**: Each extraction is pure cut-and-paste with import path adjustments. The app must render identically after each task.
- **Build after every task**: `npx vite build` must pass with no TS/JS errors.
- **No circular imports**: Extracted modules import from `lib/`, `shared/`, `components/`, and `embedHelpers.ts`, never from each other except where a declared parent-child dependency already exists (e.g., `DeclRow` imports `ValueField`).
- **Existing import path preserved**: `src/style-panel/index.tsx` re-exports `EmbedEditor` as default. That stays.
- **TypeScript strictness**: Extracted `.tsx` files use the same TS patterns as existing files in `style-panel/`.

---

### Task 1: Extract helpers, icons, property sets, and SectionBlock

**Files:**
- Create: `src/style-panel/embedHelpers.ts`
- Create: `src/style-panel/EditorIcons.tsx`
- Create: `src/style-panel/propertySets.ts`
- Create: `src/style-panel/SectionBlock.tsx`
- Modify: `src/style-panel/EmbedEditor.tsx`

- [ ] **Step 1: Create `src/style-panel/embedHelpers.ts`**

Extract from EmbedEditor.tsx lines 111-119, 121-130, 135-138, 144-184:

```ts
import type { AtRule } from 'postcss'
import type { ParsedDeclaration } from './lib/types'
import type { EmbedDoc } from './lib/webflow'
import { listAtRuleBlocks } from './lib/css'
import { webflowClassToCss } from './lib/webflow'
import type { ElementSnapshot } from './lib/types'

export function fullValue(decl: ParsedDeclaration): string {
  return decl.important ? `${decl.value} !important` : decl.value
}

export function parseImportant(input: string): { value: string; important: boolean } {
  const match = input.match(/!\s*important\s*$/i)
  if (match) return { value: input.slice(0, match.index).trim(), important: true }
  return { value: input.trim(), important: false }
}

export function headerLabel(snapshot: ElementSnapshot | undefined): string {
  if (!snapshot) return 'None'
  const tag = snapshot.tag ?? snapshot.webflowType.toLowerCase()
  const id = snapshot.id ? `#${snapshot.id}` : ''
  const formatted = [...new Set(snapshot.classes.map(webflowClassToCss).filter(Boolean))]
  const classes = formatted.length ? `.${formatted.slice(0, 5).join('.')}` : ''
  return `${tag}${id}${classes}` || tag
}

export function standaloneNativeClass(selector: string): string | null {
  const match = selector.trim().match(/^\.([_a-z-][\w-]*)(?::(?:hover|focus|active))?$/i)
  return match ? webflowClassToCss(match[1]) : null
}

export type Placeholder = {
  key: string
  atContext: string[]
  selector: string
  embedKey: string
  atRuleNode: AtRule
}

export function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, ' ').trim()
}

export function computePlaceholders(docs: EmbedDoc[], classList: string[]): Placeholder[] {
  if (!classList.length) return []
  const primary = `.${classList[0]}`
  const full = `.${classList.join('.')}`
  const candidates = full === primary ? [primary] : [primary, full]
  const out: Placeholder[] = []
  for (const doc of docs) {
    doc.regions.forEach((region, regionIndex) => {
      for (const block of listAtRuleBlocks(region)) {
        const existing = new Set(block.selectors.map(normalizeSelector))
        for (const selector of candidates) {
          if (existing.has(normalizeSelector(selector))) continue
          out.push({
            key: `${doc.source.key}:${regionIndex}:${block.atContext.join('>')}:${selector}`,
            atContext: block.atContext,
            selector,
            embedKey: doc.source.key,
            atRuleNode: block.node,
          })
        }
      }
    })
  }
  return out
}
```

- [ ] **Step 2: Create `src/style-panel/EditorIcons.tsx`**

Extract all 13 icon components + `SaveIndicator` + `breakpointIcon` from lines 186-319. These are: `PencilIcon`, `TrashIcon`, `EmbedIcon`, `ComponentIcon`, `SpinnerIcon`, `CheckIcon`, `UnsavedIcon`, `SaveIndicator`, `TabletBreakpointIcon`, `MobileLandscapeBreakpointIcon`, `MobileBreakpointIcon`, `DesktopBreakpointIcon`, `breakpointIcon`.

```tsx
import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BreakpointId } from './lib/types'

export function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="13" height="13">
      <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" width="13" height="13">
      <path d="M3.5 4.5h9M6.5 4V2.8h3V4M5 4.5l.5 8h5l.5-8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function EmbedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M7.73438 11.5H6.70996L8.26562 4.5H9.29004L7.73438 11.5Z" fill="currentColor" />
      <path d="M6.35352 6.85352L5.20703 8L6.35352 9.14648L5.64648 9.85352L3.79297 8L5.64648 6.14648L6.35352 6.85352Z" fill="currentColor" />
      <path d="M12.207 8L10.3535 9.85352L9.64648 9.14648L10.793 8L9.64648 6.85352L10.3535 6.14648L12.207 8Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M13 2C13.5523 2 14 2.44772 14 3V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H13ZM3 13H13V3H3V13Z" fill="currentColor" />
    </svg>
  )
}

export function ComponentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M8.47885 1.69144C8.18037 1.52863 7.81963 1.52863 7.52115 1.69144L2.52115 4.41871C2.19989 4.59395 2 4.93066 2 5.29661V10.703C2 11.0689 2.19989 11.4056 2.52115 11.5809L7.52115 14.3081C7.81963 14.471 8.18037 14.471 8.47885 14.3081L13.4789 11.5809C13.8001 11.4056 14 11.0689 14 10.703V5.29661C14 4.93066 13.8001 4.59395 13.4789 4.41871L8.47885 1.69144ZM3.54416 4.99979L8 2.56934L12.4558 4.99979L8 7.43025L3.54416 4.99979ZM3 5.84206L3 10.703L7.5 13.1575V8.29661L3 5.84206ZM8.5 13.1575L13 10.703V5.84206L8.5 8.29661V13.1575Z" fill="currentColor" />
    </svg>
  )
}

export function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function UnsavedIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.5" fill="currentColor" />
    </svg>
  )
}

export function SaveIndicator({ busy, error, pending }: { busy: boolean; error: string | null; pending: string | null }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const el = document.getElementById('embed-editor_save-slot')
    setTarget((prev) => (prev === el ? prev : el))
  })
  if (!target) return null
  const state = busy
    ? { cls: 'is-saving', tip: 'Saving…', icon: <SpinnerIcon /> }
    : error
      ? { cls: 'is-error', tip: error, icon: <span className="embed-editor_save-mark">!</span> }
      : pending
        ? { cls: 'is-unsaved', tip: pending, icon: <UnsavedIcon /> }
        : { cls: 'is-saved', tip: 'All changes saved', icon: <CheckIcon /> }
  return createPortal(
    <span className={`embed-editor_save ${state.cls}`} tabIndex={0} aria-label={state.tip}>
      {state.icon}
      <span className="embed-editor_tip" role="tooltip">{state.tip}</span>
    </span>,
    target,
  )
}

export function TabletBreakpointIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M9.5 11H6.5V12H9.5V11Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M3 3C3 2.44772 3.44772 2 4 2H12C12.5523 2 13 2.44772 13 3V13C13 13.5523 12.5523 14 12 14H4C3.44772 14 3 13.5523 3 13V3ZM4 3H12V13H4V3Z" fill="currentColor" />
    </svg>
  )
}

export function MobileLandscapeBreakpointIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M12 9V7H11V9H12Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M4 12C2.89543 12 2 11.1046 2 10L2 6C2 4.89543 2.89543 4 4 4L12 4C13.1046 4 14 4.89543 14 6V10C14 11.1046 13.1046 12 12 12H4ZM3 10L3 6C3 5.44772 3.44772 5 4 5L12 5C12.5523 5 13 5.44772 13 6V10C13 10.5523 12.5523 11 12 11L4 11C3.44772 11 3 10.5523 3 10Z" fill="currentColor" />
    </svg>
  )
}

export function MobileBreakpointIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M7 12H9V11H7V12Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M4 4C4 2.89543 4.89543 2 6 2H10C11.1046 2 12 2.89543 12 4V12C12 13.1046 11.1046 14 10 14H6C4.89543 14 4 13.1046 4 12V4ZM6 3H10C10.5523 3 11 3.44772 11 4V12C11 12.5523 10.5523 13 10 13H6C5.44772 13 5 12.5523 5 12V4C5 3.44772 5.44772 3 6 3Z" fill="currentColor" />
    </svg>
  )
}

export function DesktopBreakpointIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M12 5.36602L10.1519 6.43301L9.65192 5.56699L11.5 4.5L9.65193 3.43301L10.1519 2.56699L12 3.63397V1.5H13V3.63397L14.8481 2.56699L15.3481 3.43301L13.5 4.5L15.3481 5.56699L14.8481 6.43301L13 5.36602V7.5H12V5.36602Z" fill="currentColor" />
      <path d="M3 4H8V5H3V12H13V9H14V12H16V13H0V12H2V5C2 4.44772 2.44772 4 3 4Z" fill="currentColor" />
    </svg>
  )
}

export function breakpointIcon(id: BreakpointId | null): ReactNode {
  switch (id) {
    case 'main': return <DesktopBreakpointIcon />
    case 'medium': return <TabletBreakpointIcon />
    case 'small': return <MobileLandscapeBreakpointIcon />
    case 'tiny': return <MobileBreakpointIcon />
    default: return undefined
  }
}
```

- [ ] **Step 3: Create `src/style-panel/propertySets.ts`**

Extract lines 973-1057 (LAYOUT_CONTROL_PROPS through GRID_CONTROL_PROPS + ALIGN_PROPS + EMBED_ONLY_PROPS):

```ts
export const LAYOUT_CONTROL_PROPS = new Set([
  'display', 'flex-direction', 'flex-wrap', 'flex-flow',
  'justify-content', 'align-items', 'align-content', 'align-self',
  'row-gap', 'column-gap', 'gap', 'grid-row-gap', 'grid-column-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-auto-columns',
  'grid-auto-rows', 'grid-auto-flow',
  'vertical-align',
])

export const EMBED_ONLY_PROPS = new Set([
  'transition', 'transition-property', 'transition-duration',
  'transition-timing-function', 'transition-delay',
])

export const EFFECTS_CONTROL_PROPS = new Set([
  'opacity', 'mix-blend-mode',
  'box-shadow', 'text-shadow',
  'filter', 'backdrop-filter',
  'transform',
  'cursor',
])

export const TYPOGRAPHY_CONTROL_PROPS = new Set([
  'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing',
  'text-align', 'text-decoration', 'text-transform',
  'color', 'white-space', 'word-break', 'word-wrap', 'overflow-wrap',
])

export const ALIGN_PROPS = new Set(['justify-content', 'align-items'])

export const GRID_CONTROL_PROPS = new Set([
  'grid-template-columns', 'grid-template-rows',
  'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow',
  'align-content', 'justify-items', 'align-items',
])
```

- [ ] **Step 4: Create `src/style-panel/SectionBlock.tsx`**

Extract lines 681-708:

```tsx
import type { ReactNode } from 'react'
import { useState } from 'react'

export function SectionBlock({ label, headerAction, defaultOpen = true, children }: {
  label: string
  headerAction?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const labelId = `section-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="embed-editor_section" role="region" aria-labelledby={labelId}>
      <button
        id={labelId}
        type="button"
        className={`embed-editor_section-head ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <svg className="embed-editor_section-caret" viewBox="0 0 7 10" aria-hidden="true">
          <path d="M1 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
        {headerAction}
      </button>
      {open && <div className="embed-editor_section-body">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 5: Remove extracted code from `EmbedEditor.tsx` and add imports**

Delete lines 111-184 (helpers), 186-319 (icons), 677-708 (SectionBlock), 973-1057 (property sets) from `EmbedEditor.tsx`.

Add imports at the top:

```tsx
import { fullValue, parseImportant, headerLabel, standaloneNativeClass, normalizeSelector, computePlaceholders } from './embedHelpers'
import type { Placeholder } from './embedHelpers'
import { PencilIcon, TrashIcon, EmbedIcon, ComponentIcon, SpinnerIcon, CheckIcon, UnsavedIcon, SaveIndicator, TabletBreakpointIcon, MobileLandscapeBreakpointIcon, MobileBreakpointIcon, DesktopBreakpointIcon, breakpointIcon } from './EditorIcons'
import { LAYOUT_CONTROL_PROPS, EMBED_ONLY_PROPS, EFFECTS_CONTROL_PROPS, TYPOGRAPHY_CONTROL_PROPS, ALIGN_PROPS, GRID_CONTROL_PROPS } from './propertySets'
import { SectionBlock } from './SectionBlock'
```

Note: Only import what's still needed by remaining code in EmbedEditor.tsx and StyleCard/other components that haven't been extracted yet. For now, import everything — unused imports will be cleaned up as further tasks extract their consumers.

Remove these imported identifiers from the EmbedEditor's internal definitions, and remove any type definitions (`Placeholder`, etc.) that moved to the new files.

- [ ] **Step 6: Build to verify**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/style-panel/embedHelpers.ts src/style-panel/EditorIcons.tsx src/style-panel/propertySets.ts src/style-panel/SectionBlock.tsx src/style-panel/EmbedEditor.tsx
git commit -m "refactor(style-panel): extract embedHelpers, EditorIcons, propertySets, SectionBlock"
```

---

### Task 2: Extract ValueField, PropertyCombobox, AddPropertyRow, DeclRow

**Files:**
- Create: `src/style-panel/ValueField.tsx`
- Create: `src/style-panel/PropertyCombobox.tsx`
- Create: `src/style-panel/AddPropertyRow.tsx`
- Create: `src/style-panel/DeclRow.tsx`
- Modify: `src/style-panel/EmbedEditor.tsx`

- [ ] **Step 1: Create `src/style-panel/ValueField.tsx`**

Extract lines 326-424 (`ValueField` forwardRef component). It uses `parseImportant` from `embedHelpers` and `handleArrowStep` from `lib/number-step`.

```tsx
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { handleArrowStep } from './lib/number-step'
import { parseImportant } from './embedHelpers'

export const ValueField = forwardRef<HTMLTextAreaElement, {
  value: string
  important: boolean
  busy: boolean
  dataProp?: string
  onCommit: (value: string, important: boolean) => void
  onLiveCommit: (value: string, important: boolean) => void
}>(function ValueField({ value, important, busy, dataProp, onCommit, onLiveCommit }, forwardedRef) {
  // ... (exact copy of lines 336-424 from EmbedEditor.tsx)
})
```

- [ ] **Step 2: Create `src/style-panel/PropertyCombobox.tsx`**

Extract lines 522-625 (`PropertyCombobox`). Uses `filterCssProperties` from `lib/css-properties`, `createPortal` from React.

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { filterCssProperties } from './lib/css-properties'

export function PropertyCombobox({ value, busy, onChange, onPick, onEnter, onEscape }: {
  value: string
  busy: boolean
  onChange: (value: string) => void
  onPick: (prop: string) => void
  onEnter: () => void
  onEscape: () => void
}) {
  // ... (exact copy of lines 530-625 from EmbedEditor.tsx)
}
```

- [ ] **Step 3: Create `src/style-panel/DeclRow.tsx`**

Extract lines 426-513 (`DeclRow`). Uses `ValueField`, `FieldLabel`, `VariableConnect`, `DisplayControl`.

```tsx
import type { ParsedDeclaration } from './lib/types'
import type { DeclStatus } from './lib/cascade'
import { ValueField } from './ValueField'
import FieldLabel from './components/FieldLabel'
import VariableConnect from './VariableConnect'
import DisplayControl from './DisplayControl'

export function DeclRow({
  decl, status, busy, reorderable = true, draggable, dragging, dropTarget,
  onGrab, onUngrab, onDragStart, onDragOver, onDrop, onDragEnd,
  onCommitValue, onLiveCommitValue, onRemove,
}: {
  // ... (exact type copy from EmbedEditor.tsx lines 426-461)
}) {
  // ... (exact copy of lines 462-513 from EmbedEditor.tsx)
}
```

- [ ] **Step 4: Create `src/style-panel/AddPropertyRow.tsx`**

Extract lines 627-675 (`AddPropertyRow`). Uses `PropertyCombobox`, `DeclRow`, `fullValue`.

```tsx
import { useState } from 'react'
import { PropertyCombobox } from './PropertyCombobox'
import { fullValue } from './embedHelpers'

export function AddPropertyRow({ busy, onAdd }: {
  busy: boolean
  onAdd: (prop: string, value: string, important: boolean) => void
}) {
  // ... (exact copy of lines 629-675 from EmbedEditor.tsx)
}
```

- [ ] **Step 5: Remove extracted code from `EmbedEditor.tsx` and add imports**

Delete lines 326-675 from `EmbedEditor.tsx`. Add:

```tsx
import { ValueField } from './ValueField'
import { PropertyCombobox } from './PropertyCombobox'
import { DeclRow } from './DeclRow'
import { AddPropertyRow } from './AddPropertyRow'
```

- [ ] **Step 6: Build to verify**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/style-panel/ValueField.tsx src/style-panel/PropertyCombobox.tsx src/style-panel/DeclRow.tsx src/style-panel/AddPropertyRow.tsx src/style-panel/EmbedEditor.tsx
git commit -m "refactor(style-panel): extract ValueField, PropertyCombobox, DeclRow, AddPropertyRow"
```

---

### Task 3: Extract ResolvedRows and ProvenancePopover

**Files:**
- Create: `src/style-panel/ResolvedRows.tsx`
- Create: `src/style-panel/ProvenancePopover.tsx`
- Modify: `src/style-panel/EmbedEditor.tsx`

- [ ] **Step 1: Create `src/style-panel/ResolvedRows.tsx`**

Extract lines 790-973, 980-1000. This includes:
- `ResolvedRow` (lines 790-848)
- `DisplayRow` (lines 850-894)
- `VerticalAlignRow` + `VALIGN_OPTIONS`/`VALIGN_VALUES`/`VALIGN_DISPLAYS` (lines 896-973)
- `isSupportedCssValue` (line 980)
- `effectiveValue` (line 987)
- `rawEffective` (line 994)

```tsx
import { useMemo, useRef, useState } from 'react'
import type { ClearProp, LiveSetProp, Read, SetProp, SelectSelector } from './SpacingBox'
import type { ResolvedProp } from './lib/resolved'
import FieldLabel from './components/FieldLabel'
import Select, { type SelectOption } from './components/Select'
import { ValueField } from './ValueField'
import VariableConnect from './VariableConnect'
import DisplayControl from './DisplayControl'
import ProvenanceList from './ProvenanceList'

// ... VALIGN_OPTIONS, VALIGN_VALUES, VALIGN_DISPLAYS, isSupportedCssValue, effectiveValue, rawEffective ...

export function ResolvedRow({ prop, resolved, busy, setProp, clearProp, liveSetProp, onProvenance, onSelectSelector }: {
  prop: string
  resolved: ResolvedProp
  busy: boolean
  setProp: SetProp
  clearProp: ClearProp
  liveSetProp: LiveSetProp
  onProvenance: (prop: string, rect: DOMRect) => void
  onSelectSelector: SelectSelector
}) { /* ... */ }

export function DisplayRow({ resolved, busy, setProp, clearProp, onProvenance, onSelectSelector }: {
  resolved: ResolvedProp | undefined
  busy: boolean
  setProp: SetProp
  clearProp: ClearProp
  onProvenance: (prop: string, rect: DOMRect) => void
  onSelectSelector: SelectSelector
}) { /* ... */ }

export function VerticalAlignRow({ resolved, dimmed, busy, setProp, clearProp, onProvenance, onSelectSelector }: {
  resolved: ResolvedProp | undefined
  dimmed: boolean
  busy: boolean
  setProp: SetProp
  clearProp: ClearProp
  onProvenance: (prop: string, rect: DOMRect) => void
  onSelectSelector: SelectSelector
}) { /* ... */ }
```

Note: The type aliases `SetProp`, `ClearProp`, `LiveSetProp`, `Read`, `SelectSelector` should be imported from `SpacingBox.tsx` (already exported there) to avoid duplication:

```ts
import type { ClearProp, LiveSetProp, Read, SetProp, SelectSelector } from './SpacingBox'
```

- [ ] **Step 2: Create `src/style-panel/ProvenancePopover.tsx`**

Extract lines 715-782 (`ProvenancePopover`). Depends on `ProvenanceList`, `ResolvedProp`.

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ResolvedProp } from './lib/resolved'
import ProvenanceList, { ProvenanceEmbedNav } from './ProvenanceList'
import { SelectorPicker } from './SelectorPicker'  // imported later, but fine since this is extracted AFTER SelectorPicker

// Actually, ProvenancePopover uses ProvenanceList but NOT SelectorPicker. Let me check...

// Looking at lines 715-782, ProvenancePopover receives:
// - prop, anchor, resolved, onClose, onAnchorReclick, onSelectSelector
// It renders ProvenanceList with the resolved selectors.
// It does NOT render SelectorPicker (that's in StyleCard).
// So ProvenancePopover only depends on ProvenanceList.
```

Wait, let me re-read the ProvenancePopover code. Lines 715-782:

```tsx
function ProvenancePopover({ prop, anchor, resolved, onClose, onAnchorReclick, onSelectSelector }) {
  // Creates a portal with ProvenanceList inside
  // Has close on Escape / click-outside
  // Shows selectors that set the property
}
```

It only imports `ProvenanceList` and `ProvenanceEmbedNav`. No circular dependency.

```tsx
import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ResolvedProp } from './lib/resolved'
import ProvenanceList, { ProvenanceEmbedNav } from './ProvenanceList'

export function ProvenancePopover({ prop, anchor, resolved, onClose, onAnchorReclick, onSelectSelector }: {
  prop: string
  anchor: DOMRect
  resolved: ResolvedProp
  onClose: () => void
  onAnchorReclick: (prop: string) => void
  onSelectSelector: (selectorText: string, prop?: string) => void
}) {
  // ... (exact copy of lines 717-782 from EmbedEditor.tsx, with the final
  //      return createPortal(...) at the end)
}
```

- [ ] **Step 3: Remove extracted code from `EmbedEditor.tsx` and add imports**

Delete lines 715-973, 980-1000 from `EmbedEditor.tsx`. Add:

```tsx
import { ResolvedRow, DisplayRow, VerticalAlignRow, isSupportedCssValue, effectiveValue, rawEffective } from './ResolvedRows'
import { ProvenancePopover } from './ProvenancePopover'
```

Keep `VALIGN_DISPLAYS` – it's used by `LayoutModeSections` (still in EmbedEditor). Either re-export it from `ResolvedRows` or keep a reference. Since `VerticalAlignRow` is still in `LayoutModeSections`, either:
- Export `VALIGN_DISPLAYS` from `ResolvedRows`
- Or keep a local reference: `import { VALIGN_DISPLAYS } from './ResolvedRows'`

The `LayoutModeSections` component (still in EmbedEditor) references `VALIGN_DISPLAYS` on line 1225. Add `VALIGN_DISPLAYS` to the ResolvedRows exports.

- [ ] **Step 4: Build to verify**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/style-panel/ResolvedRows.tsx src/style-panel/ProvenancePopover.tsx src/style-panel/EmbedEditor.tsx
git commit -m "refactor(style-panel): extract ResolvedRows, ProvenancePopover"
```

---

### Task 4: Extract LayoutModeSections, SelectorPicker, AddQueryForm

**Files:**
- Create: `src/style-panel/LayoutModeSections.tsx`
- Create: `src/style-panel/SelectorPicker.tsx`
- Create: `src/style-panel/AddQueryForm.tsx`
- Modify: `src/style-panel/EmbedEditor.tsx`

- [ ] **Step 1: Create `src/style-panel/SelectorPicker.tsx`**

Extract lines 1239-1438 (`SourceOption` type, `SelectorSuggestion` type, `SUGGESTION_KIND_LABEL`, `SelectorPicker`).

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { MatchedSelector } from './lib/resolved'
import { selectorsMatch } from './lib/resolved'

export type SourceOption = {
  value: string
  label: string
  marked?: boolean
  fromComponent?: boolean
  heading?: boolean
  indent?: boolean
  triggerLabel?: string
}

export type SelectorSuggestion = { selector: string; kind: 'tag' | 'class' | 'attribute' | 'attribute-value' | 'combo' }

export const SUGGESTION_KIND_LABEL: Record<SelectorSuggestion['kind'], string> = {
  tag: 'tag', class: 'class', attribute: 'attribute', 'attribute-value': 'attribute', combo: 'combo',
}

export function SelectorPicker({ selectors, suggestions, activeSelector, busy, onSelect, onDeselect, onAdd }: {
  selectors: MatchedSelector[]
  suggestions: SelectorSuggestion[]
  activeSelector: string
  busy: boolean
  onSelect: (selector: string) => void
  onDeselect: () => void
  onAdd: (selector: string) => void
}) {
  // ... (exact copy of lines 1277-1438 from EmbedEditor.tsx)
}
```

- [ ] **Step 2: Create `src/style-panel/AddQueryForm.tsx`**

Extract lines 1442-1592 (`ADD_QUERY`, `PlusIcon`, `QUERY_MODES`, `QuerySuggestion`, `COMMON_QUERIES`, `AddQueryForm`).

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import SegmentedControl, { type SegmentedOption } from './components/SegmentedControl'

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

export function AddQueryForm({ canNest, suggestions, onAdd, onCancel }: {
  canNest: boolean
  suggestions: QuerySuggestion[]
  onAdd: (query: string, mode: 'wrap' | 'nest') => void
  onCancel: () => void
}) {
  // ... (exact copy of lines 1490-1592 from EmbedEditor.tsx)
}
```

- [ ] **Step 3: Create `src/style-panel/LayoutModeSections.tsx`**

Extract lines 1004-1232 (`FLEX_DIRECTIONS`, `FLEX_WRAPS`, `currentFlexFlow`, `ChevronRightIcon`, `layoutMode`, `LayoutDisclosure`, `DirectionRow`, `AlignRow`, `LayoutModeSections`).

```tsx
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ClearProp, LiveSetProp, Read, SetProp, SelectSelector } from './SpacingBox'
import type { ResolvedProp } from './lib/resolved'
import DirectionControl from './DirectionControl'
import AlignControl from './AlignControl'
import GapControl from './GapControl'
import GridControls from './GridControls'
import { VerticalAlignRow, VALIGN_DISPLAYS } from './ResolvedRows'
import DisplayControl from './DisplayControl'

const FLEX_DIRECTIONS = ['row', 'row-reverse', 'column', 'column-reverse']
const FLEX_WRAPS = ['nowrap', 'wrap', 'wrap-reverse']

function currentFlexFlow(read: Read): string {
  // ... (exact copy of lines 1006-1021)
}

const ChevronRightIcon = () => (
  // ... (exact copy of lines 1146-1153)
)

function layoutMode(display: string): 'grid' | 'flex' | 'inline' | null {
  // ... (exact copy of lines 1155-1163)
}

function LayoutDisclosure({ label, open, onToggle, children }: {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  // ... (exact copy of lines 1165-1180)
}

function DirectionRow({ read, busy, setProp, clearProp, onProvenance, onSelectSelector }: {
  read: Read; busy: boolean; setProp: SetProp; clearProp: ClearProp
  onProvenance: (prop: string, rect: DOMRect) => void; onSelectSelector: SelectSelector
}) {
  // ... (exact copy of lines 1063-1100)
}

function AlignRow({ read, busy, setProp, clearProp, liveSetProp, onProvenance, onSelectSelector }: {
  read: Read; busy: boolean; setProp: SetProp; clearProp: ClearProp; liveSetProp: LiveSetProp
  onProvenance: (prop: string, rect: DOMRect) => void; onSelectSelector: SelectSelector
}) {
  // ... (exact copy of lines 1112-1143)
}

export function LayoutModeSections({ read, busy, setProp, clearProp, liveSetProp, onProvenance, onSelectSelector, activeSelector }: {
  read: Read; busy: boolean; setProp: SetProp; clearProp: ClearProp; liveSetProp: LiveSetProp
  onProvenance: (prop: string, rect: DOMRect) => void; onSelectSelector: SelectSelector; activeSelector: string
}) {
  // ... (exact copy of lines 1182-1232, referencing DirectionRow, AlignRow, LayoutDisclosure, GapControl, GridControls, VerticalAlignRow)
}
```

- [ ] **Step 4: Remove extracted code from `EmbedEditor.tsx` and add imports**

Delete lines 1004-1592 from `EmbedEditor.tsx`. Add:

```tsx
import { SelectorPicker } from './SelectorPicker'
import type { SourceOption, SelectorSuggestion } from './SelectorPicker'
import { SUGGESTION_KIND_LABEL } from './SelectorPicker'
import { ADD_QUERY, PlusIcon, QUERY_MODES, AddQueryForm, COMMON_QUERIES } from './AddQueryForm'
import type { QuerySuggestion } from './AddQueryForm'
import { LayoutModeSections, LayoutDisclosure, DirectionRow, AlignRow } from './LayoutModeSections'
```

Remove inline definitions of: `SourceOption`, `SelectorSuggestion`, `SUGGESTION_KIND_LABEL`, `SelectorPicker`, `ADD_QUERY`, `PlusIcon`, `QUERY_MODES`, `QuerySuggestion`, `COMMON_QUERIES`, `AddQueryForm`, `FLEX_DIRECTIONS`, `FLEX_WRAPS`, `currentFlexFlow`, `ChevronRightIcon`, `layoutMode`, `LayoutDisclosure`, `DirectionRow`, `AlignRow`, `LayoutModeSections`.

- [ ] **Step 5: Build to verify**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/style-panel/SelectorPicker.tsx src/style-panel/AddQueryForm.tsx src/style-panel/LayoutModeSections.tsx src/style-panel/EmbedEditor.tsx
git commit -m "refactor(style-panel): extract SelectorPicker, AddQueryForm, LayoutModeSections"
```

---

### Task 5: Extract StyleCard

**Files:**
- Create: `src/style-panel/StyleCard.tsx`
- Modify: `src/style-panel/EmbedEditor.tsx`

- [ ] **Step 1: Create `src/style-panel/StyleCard.tsx`**

Extract lines 1594-1942 (`StyleCard`). It imports from nearly all section components and the newly extracted modules.

```tsx
import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode, CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ElementSnapshot, ParsedDeclaration, ParsedRule } from './lib/types'
import type { ResolvedProp, ResolvedStyle, StyleContext, ContextKey, ContextInfo, MatchedSelector } from './lib/resolved'
import { groupProps } from './lib/sections'
import { SectionBlock } from './SectionBlock'
import { SelectorPicker } from './SelectorPicker'
import type { SourceOption, SelectorSuggestion } from './SelectorPicker'
import { ADD_QUERY, PlusIcon, AddQueryForm } from './AddQueryForm'
import type { QuerySuggestion } from './AddQueryForm'
import { LayoutModeSections } from './LayoutModeSections'
import { ResolvedRow, DisplayRow, VerticalAlignRow } from './ResolvedRows'
import { ProvenancePopover } from './ProvenancePopover'
import { breakpointIcon } from './EditorIcons'
import { LAYOUT_CONTROL_PROPS, EFFECTS_CONTROL_PROPS, TYPOGRAPHY_CONTROL_PROPS, ALIGN_PROPS, GRID_CONTROL_PROPS } from './propertySets'
import Select, { type SelectOption } from './components/Select'
import { EmbedIcon, ComponentIcon } from './EditorIcons'
import ElementTokenPicker from './ElementTokenPicker'
import SizeSection from './SizeSection'
import SpacingSection, { SpacingCenterButton } from './SpacingSection'
import BordersSection from './BordersSection'
import BackgroundSection from './BackgroundSection'
import PositionSection from './PositionSection'
import TypographySection, { GroupLabel } from './TypographySection'
import FlexChildSection from './FlexChildSection'
import EffectsSection from './EffectsSection'
import { CodeEditor } from './components/CodeEditor'

export function StyleCard({
  snapshot, selectedNames, selectedSelector, onSelectNames,
  resolved, contexts, contextInfos, context, onContext, onAddQuery, querySuggestions,
  selectors, suggestions, activeSelector, onSelectActive, onDeselect, onAddSelector,
  sourceValue, sourceOptions, onSourceChange, sourceNote, nativeStyleName,
  loading, busy, pending,
  setProp, clearProp, liveSetProp, onSelectSelector, onAdd,
  rawOpen, onToggleRaw, onSaveRaw, onRemoveRule,
}: {
  // ... (exact type copy from EmbedEditor.tsx lines 1629-1665)
}) {
  // ... (exact copy of lines 1666-1942 from EmbedEditor.tsx)
}
```

- [ ] **Step 2: Remove extracted code from `EmbedEditor.tsx` and add import**

Delete lines 1594-1942 from `EmbedEditor.tsx`. Add:

```tsx
import { StyleCard } from './StyleCard'
```

Remove inline definition of `StyleCard`.

Also remove unused imports that were only used by `StyleCard` and are no longer needed in `EmbedEditor.tsx`. The main `EmbedEditor` component should now only need:
- React core hooks + types
- The lib files for scanning / CSS manipulation
- Webflow API
- `StyleCard` + the types it needs
- `SaveIndicator` from `EditorIcons` (used in the main render to show save state)
- `AnalyzeEmbedCount`, etc.

- [ ] **Step 3: Build to verify**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/style-panel/StyleCard.tsx src/style-panel/EmbedEditor.tsx
git commit -m "refactor(style-panel): extract StyleCard from EmbedEditor"
```

---

### Task 6: Clean up EmbedEditor imports and verify final state

**Files:**
- Modify: `src/style-panel/EmbedEditor.tsx`

- [ ] **Step 1: Audit and clean imports**

The remaining `EmbedEditor.tsx` should be ~800 lines. Remove all imports that were only needed by extracted code and are no longer used by the main orchestrator:

Remove imports for: `forwardRef`, `createPortal`, `CodeEditor`, `FieldLabel`, `Select`, `SegmentedControl`, `DirectionControl`, `AlignControl`, `ElementTokenPicker`, plus all section components (`SizeSection`, `GapControl`, `GridControls`, `SpacingSection`, `BordersSection`, `BackgroundSection`, `PositionSection`, `TypographySection`, `FlexChildSection`, `EffectsSection`, `ProvenanceList`).

Also remove imports from lib files that are only used by extracted components: `filterCssProperties`, `css-properties`, `number-step`, `color`. If these are still imported by other code in EmbedEditor, keep them.

If `GapControl` is only referenced in now-extracted `LayoutModeSections`, remove its import from EmbedEditor.

The remaining imports should be:
- React hooks: `useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState`
- Types: `CSSProperties, KeyboardEvent, MouseEvent`
- `StyleCard` from `./StyleCard` + its types
- `SourceOption, SelectorSuggestion` types from `./SelectorPicker`
- `QuerySuggestion` type from `./AddQueryForm`
- `SaveIndicator, breakpointIcon` from `./EditorIcons`
- `computePlaceholders` from `./embedHelpers` + types
- `fullValue, headerLabel, standaloneNativeClass` from `./embedHelpers`
- All the lib imports needed for scanning/CSS editing pipeline: `cascade`, `sections`, `element-tokens`, `resolved`, `native-styles`, `css`, `selectors`, `webflow`, `loadEmbedSource`, `saveEmbedSource`

- [ ] **Step 2: Build to verify**

Run: `npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Run a full lint/type check**

If the project has a type-check command, run it:

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -50
```

Expected: No type errors from the style-panel directory. Fix any that appear.

- [ ] **Step 4: Commit**

```bash
git add src/style-panel/EmbedEditor.tsx
git commit -m "refactor(style-panel): clean up EmbedEditor imports after extraction"
```

---

### Task 7: Final verification

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 2: Electron syntax check**

Run: `npm run check:electron`
Expected: No errors.

- [ ] **Step 3: Run any existing tests**

Run: `npx vitest run --reporter=verbose`
Expected: All existing tests pass.

- [ ] **Step 4: Compare line counts**

Run: `wc -l src/style-panel/*.tsx src/style-panel/*.ts`
Expected: `EmbedEditor.tsx` is now ~800-1000 lines. Total line count across all files is approximately the same (~4000) — code was moved, not changed.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "chore(style-panel): final cleanup after EmbedEditor breakup"
```
