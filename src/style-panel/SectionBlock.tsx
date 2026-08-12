import type { ReactNode } from 'react'
import { useState } from 'react'

export function SectionBlock({ label, headerAction, defaultOpen = true, children }: { label: string; headerAction?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const toggle = () => setOpen((value) => !value)
  return (
    <div className={`embed-editor_section-block ${open ? '' : 'is-collapsed'}`}>
      <div className="embed-editor_section-header">
        <button type="button" className="embed-editor_section-toggle" aria-expanded={open} onClick={toggle}>
          <span className="embed-editor_section-title">{label}</span>
        </button>
        {headerAction}
        <button
          type="button"
          className="embed-editor_section-chevron-btn"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
          onClick={toggle}
        >
          <svg className="embed-editor_section-chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.2 6.2 8 10l3.8-3.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open ? <div className="embed-editor_section-body">{children}</div> : null}
    </div>
  )
}
