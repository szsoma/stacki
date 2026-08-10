import React, { useEffect, useRef, useState } from 'react';
import { rankResolvers } from '../context/suggestedContext.js';

export default function ContextPicker({ resolvers, prompt, onPickSimple, onPickFiles, onListFiles, onClose }) {
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

  const ranked = rankResolvers(resolvers, {}, prompt || '');

  const sections = [];
  let currentSection = null;
  for (const entry of ranked) {
    if (entry.section !== currentSection) {
      currentSection = entry.section;
      sections.push({ section: currentSection, resolvers: [] });
    }
    sections[sections.length - 1].resolvers.push(entry.resolver);
  }

  return (
    <div className="dropdown context-picker" ref={wrapRef}>
      {view === 'menu' ? (
        <>
          {sections.map(({ section, resolvers: groupResolvers }) => (
            <div key={section} className="context-picker-section">
              <div className="context-picker-section-title">
                {section === 'suggested' ? 'Suggested' : section === 'project' ? 'Project' : 'Visual'}
              </div>
              {groupResolvers.map((resolver) => (
                <div
                  key={resolver.type}
                  className="list-item"
                  onClick={() => (resolver.type === 'selected-files' ? openFiles() : onPickSimple(resolver.type))}
                >
                  {resolver.label}
                </div>
              ))}
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
