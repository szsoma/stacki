import type { StateCreator } from 'zustand';
import type { ScanResult } from '../types/ipc';

export interface Project {
  path: string;
  name: string;
}

export interface ProjectSlice {
  project: Project | null;
  scan: ScanResult;
  projectClasses: string[];
  setProject: (project: Project | null) => void;
  setScan: (scan: ScanResult) => void;
  setProjectClasses: (classes: string[]) => void;
}

export const emptyScan: ScanResult = { pages: [], layouts: [], components: [] };

export const createProjectSlice: StateCreator<ProjectSlice, [], [], ProjectSlice> = (
  set
) => ({
  project: null,
  scan: emptyScan,
  projectClasses: [],
  setProject: (project) => set({ project }),
  setScan: (scan) => set({ scan }),
  setProjectClasses: (projectClasses) => set({ projectClasses }),
});
