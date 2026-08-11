import type { StateCreator } from 'zustand';
import type { PageState } from '../types/ast';
import type { PageEntry } from '../types/ipc';

export interface DocumentSlice {
  currentPage: PageEntry | null;
  editStack: PageEntry[];
  pageState: PageState | null;
  setCurrentPage: (p: PageEntry | null) => void;
  setEditStack: (s: PageEntry[]) => void;
  setPageState: (s: PageState | null) => void;
  markClean: () => void;
}

export const createDocumentSlice: StateCreator<DocumentSlice, [], [], DocumentSlice> = (
  set
) => ({
  currentPage: null,
  editStack: [],
  pageState: null,
  setCurrentPage: (currentPage) => set({ currentPage }),
  setEditStack: (editStack) => set({ editStack }),
  setPageState: (pageState) => set({ pageState }),
  markClean: () =>
    set((s) =>
      s.pageState ? { pageState: { ...s.pageState, dirty: false } } : {}
    ),
});
