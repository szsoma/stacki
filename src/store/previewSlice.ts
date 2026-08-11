import type { StateCreator } from 'zustand';

export interface PreviewSlice {
  devUrl: string | null;
  devStatus: 'off' | 'starting' | 'on';
  devLog: string;
  devDiag: unknown;
  refreshKey: number;
  device: 'desktop' | 'tablet' | 'phone' | 'canvas';
  inPreview: boolean;
  previewSrc: string | null;
  setDevUrl: (url: string | null) => void;
  setDevStatus: (status: PreviewSlice['devStatus']) => void;
  appendDevLog: (chunk: string) => void;
  setDevDiag: (d: unknown) => void;
  refresh: () => void;
  setDevice: (d: PreviewSlice['device']) => void;
  enterPreview: () => void;
  exitPreview: () => void;
  setPreviewSrc: (v: string | null) => void;
}

const DEV_LOG_CAP = 200 * 1024;

export const createPreviewSlice: StateCreator<PreviewSlice, [], [], PreviewSlice> = (set) => ({
  devUrl: null,
  devStatus: 'off',
  devLog: '',
  devDiag: null,
  refreshKey: 0,
  device: 'desktop',
  inPreview: false,
  previewSrc: null,
  setDevUrl: (devUrl) => set({ devUrl }),
  setDevStatus: (devStatus) => set({ devStatus }),
  appendDevLog: (chunk) =>
    set((s) => {
      let next = s.devLog + chunk;
      if (next.length > DEV_LOG_CAP) {
        next = next.slice(next.length - DEV_LOG_CAP);
      }
      return { devLog: next };
    }),
  setDevDiag: (devDiag) => set({ devDiag }),
  refresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
  setDevice: (device) => set({ device }),
  enterPreview: () => set({ inPreview: true }),
  exitPreview: () => set({ inPreview: false }),
  setPreviewSrc: (previewSrc) => set({ previewSrc }),
});
