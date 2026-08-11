import type { StateCreator } from 'zustand';
import type { PageState, PageModel } from '../types/ast';
import type { PageEntry } from '../types/ipc';
import type { HistorySlice } from './historySlice';
import type { SelectionSlice } from './selectionSlice';

export interface DocumentSlice {
  currentPage: PageEntry | null;
  editStack: PageEntry[];
  pageState: PageState | null;
  dirty: boolean;
  setCurrentPage: (p: PageEntry | null) => void;
  setEditStack: (s: PageEntry[]) => void;
  setPageState: (s: PageState | null) => void;
  markClean: () => void;
  mutateModel: (
    fn: (model: PageModel) => PageModel,
    immediate?: boolean,
    coalesceKey?: string | null
  ) => void;
  scheduleSave: (immediate?: boolean) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

type DocSet = (
  partial: Partial<DocumentSlice & HistorySlice & SelectionSlice>
) => void;
type DocGet = () => DocumentSlice & HistorySlice & SelectionSlice;

export const createDocumentSlice: StateCreator<
  DocumentSlice & HistorySlice & SelectionSlice,
  [],
  [],
  DocumentSlice
> = (set, get) => ({
  currentPage: null,
  editStack: [],
  pageState: null,
  dirty: false,
  setCurrentPage: (currentPage) => set({ currentPage }),
  setEditStack: (editStack) => set({ editStack }),
  setPageState: (pageState) => set({ pageState, dirty: true }),
  markClean: () =>
    set((s) =>
      s.pageState ? { pageState: { ...s.pageState, dirty: false }, dirty: false } : {}
    ),

  mutateModel: (fn, immediate = false, coalesceKey = null) => {
    get().pushHistory(coalesceKey);
    const state = get().pageState;
    if (!state || !state.editable) return;
    set({
      pageState: { ...state, model: fn(structuredClone(state.model)), dirty: true },
    });
    get().scheduleSave(immediate);
  },

  scheduleSave: (immediate = false) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(
      () => {
        const state = get().pageState;
        if (!state || !state.editable) return;
        window.avb.writePage({ pagePath: get().currentPage!.path, model: state.model });
        get().markClean();
      },
      immediate ? 0 : 300
    );
  },
});
