import type { StateCreator } from 'zustand';
import type { PageModel, PageState } from '../types/ast';
import { findNodeById } from '../model/nodes';
import type { DocumentSlice } from './documentSlice';
import type { SelectionSlice } from './selectionSlice';

export type Snapshot =
  | { kind: 'model'; model: PageModel }
  | { kind: 'source'; source: string };

const COALESCE_MS = 800;
const MAX_HISTORY = 100;

export interface HistorySlice {
  past: Snapshot[];
  future: Snapshot[];
  lastPush: number;
  lastKey: string | null;
  pushHistory: (coalesceKey?: string | null) => void;
  undo: () => void;
  redo: () => void;
  resetHistory: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function snapshotOf(state: PageState): Snapshot {
  return state.editable
    ? { kind: 'model', model: structuredClone(state.model) }
    : { kind: 'source', source: state.source };
}

export const createHistorySlice: StateCreator<
  HistorySlice & DocumentSlice & SelectionSlice,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  past: [],
  future: [],
  lastPush: 0,
  lastKey: null,

  pushHistory: (coalesceKey = null) => {
    const state = get().pageState;
    if (!state) return;
    const { past, lastKey, lastPush } = get();
    const now = Date.now();
    const coalesce =
      coalesceKey !== null &&
      coalesceKey === lastKey &&
      now - lastPush < COALESCE_MS &&
      past.length > 0;

    const nextPast = coalesce ? past : [...past, snapshotOf(state)].slice(-MAX_HISTORY);
    set({ past: nextPast, future: [], lastKey: coalesceKey, lastPush: now });
  },

  undo: () => {
    const { past, future, pageState } = get();
    if (!past.length || !pageState) return;
    const entry = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [...future, snapshotOf(pageState)],
      lastKey: null,
      lastPush: 0,
    });
    applySnapshot(set, get, entry);
  },

  redo: () => {
    const { past, future, pageState } = get();
    if (!future.length || !pageState) return;
    const entry = future[future.length - 1];
    set({
      future: future.slice(0, -1),
      past: [...past, snapshotOf(pageState)],
      lastKey: null,
      lastPush: 0,
    });
    applySnapshot(set, get, entry);
  },

  resetHistory: () => set({ past: [], future: [], lastPush: 0, lastKey: null }),
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
});

function applySnapshot(
  set: (partial: Partial<HistorySlice & DocumentSlice & SelectionSlice>) => void,
  get: () => HistorySlice & DocumentSlice & SelectionSlice,
  entry: Snapshot
) {
  const current = get().pageState;
  if (!current) return;
  if (entry.kind === 'model') {
    set({
      pageState: {
        ...current,
        editable: true,
        model: structuredClone(entry.model),
        dirty: true,
      } as PageState,
    });
    const id = get().selectedId;
    if (id && id !== 'layout' && !findNodeById(entry.model.nodes ?? [], id)) {
      set({ selectedId: null });
    }
  } else {
    set({ pageState: { ...current, source: entry.source, dirty: true } as PageState });
  }
}
