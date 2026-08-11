import { describe, expect, it } from 'vitest';
import { createAppStore } from './index';

describe('previewSlice', () => {
  it('starts off with no url', () => {
    const store = createAppStore();
    expect(store.getState().devStatus).toBe('off');
    expect(store.getState().devUrl).toBeNull();
    expect(store.getState().device).toBe('desktop');
  });

  it('bumps refreshKey on refresh', () => {
    const store = createAppStore();
    const before = store.getState().refreshKey;
    store.getState().refresh();
    expect(store.getState().refreshKey).toBe(before + 1);
  });

  it('accumulates dev log chunks', () => {
    const store = createAppStore();
    store.getState().appendDevLog('one\n');
    store.getState().appendDevLog('two\n');
    expect(store.getState().devLog).toBe('one\ntwo\n');
  });

  it('enters and exits preview', () => {
    const store = createAppStore();
    store.getState().enterPreview();
    expect(store.getState().inPreview).toBe(true);
    store.getState().exitPreview();
    expect(store.getState().inPreview).toBe(false);
  });
});
