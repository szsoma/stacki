import { describe, expect, it, vi, afterEach } from 'vitest';
import { createAppStore } from './index';

describe('selectionSlice', () => {
  it('selects a node', () => {
    const store = createAppStore();
    store.getState().select('n1');
    expect(store.getState().selectedId).toBe('n1');
  });

  it('bumps revealTick and switches to the navigator when reveal is asked for', () => {
    const store = createAppStore();
    const before = store.getState().revealTick;
    store.getState().select('n1', { reveal: true });
    expect(store.getState().revealTick).toBe(before + 1);
    expect(store.getState().leftTab).toBe('navigator');
  });

  it('leaves the tab alone for a plain selection', () => {
    const store = createAppStore();
    store.getState().setLeftTab('pages');
    store.getState().select('n1');
    expect(store.getState().leftTab).toBe('pages');
  });
});

describe('uiSlice', () => {
  afterEach(() => vi.useRealTimers());

  it('defaults to the navigator and the style tab', () => {
    const store = createAppStore();
    expect(store.getState().leftTab).toBe('navigator');
    expect(store.getState().rightTab).toBe('style');
  });

  it('shows a toast and clears it after 2.5s', () => {
    vi.useFakeTimers();
    const store = createAppStore();
    store.getState().showToast('saved', 'info');
    expect(store.getState().toast).toEqual({ msg: 'saved', kind: 'info' });
    vi.advanceTimersByTime(2500);
    expect(store.getState().toast).toBeNull();
  });

  it('defaults the toast kind to info', () => {
    vi.useFakeTimers();
    const store = createAppStore();
    store.getState().showToast('hi');
    expect(store.getState().toast?.kind).toBe('info');
  });
});
