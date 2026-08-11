import { useRef, useState } from 'react'
import { PropertyCombobox } from './PropertyCombobox'
import { parseImportant } from './embedHelpers'

function AddPropertyRow({ busy, onAdd }: { busy: boolean; onAdd: (prop: string, value: string, important: boolean) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [prop, setProp] = useState('')
  const [value, setValue] = useState('')
  const valueRef = useRef<HTMLInputElement>(null)
  const ready = prop.trim() !== '' && value.trim() !== ''

  const cancel = () => { setProp(''); setValue(''); setExpanded(false) }
  const submit = () => {
    if (!ready) return
    const parsed = parseImportant(value)
    onAdd(prop.trim(), parsed.value, parsed.important)
    setProp('') // keep the row open + cleared so several can be added in a row
    setValue('')
  }

  if (!expanded) {
    return (
      <button className="embed-editor_add-btn" type="button" onClick={() => setExpanded(true)} disabled={busy}>
        <span className="embed-editor_add-plus" aria-hidden="true">+</span> Add property
      </button>
    )
  }

  return (
    <div className="embed-editor_decl is-add">
      <button className="embed-editor_icon-btn" type="button" onClick={cancel} title="Cancel" aria-label="Cancel adding property">✕</button>
      <PropertyCombobox
        value={prop}
        busy={busy}
        onChange={setProp}
        onPick={(picked) => { setProp(picked); valueRef.current?.focus() }}
        onEnter={submit}
        onEscape={cancel}
      />
      <input
        ref={valueRef}
        className="u-input embed-editor_value-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') submit(); if (event.key === 'Escape') cancel() }}
        placeholder="value"
        spellCheck={false}
        aria-label="New value"
      />
      <button className="embed-editor_icon-btn" type="button" onClick={submit} disabled={busy || !ready} title="Add property" aria-label="Add property">+</button>
    </div>
  )
}

export { AddPropertyRow }
