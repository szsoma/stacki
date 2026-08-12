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
  documentRevision: number;
  saveError: string | null;
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
  cancelScheduledSave: () => void;
  markCleanIfCurrent: (pagePath: string, revision: number) => void;
  saveSnapshot: (pagePath: string, state: PageState, revision: number) => Promise<void>;
  clearSaveError: () => void;
  suspendScheduledSave: () => PendingSave | null;
  restoreScheduledSave: (pending: PendingSave | null) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveChain: Promise<void> = Promise.resolve();
export interface PendingSave {
  pagePath: string;
  state: PageState;
  revision: number;
}
let pendingSave: PendingSave | null = null;

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
  documentRevision: 0,
  saveError: null,
  setCurrentPage: (currentPage) => set({ currentPage }),
  setEditStack: (editStack) => set({ editStack }),
  setPageState: (pageState) => set((s) => ({
    pageState,
    dirty: pageState?.dirty ?? false,
    documentRevision: s.documentRevision + 1,
  })),
  markClean: () =>
    set((s) =>
      s.pageState ? { pageState: { ...s.pageState, dirty: false }, dirty: false } : {}
    ),
  markCleanIfCurrent: (pagePath, revision) =>
    set((s) =>
      s.currentPage?.path === pagePath && s.documentRevision === revision && s.pageState
        ? { pageState: { ...s.pageState, dirty: false }, dirty: false }
        : {}
    ),
  saveSnapshot: (pagePath, state, revision) => {
    const snapshot = state.editable
      ? { editable: true as const, model: structuredClone(state.model) }
      : { editable: false as const, source: state.source };
    const write = async () => {
      if (snapshot.editable) {
        await window.avb.writePage({ pagePath, model: snapshot.model });
      } else {
        await window.avb.writePageRaw({ pagePath, source: snapshot.source });
      }
      get().markCleanIfCurrent(pagePath, revision);
    };
    const result = saveChain.then(write);
    saveChain = result.catch(() => {});
    return result;
  },
  clearSaveError: () => set({ saveError: null }),

  mutateModel: (fn, immediate = false, coalesceKey = null) => {
    get().pushHistory(coalesceKey);
    const state = get().pageState;
    if (!state || !state.editable) return;
    set((s) => ({
      pageState: { ...state, model: fn(structuredClone(state.model)), dirty: true },
      dirty: true,
      documentRevision: s.documentRevision + 1,
      saveError: null,
    }));
    get().scheduleSave(immediate);
  },

  scheduleSave: (immediate = false) => {
    clearTimeout(saveTimer);
    const { currentPage, pageState, documentRevision } = get();
    if (!currentPage || !pageState) return;
    const pagePath = currentPage.path;
    pendingSave = {
      pagePath,
      state: structuredClone(pageState),
      revision: documentRevision,
    };
    const run = async () => {
      const pending = pendingSave;
      pendingSave = null;
      if (!pending) return;
      try {
        await get().saveSnapshot(pending.pagePath, pending.state, pending.revision);
      } catch (error) {
        set({ saveError: error instanceof Error ? error.message : String(error) });
      }
    };
    saveTimer = setTimeout(
      run,
      immediate ? 0 : 300
    );
  },
  cancelScheduledSave: () => {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    pendingSave = null;
  },
  suspendScheduledSave: () => {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const suspended = pendingSave;
    pendingSave = null;
    return suspended;
  },
  restoreScheduledSave: (pending) => {
    if (!pending || pendingSave) return;
    clearTimeout(saveTimer);
    pendingSave = pending;
    saveTimer = setTimeout(async () => {
      const restored = pendingSave;
      pendingSave = null;
      if (!restored) return;
      try {
        await get().saveSnapshot(restored.pagePath, restored.state, restored.revision);
      } catch (error) {
        set({ saveError: error instanceof Error ? error.message : String(error) });
      }
    }, 300);
  },
});
