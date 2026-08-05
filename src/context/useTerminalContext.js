import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTEXT_CHIP_STATUS,
  createSnapshot,
  withError,
  withReady,
  withStale,
} from './contextTypes.js';
import { getResolver } from './contextResolvers.js';
import { composePrompt } from './promptComposer.js';

function currentFileKey(currentFile) {
  if (!currentFile) return null;
  return `${currentFile.path || currentFile.title}:${currentFile.content.length}:${currentFile.content}`;
}

export function useTerminalContext(appState) {
  const [chips, setChips] = useState([]);
  const [prompt, setPrompt] = useState('');
  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const previousFileKeyRef = useRef(currentFileKey(appState.currentFile));

  const resolveChip = useCallback(async (id, type, options) => {
    const resolver = getResolver(type);
    try {
      const result = await resolver.resolve(appStateRef.current, options);
      setChips((current) =>
        current.map((chip) => (chip.id === id ? withReady(chip, result) : chip)),
      );
    } catch (error) {
      setChips((current) =>
        current.map((chip) => (chip.id === id ? withError(chip, error) : chip)),
      );
    }
  }, []);

  const addChip = useCallback(
    (type, options) => {
      const resolver = getResolver(type);
      if (!resolver) throw new Error(`No resolver registered for "${type}".`);
      const resolvedOptions = options ?? resolver.getDefaultOptions(appStateRef.current);
      const snapshot = createSnapshot({ type, label: resolver.label, options: resolvedOptions });
      setChips((current) => [...current, snapshot]);
      void resolveChip(snapshot.id, type, resolvedOptions);
      return snapshot.id;
    },
    [resolveChip],
  );

  const removeChip = useCallback((id) => {
    setChips((current) => current.filter((chip) => chip.id !== id));
  }, []);

  const refreshChip = useCallback(
    (id) => {
      // Look up the target chip from current `chips` state rather than
      // capturing it inside the setChips updater: React 18 batches state
      // updates, so an updater passed to setChips does not run
      // synchronously in this call frame, and a `let target` closure
      // written from inside it would still be null on the next line.
      const target = chips.find((chip) => chip.id === id);
      if (!target) return;
      setChips((current) =>
        current.map((chip) =>
          chip.id === id ? { ...chip, status: CONTEXT_CHIP_STATUS.RESOLVING } : chip,
        ),
      );
      void resolveChip(id, target.type, target.options);
    },
    [chips, resolveChip],
  );

  // The floating code editor's content already lives in the renderer, so a
  // changed open-file key is enough to know the current-file chip is stale —
  // no re-read needed just to detect it.
  useEffect(() => {
    const key = currentFileKey(appState.currentFile);
    if (key !== previousFileKeyRef.current) {
      setChips((current) =>
        current.map((chip) =>
          chip.type === 'current-file' && chip.status === CONTEXT_CHIP_STATUS.READY
            ? withStale(chip)
            : chip,
        ),
      );
    }
    previousFileKeyRef.current = key;
  }, [appState.currentFile]);

  const composedMarkdown = useMemo(
    () => composePrompt({ request: prompt, snapshots: chips }),
    [prompt, chips],
  );

  const insertIntoTerminal = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('stacki:terminal-menu', {
        detail: { action: 'insert', text: composedMarkdown },
      }),
    );
    setPrompt('');
  }, [composedMarkdown]);

  return {
    chips,
    prompt,
    setPrompt,
    addChip,
    removeChip,
    refreshChip,
    composedMarkdown,
    insertIntoTerminal,
  };
}
