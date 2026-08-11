import { useMemo, useRef, useState } from 'react'
import type { ResolvedProp } from './lib/resolved'
import FieldLabel from './components/FieldLabel'
import Select, { type SelectOption } from './components/Select'
import { ValueField } from './ValueField'
import VariableConnect from './VariableConnect'
import DisplayControl from './DisplayControl'
import ProvenanceList from './ProvenanceList'
import type { ClearProp, LiveSetProp, Read, SetProp, SelectSelector } from './SpacingBox'

// ─────────────────────────── Resolved property row ───────────────────────────

// A generic property row from the resolved model: blue when the picked selector
// sets it (editable + removable), orange when another selector does (value from
// the cascade winner; clicking the label opens provenance; editing it adds the
// property to the picked selector — turning it blue).
export function ResolvedRow({ prop, resolved, busy, setProp, clearProp, liveSetProp, onProvenance, onSelectSelector }: {
  prop: string
  resolved: ResolvedProp
  busy: boolean
  setProp: (prop: string, value: string, important: boolean) => void
  clearProp: (prop: string | string[]) => void
  liveSetProp: (prop: string, value: string | null, important: boolean) => void
  onProvenance: (prop: string, anchor: DOMRect) => void
  onSelectSelector: (selector: string, prop?: string) => void
}) {
  const isSelected = resolved.source === 'selected'
  const display = isSelected && resolved.selectedValue
    ? resolved.selectedValue
    : { value: resolved.winner.value, important: resolved.winner.important }
  const isDisplay = prop === 'display'

  return (
    <div className={`embed-editor_decl ${isDisplay ? 'is-control' : ''}`}>
      {isSelected ? (
        <FieldLabel
          className={`embed-editor_prop-label is-blue ${resolved.overridden ? 'is-overridden' : ''}`}
          active
          disabled={busy}
          onReset={() => clearProp(prop)}
          resetLabel="Remove property"
          title={resolved.overridden ? `Overridden by ${resolved.winner.selectorText}` : undefined}
          menuNote={(close) => <ProvenanceList contributors={resolved.contributors} prop={prop} onSelect={(sel, p) => { onSelectSelector(sel, p); close() }} />}
        >
          {prop}
        </FieldLabel>
      ) : (
        <button
          type="button"
          className="embed-editor_prop-label embed-editor_prop-orange"
          disabled={busy}
          title={`Set by ${resolved.winner.selectorText} — click to see all selectors`}
          onClick={(event) => onProvenance(prop, event.currentTarget.getBoundingClientRect())}
        >
          {prop}
        </button>
      )}
      {isDisplay ? (
        <DisplayControl value={display.value} important={display.important} busy={busy} onCommit={(value, important) => setProp(prop, value, important)} />
      ) : (
        <VariableConnect
          ariaLabel={`Connect ${prop} to a variable`}
          disabled={busy}
          prop={prop}
          onPick={(binding) => setProp(prop, binding, false)}
        >
          <ValueField value={display.value} important={display.important} busy={busy} dataProp={prop} onCommit={(value, important) => setProp(prop, value, important)} onLiveCommit={(value, important) => liveSetProp(prop, value, important)} />
        </VariableConnect>
      )}
    </div>
  )
}

// The Display control is always shown (Webflow parity), even when no selector
// sets `display`. In that case we assume the browser default (block) so there's
// always a value to edit; the label stays dim to signal it isn't set yet.
export function DisplayRow({ resolved, busy, setProp, clearProp, onProvenance, onSelectSelector }: {
  resolved: ResolvedProp | undefined
  busy: boolean
  setProp: (prop: string, value: string, important: boolean) => void
  clearProp: (prop: string | string[]) => void
  onProvenance: (prop: string, anchor: DOMRect) => void
  onSelectSelector: (selector: string, prop?: string) => void
}) {
  const isSelected = resolved?.source === 'selected'
  const current = resolved
    ? (isSelected && resolved.selectedValue ? resolved.selectedValue : { value: resolved.winner.value, important: resolved.winner.important })
    : { value: 'block', important: false }
  return (
    <div className="embed-editor_size-row">
      {!resolved ? (
        <FieldLabel className="embed-editor_size-label" active={false} disabled={busy} onReset={() => {}}>Display</FieldLabel>
      ) : isSelected ? (
        <FieldLabel
          className="embed-editor_size-label"
          active
          disabled={busy}
          onReset={() => clearProp('display')}
          resetLabel="Remove property"
          menuNote={(close) => <ProvenanceList contributors={resolved.contributors} prop="display" onSelect={(sel, p) => { onSelectSelector(sel, p); close() }} />}
        >
          Display
        </FieldLabel>
      ) : (
        <button
          type="button"
          className="embed-editor_size-label embed-editor_prop-orange"
          disabled={busy}
          title={`Set by ${resolved.winner.selectorText} — click to see all selectors`}
          onClick={(event) => onProvenance('display', event.currentTarget.getBoundingClientRect())}
        >
          Display
        </button>
      )}
      <DisplayControl value={current.value} important={current.important} busy={busy} onCommit={(value, important) => setProp('display', value, important)} />
    </div>
  )
}

// Align Y = `vertical-align`. It only affects inline-level / table-cell boxes, so
// the whole row dims (but stays editable) when Display isn't one of those. Values
// mirror Webflow's dropdown.
export const VALIGN_OPTIONS: readonly SelectOption<string>[] = [
  { value: 'baseline', label: 'Baseline' },
  { value: 'sub', label: 'Sub' },
  { value: 'super', label: 'Super' },
  { value: 'top', label: 'Top' },
  { value: 'text-top', label: 'Text top' },
  { value: 'middle', label: 'Middle' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'text-bottom', label: 'Text bottom' },
]
export const VALIGN_VALUES = new Set(VALIGN_OPTIONS.map((option) => option.value))
// Display values for which `vertical-align` actually applies (else the row dims).
export const VALIGN_DISPLAYS = new Set(['inline', 'inline-block', 'inline-flex', 'inline-grid', 'inline-table', 'table-cell'])

export function VerticalAlignRow({ resolved, dimmed, busy, setProp, clearProp, onProvenance, onSelectSelector }: {
  resolved: ResolvedProp | undefined
  /** Display isn't inline/table-cell — fade the row but keep it editable. */
  dimmed: boolean
  busy: boolean
  setProp: (prop: string, value: string, important: boolean) => void
  clearProp: (prop: string | string[]) => void
  onProvenance: (prop: string, anchor: DOMRect) => void
  onSelectSelector: (selector: string, prop?: string) => void
}) {
  const prop = 'vertical-align'
  const isSelected = resolved?.source === 'selected'
  const src = resolved ? (isSelected && resolved.selectedValue ? resolved.selectedValue : resolved.winner) : null
  const raw = src ? src.value.trim() : ''
  const matched = VALIGN_VALUES.has(raw.toLowerCase()) ? raw.toLowerCase() : undefined
  const overridden = resolved?.overridden ?? false

  // Surface a pre-existing non-preset value (e.g. a length) as a trailing option so
  // the trigger reflects it instead of silently snapping back to Baseline.
  const options: SelectOption<string>[] = matched == null && raw
    ? [...VALIGN_OPTIONS, { value: raw, label: raw }]
    : [...VALIGN_OPTIONS]
  const pick = (value: string) => setProp(prop, value, false)

  return (
    <div
      className={`embed-editor_size-row ${dimmed ? 'is-inactive' : ''}`}
      title={dimmed ? 'Align Y applies when Display is inline or table-cell' : undefined}
    >
      {!resolved ? (
        <FieldLabel className="embed-editor_size-label" active={false} disabled={busy} onReset={() => {}}>Align Y</FieldLabel>
      ) : isSelected ? (
        <FieldLabel
          className={`embed-editor_size-label ${overridden ? 'is-overridden' : ''}`}
          active
          disabled={busy}
          onReset={() => clearProp(prop)}
          resetLabel="Remove property"
          title={overridden ? `Overridden by ${resolved.winner.selectorText}` : undefined}
          menuNote={(close) => <ProvenanceList contributors={resolved.contributors} prop={prop} onSelect={(sel, p) => { onSelectSelector(sel, p); close() }} />}
        >
          Align Y
        </FieldLabel>
      ) : (
        <button
          type="button"
          className="embed-editor_size-label embed-editor_prop-orange"
          disabled={busy}
          title={`Set by ${resolved.winner.selectorText} — click to see all selectors`}
          onClick={(event) => onProvenance(prop, event.currentTarget.getBoundingClientRect())}
        >
          Align Y
        </button>
      )}
      <Select
        value={matched ?? (raw || 'baseline')}
        options={options}
        onChange={pick}
        ariaLabel="Align Y"
        disabled={busy}
      />
    </div>
  )
}

// The effective (winner, else selected) value of a resolved prop, lowercased.
// Whether a value is one the property will actually accept (via CSS.supports).
// Gates LIVE writes so a half-typed / invalid value is never pushed at Webflow's
// native style API (which errors and gets stuck). var()/custom props pass; fails
// open only when CSS.supports is unavailable.
export function isSupportedCssValue(prop: string, value: string): boolean {
  const v = value.trim()
  if (!v) return false
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true
  try { return CSS.supports(prop, v) } catch { return false }
}

export function effectiveValue(resolved: ResolvedProp | undefined): string {
  if (!resolved) return ''
  const v = resolved.source === 'selected' && resolved.selectedValue ? resolved.selectedValue.value : resolved.winner.value
  return v.trim().toLowerCase()
}

// The effective raw value + !important flag (not lowercased) — for free-value fields.
export function rawEffective(resolved: ResolvedProp | undefined): { value: string; important: boolean } {
  if (!resolved) return { value: '', important: false }
  const src = resolved.source === 'selected' && resolved.selectedValue ? resolved.selectedValue : resolved.winner
  return { value: src.value, important: src.important }
}
