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
  const node = (
    <span className={`embed-editor_save ${state.cls}`} tabIndex={0} aria-label={state.tip}>
      {state.icon}
      <span className="embed-editor_tip" role="tooltip">{state.tip}</span>
    </span>
  )
  return createPortal(node, target)
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
