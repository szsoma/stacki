import type { StateCreator } from 'zustand';

export type LeftTab = 'pages' | 'navigator' | 'components' | 'assets' | 'cms' | 'terminal' | null;
export type RightTab = 'style' | 'settings';

export interface UiSlice {
  leftTab: LeftTab;
  rightTab: RightTab;
  codeWin: { targetId?: string; kind: 'file'; title: string; language: string } | null;
  insertOpen: boolean;
  busy: string | null;
  toast: { msg: string; kind: string } | null;
  assetPick: { targetId: string; returnTab: LeftTab } | null;
  cmsRel: string | null;
  cmsTick: number;
  cmsSettings: boolean;
  cmsJump: { rel: string; itemId: string } | null;
  setLeftTab: (tab: LeftTab) => void;
  setRightTab: (tab: RightTab) => void;
  setCodeWin: (w: UiSlice['codeWin']) => void;
  setInsertOpen: (v: boolean) => void;
  setBusy: (v: string | null) => void;
  showToast: (msg: string, kind?: string) => void;
  setAssetPick: (v: UiSlice['assetPick']) => void;
  setCmsRel: (v: string | null) => void;
  setCmsTick: (v: number) => void;
  setCmsSettings: (v: boolean) => void;
  setCmsJump: (v: UiSlice['cmsJump']) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set) => ({
  leftTab: 'navigator',
  rightTab: 'style',
  codeWin: null,
  insertOpen: false,
  busy: null,
  toast: null,
  assetPick: null,
  cmsRel: null,
  cmsTick: 0,
  cmsSettings: false,
  cmsJump: null,
  setLeftTab: (leftTab) => set({ leftTab }),
  setRightTab: (rightTab) => set({ rightTab }),
  setCodeWin: (codeWin) => set({ codeWin }),
  setInsertOpen: (insertOpen) => set({ insertOpen }),
  setBusy: (busy) => set({ busy }),
  showToast: (msg, kind = 'info') => {
    clearTimeout(toastTimer);
    set({ toast: { msg, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), 2500);
  },
  setAssetPick: (assetPick) => set({ assetPick }),
  setCmsRel: (cmsRel) => set({ cmsRel }),
  setCmsTick: (cmsTick) => set({ cmsTick }),
  setCmsSettings: (cmsSettings) => set({ cmsSettings }),
  setCmsJump: (cmsJump) => set({ cmsJump }),
});
