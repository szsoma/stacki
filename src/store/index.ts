import { create, createStore } from 'zustand';
import { createProjectSlice, type ProjectSlice } from './projectSlice';

export type AppState = ProjectSlice;

const initializer = (...args: Parameters<typeof createProjectSlice>): AppState => ({
  ...createProjectSlice(...args),
});

export const createAppStore = () => createStore<AppState>()(initializer);

export const useAppStore = create<AppState>()(initializer);

export const getState = () => useAppStore.getState();
export const setState = useAppStore.setState;
