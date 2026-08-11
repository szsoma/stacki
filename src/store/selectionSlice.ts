import type { StateCreator } from 'zustand';
import type { UiSlice } from './uiSlice';

export interface SelectionSlice {
  selectedId: string | null;
  hoverNodeId: string | null;
  revealTick: number;
  select: (id: string | null, opts?: { reveal?: boolean }) => void;
  setHoverNode: (id: string | null) => void;
  reveal: () => void;
}

export const createSelectionSlice: StateCreator<
  SelectionSlice & UiSlice,
  [],
  [],
  SelectionSlice
> = (set) => ({
  selectedId: null,
  hoverNodeId: null,
  revealTick: 0,
  select: (id, opts) =>
    set((s) =>
      opts?.reveal
        ? { selectedId: id, leftTab: 'navigator' as const, revealTick: s.revealTick + 1 }
        : { selectedId: id }
    ),
  setHoverNode: (hoverNodeId) => set({ hoverNodeId }),
  reveal: () => set((s) => ({ revealTick: s.revealTick + 1 })),
});
