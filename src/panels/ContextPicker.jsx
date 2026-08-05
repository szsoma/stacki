import React, { useEffect, useRef, useState } from 'react';

export default function ContextPicker({ resolvers, onPickSimple, onPickFiles, onListFiles, onClose }) {
  const [view, setView] = useState('menu');
  const [allFiles, setAllFiles] = useState([]);
  const [query, setQuery] = useState('');
  const [checked, setChecked] = useState(() => new Set());
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const openFiles = async () => {
    setView('files');
    const files = await onListFiles();
    setAllFiles(files);
  };

  const toggle = (path) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const filtered = allFiles.filter((path) => path.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="dropdown context-picker" ref={wrapRef}>
      {view === 'menu' ? (
        <>
          <h3>Add context</h3>
          {resolvers.map((resolver) => (
            <div
              key={resolver.type}
              className="list-item"
              onClick={() => (resolver.type === 'selected-files' ? openFiles() : onPickSimple(resolver.type))}
            >
              {resolver.label}
            </div>
          ))}
        </>
      ) : (
        <>
          <h3>Select files</h3>
          <input
            className="context-picker-search"
            placeholder="Search files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="context-picker-files">
            {filtered.map((path) => (
              <label key={path} className="list-item context-picker-file">
                <input type="checkbox" checked={checked.has(path)} onChange={() => toggle(path)} aria-label={path} />
                {path}
              </label>
            ))}
          </div>
          <div className="dropdown-row">
            <button type="button" disabled={checked.size === 0} onClick={() => onPickFiles([...checked])}>
              Add {checked.size} file{checked.size === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
