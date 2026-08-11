import { describe, expect, it } from 'vitest';
import { createAppStore } from './index';

describe('projectSlice', () => {
  it('starts with no project', () => {
    const store = createAppStore();
    expect(store.getState().project).toBeNull();
    expect(store.getState().scan).toEqual({ pages: [], layouts: [], components: [] });
  });

  it('sets the project', () => {
    const store = createAppStore();
    store.getState().setProject({ path: '/p', name: 'p' });
    expect(store.getState().project).toEqual({ path: '/p', name: 'p' });
  });

  it('replaces the scan wholesale', () => {
    const store = createAppStore();
    const scan = {
      pages: [{ name: 'index', path: '/p/src/pages/index.astro', route: '/' }],
      layouts: [],
      components: [],
    };
    store.getState().setScan(scan);
    expect(store.getState().scan.pages).toHaveLength(1);
  });

  it('gives each created store independent state', () => {
    const a = createAppStore();
    const b = createAppStore();
    a.getState().setProject({ path: '/a', name: 'a' });
    expect(b.getState().project).toBeNull();
  });
});
