import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { PageModel } from '../types/ast';
import { createAppStore } from './index';

function model(value: string): PageModel {
  return {
    imports: [],
    extraFrontmatter: '',
    nodes: [{ id: 'n1', kind: 'element', name: 'section', props: { id: { type: 'string', value } }, children: [] }],
  };
}

function seeded() {
  const store = createAppStore();
  store.getState().setPageState({ editable: true, model: model('a'), dirty: false });
  return store;
}

describe('historySlice', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses same-key pushes inside 800ms', () => {
    const store = seeded();
    store.getState().pushHistory('prop:n1:id');
    vi.advanceTimersByTime(100);
    store.getState().pushHistory('prop:n1:id');
    vi.advanceTimersByTime(100);
    store.getState().pushHistory('prop:n1:id');
    expect(store.getState().past).toHaveLength(1);
  });

  it('does not collapse once 800ms has elapsed', () => {
    const store = seeded();
    store.getState().pushHistory('prop:n1:id');
    vi.advanceTimersByTime(801);
    store.getState().pushHistory('prop:n1:id');
    expect(store.getState().past).toHaveLength(2);
  });

  it('never collapses a null key', () => {
    const store = seeded();
    store.getState().pushHistory(null);
    store.getState().pushHistory(null);
    expect(store.getState().past).toHaveLength(2);
  });

  it('does not collapse across different keys', () => {
    const store = seeded();
    store.getState().pushHistory('prop:n1:id');
    vi.advanceTimersByTime(10);
    store.getState().pushHistory('prop:n1:class');
    expect(store.getState().past).toHaveLength(2);
  });

  it('caps past at 100 entries, dropping the oldest', () => {
    const store = seeded();
    for (let i = 0; i < 120; i += 1) {
      store.getState().pushHistory(null);
    }
    expect(store.getState().past).toHaveLength(100);
  });

  it('clears the future on a new push', () => {
    const store = seeded();
    store.getState().pushHistory(null);
    store.getState().undo();
    expect(store.getState().future).toHaveLength(1);
    store.getState().pushHistory(null);
    expect(store.getState().future).toHaveLength(0);
  });

  it('snapshots deeply so later mutation cannot corrupt history', () => {
    const store = seeded();
    store.getState().pushHistory(null);
    const live = store.getState().pageState as { model: PageModel };
    live.model.nodes[0]!.props!.id = { type: 'string', value: 'MUTATED' };
    store.getState().undo();
    const restored = store.getState().pageState as { model: PageModel };
    expect(restored.model.nodes[0]!.props!.id).toEqual({ type: 'string', value: 'a' });
  });

  it('undo and redo are no-ops on empty stacks', () => {
    const store = seeded();
    expect(() => store.getState().undo()).not.toThrow();
    expect(() => store.getState().redo()).not.toThrow();
    expect(store.getState().past).toHaveLength(0);
  });

  it('clears the selection when the restored model lost the selected node', () => {
    const store = seeded();
    store.getState().select('gone');
    store.getState().pushHistory(null);
    store.getState().undo();
    expect(store.getState().selectedId).toBeNull();
  });

  it('keeps the selection when the restored model still has the node', () => {
    const store = seeded();
    store.getState().select('n1');
    store.getState().pushHistory(null);
    store.getState().undo();
    expect(store.getState().selectedId).toBe('n1');
  });

  it('resetHistory empties both stacks', () => {
    const store = seeded();
    store.getState().pushHistory(null);
    store.getState().resetHistory();
    expect(store.getState().past).toHaveLength(0);
    expect(store.getState().future).toHaveLength(0);
  });
});
