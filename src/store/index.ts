import { create, createStore } from 'zustand';
import { createProjectSlice, type ProjectSlice } from './projectSlice';
import { createSelectionSlice, type SelectionSlice } from './selectionSlice';
import { createUiSlice, type UiSlice } from './uiSlice';
import { createPreviewSlice, type PreviewSlice } from './previewSlice';
import { createDocumentSlice, type DocumentSlice } from './documentSlice';
import { createHistorySlice, type HistorySlice } from './historySlice';

export type AppState = ProjectSlice & SelectionSlice & UiSlice & PreviewSlice & DocumentSlice & HistorySlice;

const initializer: (set: any, get: any, api: any) => AppState = (set, get, api) => ({
  ...createProjectSlice(set, get, api),
  ...createSelectionSlice(set, get, api),
  ...createUiSlice(set, get, api),
  ...createPreviewSlice(set, get, api),
  ...createDocumentSlice(set, get, api),
  ...createHistorySlice(set, get, api),
});

export const createAppStore = () => createStore<AppState>()(initializer);

export const useAppStore = create<AppState>()(initializer);

export const getState = () => useAppStore.getState();
export const setState = useAppStore.setState;
