// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useAppStore } from '../store/index';

// Fields we want to reset between tests (value fields only, not action functions).
const RESET_FIELDS = {
  project: null,
  scan: { pages: [], layouts: [], components: [] },
  projectClasses: [],
  currentPage: null,
  editStack: [],
  pageState: null,
  dirty: false,
  selectedId: null,
  hoverNodeId: null,
  revealTick: 0,
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
  devUrl: null,
  devStatus: 'off',
  devLog: '',
  devDiag: null,
  refreshKey: 0,
  device: 'desktop',
  inPreview: false,
  previewSrc: null,
  past: [],
  future: [],
  lastPush: 0,
  lastKey: null,
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useAppStore.setState(RESET_FIELDS);
});
