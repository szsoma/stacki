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

export function useTerminalContext(appState) {
  const [chips, setChips] = useState([]);
  const [prompt, setPrompt] = useState('');
  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  const resolveChip = useCallback(async (id, type, options) => {
    const resolver = getResolver(type);
    try {
      const result = await resolver.resolve(appStateRef.current, options);
      const staleKey = resolver.computeStaleKey
        ? resolver.computeStaleKey(appStateRef.current)
        : null;
      setChips((current) =>
        current.map((chip) =>
          chip.id === id ? { ...withReady(chip, result), staleKey } : chip,
        ),
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

  // Each resolver may declare computeStaleKey(appState) to say what its
  // snapshot depends on. A ready chip whose resolver's current key no longer
  // matches the key captured at resolve time has had its source change from
  // under it — mark it stale so the user can refresh or keep the captured
  // version. Resolvers without computeStaleKey (e.g. Selected files) never
  // auto-stale.
  useEffect(() => {
    setChips((current) => {
      // Bail out with the same array reference when nothing actually goes
      // stale. `.map()` unconditionally allocates a new array, and handing
      // that to setChips would change identity even when no chip changed —
      // React can't bail out of the re-render, appState's identity may be
      // freshly allocated by the caller on every one of those re-renders too
      // (e.g. an inline object literal), and the resulting render -> effect
      // -> setChips -> render cycle never terminates.
      let changed = false;
      const next = current.map((chip) => {
        if (chip.status !== CONTEXT_CHIP_STATUS.READY) return chip;
        const resolver = getResolver(chip.type);
        if (!resolver?.computeStaleKey) return chip;
        const staleKey = resolver.computeStaleKey(appState);
        if (staleKey === chip.staleKey) return chip;
        changed = true;
        return withStale(chip);
      });
      return changed ? next : current;
    });
  }, [appState]);

  const composedMarkdown = useMemo(
    () => composePrompt({ request: prompt, snapshots: chips }),
    [prompt, chips],
  );

  const insertIntoTerminal = useCallback(() => {
    // `dispatchEvent` runs listeners synchronously, so TerminalPanel's
    // handler has already run (and called `preventDefault()` if it couldn't
    // actually paste — no live shell session) by the time this returns.
    // Only clear the prompt when the text was really delivered, or the
    // user's typed request is silently lost the moment the shell exits.
    const event = new CustomEvent('stacki:terminal-menu', {
      cancelable: true,
      detail: { action: 'insert', text: composedMarkdown },
    });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) {
      setPrompt('');
    }
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
