import { useCallback, useRef, useState } from 'react'

import type { ElementSnapshot, ParsedRule } from './lib/types'
import type { ResolvedStyle, StyleContext, ContextKey, ContextInfo, MatchedSelector } from './lib/resolved'
import { groupProps } from './lib/sections'
import { SectionBlock } from './SectionBlock'
import { SelectorPicker } from './SelectorPicker'
import type { SourceOption, SelectorSuggestion } from './SelectorPicker'
import { ADD_QUERY, PlusIcon, AddQueryForm } from './AddQueryForm'
import type { QuerySuggestion } from './AddQueryForm'
import { LayoutModeSections } from './LayoutModeSections'
import { ResolvedRow, DisplayRow } from './ResolvedRows'
import { ProvenancePopover } from './ProvenancePopover'
import { breakpointIcon, EmbedIcon, ComponentIcon } from './EditorIcons'
import { LAYOUT_CONTROL_PROPS, EFFECTS_CONTROL_PROPS, TYPOGRAPHY_CONTROL_PROPS, ALIGN_PROPS, GRID_CONTROL_PROPS } from './propertySets'
import Select from './components/Select'
import ElementTokenPicker from './ElementTokenPicker'
import { CodeEditor } from './components/CodeEditor'
import SizeSection from './SizeSection'
import SpacingSection, { SpacingCenterButton } from './SpacingSection'
import BordersSection from './BordersSection'
import BackgroundSection from './BackgroundSection'
import PositionSection from './PositionSection'
import TypographySection from './TypographySection'
import FlexChildSection from './FlexChildSection'
import EffectsSection from './EffectsSection'
import { AddPropertyRow } from './AddPropertyRow'

export function StyleCard({
  snapshot,
  selectedNames,
  selectedSelector,
  onSelectNames,
  resolved,
  contexts,
  contextInfos,
  context,
  onContext,
  onAddQuery,
  querySuggestions,
  selectors,
  suggestions,
  activeSelector,
  onSelectActive,
  onDeselect,
  onAddSelector,
  sourceValue,
  sourceOptions,
  onSourceChange,
  sourceNote,
  nativeStyleName,
  loading,
  busy,
  pending,
  setProp,
  clearProp,
  liveSetProp,
  onSelectSelector,
  onAdd,
  rawOpen,
  onToggleRaw,
  onSaveRaw,
  onRemoveRule,
}: {
  snapshot: ElementSnapshot | undefined
  selectedNames: string[]
  selectedSelector: string
  onSelectNames: (names: string[]) => void
  resolved: ResolvedStyle
  contexts: StyleContext[]
  contextInfos: ContextInfo[]
  context: ContextKey
  onContext: (context: ContextKey) => void
  onAddQuery: (query: string, mode: 'wrap' | 'nest') => void
  querySuggestions: QuerySuggestion[]
  selectors: MatchedSelector[]
  suggestions: SelectorSuggestion[]
  activeSelector: string
  onSelectActive: (selector: string) => void
  onDeselect: () => void
  onAddSelector: (selector: string) => void
  sourceValue: string
  sourceOptions: SourceOption[]
  onSourceChange: (value: string) => void
  sourceNote: string | null
  nativeStyleName: string | null
  loading: boolean
  busy: boolean
  pending: boolean
  setProp: (prop: string, value: string, important: boolean) => void
  clearProp: (prop: string | string[]) => void
  liveSetProp: (prop: string, value: string | null, important: boolean) => void
  onSelectSelector: (selector: string, prop?: string) => void
  onAdd: (prop: string, value: string, important: boolean) => void
  rawOpen: boolean
  onToggleRaw: () => void
  onSaveRaw: (rule: ParsedRule, css: string) => void
  onRemoveRule: (rule: ParsedRule) => void
}) {
  const selectedRule = resolved.selectedRule
  const [addingQuery, setAddingQuery] = useState(false)
  const [provenance, setProvenance] = useState<{ prop: string; rect: DOMRect } | null>(null)
  const suppressProvenance = useRef<string | null>(null)
  const openProvenance = useCallback((prop: string, rect: DOMRect) => {
    if (suppressProvenance.current === prop) { suppressProvenance.current = null; return }
    suppressProvenance.current = null
    setProvenance({ prop, rect })
  }, [])
  const closeProvenance = useCallback(() => setProvenance(null), [])
  const suppressProvenanceReopen = useCallback((prop: string) => { suppressProvenance.current = prop }, [])
  const [rawDraft, setRawDraft] = useState('')

  const beginRaw = () => {
    if (!selectedRule) return
    setRawDraft(selectedRule.node.toString())
    onToggleRaw()
  }

  const groups = groupProps([...resolved.props.keys()], ['flex-child', 'layout', 'position', 'spacing', 'size', 'typography', 'backgrounds', 'borders', 'effects', 'other'])
  const read = (prop: string) => resolved.props.get(prop)


  return (
    <div className="embed-editor_rule u-surface-surface">
      <div className="embed-editor_head">
      <div className="embed-editor_switchers">
        {contexts.length > 0 ? (
          <Select
            className="embed-editor_context-select"
            value={context}
            options={[
              ...contexts.map((ctx) => ({
                value: ctx.key,
                label: ctx.label,
                icon: breakpointIcon(ctx.breakpoint),
                marked: contextInfos.find((info) => info.key === ctx.key)?.hasStyles ?? false,
              })),
              { value: ADD_QUERY, label: 'Add query', icon: <PlusIcon /> },
            ]}
            onChange={(next) => { if (next === ADD_QUERY) setAddingQuery(true); else onContext(next) }}
            ariaLabel="Style context"
          />
        ) : null}
      </div>
      {addingQuery ? (
        <AddQueryForm
          canNest={activeSelector.length > 0}
          suggestions={querySuggestions}
          onCancel={() => setAddingQuery(false)}
          onAdd={(query, mode) => { setAddingQuery(false); onAddQuery(query, mode) }}
        />
      ) : null}
      <div className="embed-editor_selector">
        <div className="embed-editor_selector-box">
          {snapshot ? (
            <ElementTokenPicker snapshot={snapshot} selected={selectedNames} onChange={(names) => onSelectNames(names)} />
          ) : (
            <div className="embed-editor_element-id is-empty">No element selected</div>
          )}
          <span id="embed-editor_save-slot" className="embed-editor_selector-save" />
        </div>
      </div>

      <SelectorPicker
        selectors={selectors}
        suggestions={suggestions}
        activeSelector={activeSelector}
        busy={busy}
        onSelect={onSelectActive}
        onDeselect={onDeselect}
        onAdd={onAddSelector}
      />
      <div className="embed-editor_selector-head">
        <div className="embed-editor_source-picker">
          <span className="embed-editor_source-prefix">Add custom styles in:</span>
          <Select
            variant="link"
            searchable
            searchPlaceholder="Search embeds…"
            className="embed-editor_source-link"
            value={sourceValue}
            options={sourceOptions.map((opt) => ({
              value: opt.value,
              label: opt.label,
              marked: opt.heading ? false : (opt.marked ?? false),
              heading: opt.heading,
              indent: opt.indent,
              triggerLabel: opt.triggerLabel,
              icon: opt.heading ? <ComponentIcon /> : <EmbedIcon />,
              triggerIcon: opt.fromComponent ? <ComponentIcon /> : <EmbedIcon />,
              tone: opt.fromComponent ? 'component' : 'embed',
            }))}
            onChange={(next) => onSourceChange(next)}
            ariaLabel="Style source — the Webflow class or embed edits go to"
          />
          {loading ? (
            <span className="embed-editor_source-loading" title="Fetching embeds…" aria-live="polite">
              <svg className="embed-editor_source-spinner" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6" />
              </svg>
            </span>
          ) : null}
        </div>
        {pending ? (
          <span className="embed-editor_unsaved" title="Not yet saved — applies when you exit the component">Unsaved</span>
        ) : null}
      </div>
      </div>
      {sourceNote ? <p className="embed-editor_source-note">{sourceNote}</p> : null}

      {rawOpen && selectedRule ? (
        <div className="embed-editor_rule-edit">
          <CodeEditor
            value={rawDraft}
            language="css"
            ariaLabel={`CSS for ${selectedRule.selectorText}`}
            minHeight="90px"
            onChange={setRawDraft}
            className="embed-editor_rule-code"
          />
          <div className="embed-editor_rule-actions">
            <button className="u-button is-ghost is-small" type="button" onClick={onToggleRaw} disabled={busy}>Cancel</button>
            <button className="u-button is-primary is-small" type="button" onClick={() => onSaveRaw(selectedRule, rawDraft)} disabled={busy}>Save rule</button>
          </div>
        </div>
      ) : (
        <div className="embed-editor_decls">
          {groups.map((group) => (
            <SectionBlock
              key={group.def.id}
              label={group.def.label}
              defaultOpen={group.def.id !== 'flex-child'}
              headerAction={group.def.id === 'spacing'
                ? <SpacingCenterButton read={read} busy={busy} setProp={setProp} clearProp={clearProp} />
                : undefined}
            >
              {group.def.id === 'flex-child' ? (
                <FlexChildSection key={activeSelector} read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp} onProvenance={openProvenance} onSelectSelector={onSelectSelector} />
              ) : group.def.id === 'size' ? (
                <SizeSection read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp} onProvenance={openProvenance} onSelectSelector={onSelectSelector} />
              ) : group.def.id === 'position' ? (
                <PositionSection read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp} onProvenance={openProvenance} onSelectSelector={onSelectSelector} />
              ) : group.def.id === 'borders' ? (
                <BordersSection read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp} onProvenance={openProvenance} onSelectSelector={onSelectSelector} />
              ) : group.def.id === 'spacing' ? (
                <SpacingSection read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp} onProvenance={openProvenance} onSelectSelector={onSelectSelector} />
              ) : group.def.id === 'backgrounds' ? (
                <BackgroundSection read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp} onProvenance={openProvenance} onSelectSelector={onSelectSelector} />
              ) : group.def.id === 'typography' ? (
                <>
                  <TypographySection key={activeSelector} read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp} onProvenance={openProvenance} onSelectSelector={onSelectSelector} />
                  {group.props.filter((prop) => !TYPOGRAPHY_CONTROL_PROPS.has(prop)).map((prop) => (
                    <ResolvedRow
                      key={prop}
                      prop={prop}
                      resolved={resolved.props.get(prop)!}
                      busy={busy}
                      setProp={setProp}
                      clearProp={clearProp}
                      liveSetProp={liveSetProp}
                      onProvenance={openProvenance}
                      onSelectSelector={onSelectSelector}
                    />
                  ))}
                </>
              ) : group.def.id === 'layout' ? (
                <>
                  <DisplayRow resolved={read('display')} busy={busy} setProp={setProp} clearProp={clearProp} onProvenance={openProvenance} onSelectSelector={onSelectSelector} />
                  <LayoutModeSections
                    read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp}
                    onProvenance={openProvenance} onSelectSelector={onSelectSelector} activeSelector={activeSelector}
                  />
                  {group.props.filter((prop) =>
                    !LAYOUT_CONTROL_PROPS.has(prop)
                    && !ALIGN_PROPS.has(prop)
                    && !GRID_CONTROL_PROPS.has(prop)
                  ).map((prop) => (
                    <ResolvedRow
                      key={prop}
                      prop={prop}
                      resolved={resolved.props.get(prop)!}
                      busy={busy}
                      setProp={setProp}
                      clearProp={clearProp}
                      liveSetProp={liveSetProp}
                      onProvenance={openProvenance}
                      onSelectSelector={onSelectSelector}
                    />
                  ))}
                </>
              ) : group.def.id === 'effects' ? (
                <>
                  <EffectsSection read={read} busy={busy} setProp={setProp} clearProp={clearProp} liveSetProp={liveSetProp} onProvenance={openProvenance} onSelectSelector={onSelectSelector} />
                  {group.props.filter((prop) => !EFFECTS_CONTROL_PROPS.has(prop)).map((prop) => (
                    <ResolvedRow
                      key={prop}
                      prop={prop}
                      resolved={resolved.props.get(prop)!}
                      busy={busy}
                      setProp={setProp}
                      clearProp={clearProp}
                      liveSetProp={liveSetProp}
                      onProvenance={openProvenance}
                      onSelectSelector={onSelectSelector}
                    />
                  ))}
                </>
              ) : (() => {
                const custom = group.props
                if (!custom.length) return <p className="embed-editor_decls-empty">No custom properties — add one below.</p>
                return custom.map((prop) => (
                  <ResolvedRow
                    key={prop}
                    prop={prop}
                    resolved={resolved.props.get(prop)!}
                    busy={busy}
                    setProp={setProp}
                    clearProp={clearProp}
                    liveSetProp={liveSetProp}
                    onProvenance={openProvenance}
                    onSelectSelector={onSelectSelector}
                  />
                ))
              })()}
            </SectionBlock>
          ))}
        </div>
      )}

      <div className="embed-editor_rule-foot">
        <AddPropertyRow busy={busy} onAdd={onAdd} />
      </div>

      {provenance && resolved.props.get(provenance.prop) ? (
        <ProvenancePopover prop={provenance.prop} anchor={provenance.rect} resolved={resolved.props.get(provenance.prop)!} onClose={closeProvenance} onAnchorReclick={suppressProvenanceReopen} onSelectSelector={onSelectSelector} />
      ) : null}
    </div>
  )
}
