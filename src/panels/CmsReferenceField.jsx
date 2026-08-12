// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CloseIcon, PlusIcon, SearchIcon, WarningIcon } from '../ui/Icons.jsx';
import { titleOf } from '../cmsSchema.js';

const MISSING = Symbol('missing-item');

// Resolves a target collection's items once on mount (so a chip can show its
// title right away) and again each time the picker opens, so it reflects
// items added moments ago.
function useResolvedItems(collectionRel, resolveCollection) {
  const [items, setItems] = useState(null); // null while loading
  const reload = useCallback(() => {
    if (!collectionRel) {
      setItems([]);
      return;
    }
    resolveCollection(collectionRel).then(setItems);
  }, [collectionRel, resolveCollection]);
  useEffect(() => {
    reload();
  }, [reload]);
  return [items, reload];
}

function resolveTitle(items, id) {
  if (items == null) return null;
  const index = items.findIndex((it) => it._id === id);
  return index < 0 ? MISSING : titleOf(items[index], index);
}

// `removeTitle` differs by control: a single reference is cleared, one of a
// multi-reference's chips is removed.
function Chip({ id, items, onRemove, removeTitle = 'Remove' }) {
  const title = resolveTitle(items, id);
  return (
    <span className={`cms-ref-chip ${title === MISSING ? 'missing' : ''}`}>
      {title === MISSING && <WarningIcon size={11} />}
      {title === MISSING ? 'Missing item' : (title ?? '…')}
      <button className="ghost" title={removeTitle} onClick={onRemove}>
        <CloseIcon size={10} />
      </button>
    </span>
  );
}

export function ReferenceControl({ value, onChange, collectionRel, resolveCollection }) {
  const [open, setOpen] = useState(false);
  const [items, reload] = useResolvedItems(collectionRel, resolveCollection);

  return (
    <div className="cms-ref">
      {value && <Chip id={value} items={items} removeTitle="Clear" onRemove={() => onChange('')} />}
      <button
        className="cms-add"
        onClick={() => {
          reload();
          setOpen(true);
        }}
      >
        <PlusIcon size={11} /> {value ? 'Change' : 'Choose item'}
      </button>
      {open && (
        <ReferencePickerDialog
          items={items}
          multiple={false}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function MultiReferenceControl({ value, onChange, collectionRel, resolveCollection }) {
  const [open, setOpen] = useState(false);
  const [items, reload] = useResolvedItems(collectionRel, resolveCollection);

  return (
    <div className="cms-ref cms-ref-multi">
      {value.length > 0 && (
        <div className="cms-ref-chips">
          {value.map((id) => (
            <Chip key={id} id={id} items={items} onRemove={() => onChange(value.filter((v) => v !== id))} />
          ))}
        </div>
      )}
      <button
        className="cms-add"
        onClick={() => {
          reload();
          setOpen(true);
        }}
      >
        <PlusIcon size={11} /> Add
      </button>
      {open && (
        <ReferencePickerDialog
          items={items}
          selectedIds={value}
          multiple
          onPick={(id) => onChange([...value, id])}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function ReferencePickerDialog({ items, selectedIds = [], multiple, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const overlayRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const open = document.querySelectorAll('.cms-modal-overlay');
      if (open[open.length - 1] !== overlayRef.current) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = (items || []).filter((it, i) => {
    if (multiple && selectedIds.includes(it._id)) return false;
    const q = query.trim().toLowerCase();
    return !q || titleOf(it, i).toLowerCase().includes(q);
  });

  return (
    <div
      ref={overlayRef}
      className="modal-overlay cms-modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal cms-modal cms-ref-modal">
        <div className="modal-header cms-modal-header">
          <span>Choose {multiple ? 'items' : 'an item'}</span>
          <button className="ghost" title="Close" onClick={onClose}>
            <CloseIcon size={12} />
          </button>
        </div>
        <div className="cms-ref-search">
          <SearchIcon size={13} />
          <input autoFocus value={query} placeholder="Search…" onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="cms-ref-list">
          {items == null && <div className="cms-empty-inline">Loading…</div>}
          {items != null &&
            list.map((it, i) => (
              <button key={it._id} className="cms-ref-option" onClick={() => onPick(it._id)}>
                {titleOf(it, i)}
              </button>
            ))}
          {items != null && list.length === 0 && (
            <div className="cms-empty-inline">
              {items.length === 0 ? 'No items in this collection yet.' : 'No matches.'}
            </div>
          )}
        </div>
        {multiple && (
          <div className="modal-footer cms-modal-footer">
            <button className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
