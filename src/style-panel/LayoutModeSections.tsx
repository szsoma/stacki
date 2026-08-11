import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ResolvedProp } from './lib/resolved'
import { GroupLabel } from './TypographySection'
import DirectionControl from './DirectionControl'
import AlignControl from './AlignControl'
import GapControl from './GapControl'
import GridControls from './GridControls'
import { VerticalAlignRow, VALIGN_DISPLAYS, effectiveValue, rawEffective } from './ResolvedRows'

// The current flex flow as a normalized `<direction> [wrap]` string (matching the
// Direction control's option values). Prefers the `flex-direction` / `flex-wrap`
// longhands (what the control writes), falling back to any legacy `flex-flow`
// shorthand for each axis. `nowrap` is omitted (e.g. just `row`).
const FLEX_DIRECTIONS = ['row', 'row-reverse', 'column', 'column-reverse']
const FLEX_WRAPS = ['nowrap', 'wrap', 'wrap-reverse']
function currentFlexFlow(read: (prop: string) => ResolvedProp | undefined): string {
  let direction = 'row'
  let wrap = 'nowrap'
  const flowTokens = effectiveValue(read('flex-flow')).split(/\s+/)
  const dir = effectiveValue(read('flex-direction'))
  const wr = effectiveValue(read('flex-wrap'))
  if (FLEX_DIRECTIONS.includes(dir)) direction = dir
  else { const t = flowTokens.find((token) => FLEX_DIRECTIONS.includes(token)); if (t) direction = t }
  if (FLEX_WRAPS.includes(wr)) wrap = wr
  else { const t = flowTokens.find((token) => FLEX_WRAPS.includes(token)); if (t) wrap = t }
  return wrap === 'nowrap' ? direction : `${direction} ${wrap}`
}

// The flex Direction control — only rendered when `display` is flex. Writes the
// `flex-direction` + `flex-wrap` longhands; the label clears them (and any legacy
// `flex-flow`).
function DirectionRow({ read, busy, setProp, clearProp, onProvenance, onSelectSelector }: {
  read: (prop: string) => ResolvedProp | undefined
  busy: boolean
  setProp: (prop: string, value: string, important: boolean) => void
  clearProp: (prop: string | string[]) => void
  onProvenance: (prop: string, anchor: DOMRect) => void
  onSelectSelector: (selector: string, prop?: string) => void
}) {
  return (
    <div className="embed-editor_size-row">
      <GroupLabel
        label="Direction"
        props={['flex-flow', 'flex-direction', 'flex-wrap']}
        read={read}
        busy={busy}
        onClear={() => clearProp(['flex-flow', 'flex-direction', 'flex-wrap'])}
        onProvenance={onProvenance}
        onSelectSelector={onSelectSelector}
      />
      <DirectionControl
        value={currentFlexFlow(read)}
        rawDirection={rawEffective(read('flex-direction')).value}
        important={rawEffective(read('flex-direction')).important}
        busy={busy}
        onCommit={(direction, wrap) => {
          // Two longhand writes: safe together — native ops serialize, and two edits
          // to one embed rule both land before either save.
          setProp('flex-direction', direction, false)
          setProp('flex-wrap', wrap, false)
        }}
        onCommitCustom={(value, important) => setProp('flex-direction', value, important)}
      />
    </div>
  )
}

function AlignRow({ read, busy, setProp, clearProp, liveSetProp, onProvenance, onSelectSelector }: {
  read: (prop: string) => ResolvedProp | undefined
  busy: boolean
  setProp: (prop: string, value: string, important: boolean) => void
  clearProp: (prop: string | string[]) => void
  liveSetProp: (prop: string, value: string | null, important: boolean) => void
  onProvenance: (prop: string, anchor: DOMRect) => void
  onSelectSelector: (selector: string, prop?: string) => void
}) {
  const column = currentFlexFlow(read).startsWith('column')
  return (
    <div className="embed-editor_size-row embed-editor_align-row">
      <GroupLabel
        label="Align"
        props={['justify-content', 'align-items']}
        read={read}
        busy={busy}
        onClear={() => clearProp(['justify-content', 'align-items'])}
        onProvenance={onProvenance}
        onSelectSelector={onSelectSelector}
      />
      <AlignControl
        justify={effectiveValue(read('justify-content'))}
        align={effectiveValue(read('align-items'))}
        column={column}
        busy={busy}
        onSet={(prop, value) => setProp(prop, value, false)}
        onLive={(prop, value) => liveSetProp(prop, value, false)}
        onClear={(prop) => clearProp(prop)}
      />
    </div>
  )
}

const ChevronRightIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Which layout-mode disclosure a Display value implies. `grid` wins over `inline` for
// `inline-grid`, `flex` over `inline` for `inline-flex`; a custom value (e.g.
// `grid !important`, `var(--grid)`) matches by substring so it still opens its section.
function layoutMode(display: string): 'grid' | 'flex' | 'inline' | null {
  const v = display.toLowerCase()
  if (v.includes('grid')) return 'grid'
  if (v.includes('flex')) return 'flex'
  if (v.includes('inline')) return 'inline'
  return null
}

// A collapsible disclosure (Webflow's "More alignment options" button): a full-width
// header whose chevron rotates open to reveal its rows.
function LayoutDisclosure({ label, open, onToggle, children }: {
  label: string; open: boolean; onToggle: () => void; children: ReactNode
}) {
  return (
    <div className={`embed-editor_disclosure ${open ? 'is-open' : ''}`}>
      <button type="button" className="embed-editor_disclosure-btn" aria-expanded={open} onClick={onToggle}>
        <span className={`embed-editor_disclosure-arrow ${open ? 'is-open' : ''}`}><ChevronRightIcon /></span>
        <span className="embed-editor_disclosure-label">{label}</span>
      </button>
      {open ? <div className="embed-editor_disclosure-body">{children}</div> : null}
    </div>
  )
}

// Flex / Grid / Inline settings as collapsible disclosures. All three always render
// (nothing is hidden by Display); changing Display auto-opens the matching one and
// closes the others, while each stays hand-toggleable between Display changes.
export function LayoutModeSections({ read, busy, setProp, clearProp, liveSetProp, onProvenance, onSelectSelector, activeSelector }: {
  read: (prop: string) => ResolvedProp | undefined
  busy: boolean
  setProp: (prop: string, value: string, important: boolean) => void
  clearProp: (prop: string | string[]) => void
  liveSetProp: (prop: string, value: string | null, important: boolean) => void
  onProvenance: (prop: string, anchor: DOMRect) => void
  onSelectSelector: (selector: string, prop?: string) => void
  activeSelector: string
}) {
  const display = effectiveValue(read('display'))
  const mode = layoutMode(display)
  const [open, setOpen] = useState({ flex: mode === 'flex', grid: mode === 'grid', inline: mode === 'inline' })
  // Re-sync whenever the Display's mode changes; hand-toggles persist between changes.
  useEffect(() => {
    setOpen({ flex: mode === 'flex', grid: mode === 'grid', inline: mode === 'inline' })
  }, [mode])
  const toggle = (key: 'flex' | 'grid' | 'inline') => setOpen((o) => ({ ...o, [key]: !o[key] }))
  // A gap set in ANY spelling keeps the Gap row visible (it reads all of them).
  const hasGridGap = ['row-gap', 'column-gap', 'grid-row-gap', 'grid-column-gap', 'gap']
    .some((prop) => read(prop) != null)
  return (
    <>
      <LayoutDisclosure label="Flex settings" open={open.flex} onToggle={() => toggle('flex')}>
        <DirectionRow read={read} busy={busy} setProp={setProp} clearProp={clearProp} onProvenance={onProvenance} onSelectSelector={onSelectSelector} />
        <AlignRow read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp} onProvenance={onProvenance} onSelectSelector={onSelectSelector} />
      </LayoutDisclosure>
      <LayoutDisclosure label="Grid settings" open={open.grid} onToggle={() => toggle('grid')}>
        <GridControls read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp} onProvenance={onProvenance} onSelectSelector={onSelectSelector} />
      </LayoutDisclosure>
      {/* Gap is shared by flex + grid — always mounted (keeps its link-toggle state),
          shown whenever the element is a flex/grid container. */}
      <GapControl
        key={activeSelector}
        show={mode === 'flex' || mode === 'grid' || hasGridGap}
        read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp}
        onProvenance={onProvenance} onSelectSelector={onSelectSelector}
      />
      <LayoutDisclosure label="Inline settings" open={open.inline} onToggle={() => toggle('inline')}>
        {/* Align Y = vertical-align: the inline-level alignment property. Dimmed unless
            Display is inline-level or table-cell, where it actually applies. */}
        <VerticalAlignRow
          resolved={read('vertical-align')}
          dimmed={!VALIGN_DISPLAYS.has(display || 'block')}
          busy={busy} setProp={setProp} clearProp={clearProp}
          onProvenance={onProvenance} onSelectSelector={onSelectSelector}
        />
      </LayoutDisclosure>
    </>
  )
}
