import type { ParsedDeclaration } from './lib/types'
import type { DeclStatus } from './lib/cascade'
import { ValueField } from './ValueField'
import FieldLabel from './components/FieldLabel'
import VariableConnect from './VariableConnect'
import DisplayControl from './DisplayControl'

function DeclRow({
  decl,
  status,
  busy,
  reorderable = true,
  draggable,
  dragging,
  dropTarget,
  onGrab,
  onUngrab,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onCommitValue,
  onLiveCommitValue,
  onRemove,
}: {
  decl: ParsedDeclaration
  status: DeclStatus | undefined
  busy: boolean
  /** When false the label isn't a drag handle (fixed canonical order sections). */
  reorderable?: boolean
  draggable: boolean
  dragging: boolean
  dropTarget: boolean
  onGrab: () => void
  onUngrab: () => void
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
  onCommitValue: (value: string, important: boolean) => void
  onLiveCommitValue: (value: string, important: boolean) => void
  onRemove: () => void
}) {
  const overridden = status && !status.winning
  // `display` always uses the dedicated control — it handles custom values too.
  const isDisplay = decl.prop.toLowerCase() === 'display'

  return (
    <div
      className={`embed-editor_decl ${isDisplay ? 'is-control' : ''} ${overridden ? 'is-overridden' : ''} ${dragging ? 'is-dragging' : ''} ${dropTarget ? 'is-drop-target' : ''}`}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', decl.declId)
        onDragStart()
      }}
      onDragOver={(event) => { event.preventDefault(); onDragOver() }}
      onDrop={(event) => { event.preventDefault(); onDrop() }}
      onDragEnd={onDragEnd}
      // A press that never became a drag (a plain click) disarms here so the row
      // doesn't stay draggable — the click still bubbles to the label's menu.
      onMouseUp={onUngrab}
    >
      {/* The label is the drag handle: press-and-drag reorders, a plain click
          opens the menu to remove the declaration (Option-click removes at once). */}
      <FieldLabel
        className="embed-editor_prop-label"
        active
        disabled={busy}
        onReset={onRemove}
        resetLabel="Remove property"
        title={
          overridden
            ? `Overridden by ${status?.overriddenBy ?? 'a stronger rule'}${reorderable ? ' · drag to reorder' : ''}`
            : reorderable ? 'Drag to reorder · click for options' : 'Click for options'
        }
        onMouseDown={busy || !reorderable ? undefined : onGrab}
      >
        {decl.prop}
      </FieldLabel>
      {isDisplay ? (
        <DisplayControl value={decl.value} important={decl.important} busy={busy} onCommit={onCommitValue} />
      ) : (
        <VariableConnect
          ariaLabel={`Connect ${decl.prop} to a variable`}
          disabled={busy}
          prop={decl.prop}
          onPick={(binding) => onCommitValue(binding, decl.important)}
        >
          <ValueField value={decl.value} important={decl.important} busy={busy} onCommit={onCommitValue} onLiveCommit={onLiveCommitValue} />
        </VariableConnect>
      )}
    </div>
  )
}

export { DeclRow }
