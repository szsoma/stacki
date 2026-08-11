import React, { useRef, useState } from 'react';
import { CheckIcon, CloseIcon, TrashIcon, WarningIcon } from '../ui/Icons.jsx';
import { clearIncomingReference } from '../cmsReferences.js';
import { collectionOf, reassemble } from '../cmsSchema.js';

const keyOf = (hit) => [hit.collectionRel, hit.itemIndex, ...hit.steps, hit.fieldKey].join(':');

// Blocks a delete until every item elsewhere in the project that references
// what's about to disappear has been resolved — either repointed by hand
// (Show instance) or cleared on the spot (Remove anyway). `hits` and `files`
// are a snapshot taken when the delete was attempted; each hit disappears
// from the list the moment its reference is cleared.
export default function CmsDeleteGuard({
  title,
  message,
  hits: initialHits,
  files,
  projectPath,
  onShowInstance,
  onConfirm,
  onCancel,
}) {
  const [hits, setHits] = useState(initialHits);
  const [busyKey, setBusyKey] = useState(null);
  const filesRef = useRef(files);

  const removeAnyway = async (hit) => {
    const key = keyOf(hit);
    setBusyKey(key);
    const file = filesRef.current.find((f) => f.rel === hit.collectionRel);
    const collection = collectionOf(file);
    const nextItems = clearIncomingReference(collection.items, hit);
    const data = reassemble(collection, nextItems);
    await window.avb.writeCms({ projectPath, rel: hit.collectionRel, data });
    filesRef.current = filesRef.current.map((f) => (f.rel === hit.collectionRel ? { ...f, data } : f));
    setHits((prev) => prev.filter((h) => keyOf(h) !== key));
    setBusyKey(null);
  };

  return (
    <div
      className="modal-overlay cms-modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="modal cms-modal cms-guard-modal">
        <div className="modal-header cms-modal-header">
          <span>{title}</span>
          <button className="ghost" title="Close" onClick={onCancel}>
            <CloseIcon size={12} />
          </button>
        </div>
        <div className="modal-body cms-guard-body">
          <p className="cms-note" style={{ margin: 0 }}>
            {message}
          </p>
          {hits.length > 0 && (
            <div className="cms-guard-list">
              {hits.map((hit) => (
                <div key={keyOf(hit)} className="cms-guard-row">
                  <WarningIcon size={13} />
                  <span className="cms-guard-row-text">
                    <strong>{hit.itemTitle}</strong> in {hit.collectionLabel} — "{hit.fieldLabel}"
                  </span>
                  <span className="cms-guard-row-actions">
                    <button className="ghost" title="Go to this item" onClick={() => onShowInstance(hit)}>
                      Show instance
                    </button>
                    <button
                      className="ghost danger"
                      title="Remove this reference"
                      disabled={busyKey === keyOf(hit)}
                      onClick={() => removeAnyway(hit)}
                    >
                      Remove anyway
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {hits.length === 0 && (
            <div className="cms-guard-clear">
              <CheckIcon size={12} /> Nothing references this anymore.
            </div>
          )}
        </div>
        <div className="modal-footer cms-modal-footer">
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="ghost danger" disabled={hits.length > 0} onClick={onConfirm}>
            <TrashIcon size={12} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}
