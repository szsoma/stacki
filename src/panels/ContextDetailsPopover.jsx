import React, { useEffect, useRef } from 'react';

export default function ContextDetailsPopover({ snapshot, markdown, onRefresh, onRemove, onClose }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div className="dropdown context-details-popover" ref={wrapRef}>
      <h3>{snapshot.label}</h3>
      <div className="context-details-meta">
        Captured {new Date(snapshot.capturedAt).toLocaleTimeString()}
        {(snapshot.status === 'ready' || snapshot.status === 'stale') && ` · ~${snapshot.estimatedTokens} tokens`}
      </div>
      {snapshot.status === 'error' && (
        <div className="context-details-error">{snapshot.error?.message}</div>
      )}
      {(snapshot.status === 'ready' || snapshot.status === 'stale') && (
        <pre className="context-details-preview">{markdown}</pre>
      )}
      <div className="dropdown-row">
        <button type="button" onClick={() => onRefresh(snapshot.id)}>Refresh</button>
        <button type="button" onClick={() => onRemove(snapshot.id)}>Remove</button>
      </div>
    </div>
  );
}
