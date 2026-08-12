// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import React from 'react';
import { CloseIcon } from '../ui/Icons.jsx';

const STATUS_LABEL = {
  resolving: '···',
  stale: 'Updated',
  error: 'Error',
};

/**
 * @param {{ snapshot: any, onOpenDetails?: Function, onRemove?: Function }} props
 */
export default function ContextChip({ snapshot, onOpenDetails, onRemove }) {
  const suffix = STATUS_LABEL[snapshot.status];
  return (
    <div className={`context-chip ${snapshot.status}`}>
      <button
        type="button"
        className="context-chip-label"
        onClick={() => onOpenDetails(snapshot.id)}
      >
        {snapshot.label}
        {suffix ? <span className="context-chip-status">{suffix}</span> : null}
      </button>
      <button
        type="button"
        className="context-chip-remove"
        aria-label={`Remove ${snapshot.label}`}
        onClick={() => onRemove(snapshot.id)}
      >
        <CloseIcon size={10} />
      </button>
    </div>
  );
}
