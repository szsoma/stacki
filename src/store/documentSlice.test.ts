import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from './index';

describe('documentSlice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.avb = {
      writePage: vi.fn(async () => {}),
      writePageRaw: vi.fn(async () => {}),
    } as any;
  });
  afterEach(() => vi.useRealTimers());
  it.each([false, true])('preserves a loaded document dirty=%s state', (dirty) => {
    const store = createAppStore();

    store.getState().setPageState({
      editable: true,
      model: { imports: [], extraFrontmatter: '', nodes: [] },
      dirty,
    });

    expect(store.getState().dirty).toBe(dirty);
    expect(store.getState().pageState?.dirty).toBe(dirty);
  });

  it('keeps global and document dirty state aligned after a model mutation', () => {
    const store = createAppStore();
    store.getState().setCurrentPage({ name: 'index', path: '/project/index.astro' });
    store.getState().setPageState({
      editable: true,
      model: { imports: [], extraFrontmatter: '', nodes: [] },
      dirty: false,
    });

    store.getState().mutateModel((model) => ({ ...model, extraFrontmatter: 'const x = 1;' }));

    expect(store.getState().dirty).toBe(true);
    expect(store.getState().pageState?.dirty).toBe(true);
  });

  it('reports a debounced rejection once, stays dirty, and retries on the next edit', async () => {
    const store = createAppStore();
    store.getState().setCurrentPage({ name: 'index', path: '/project/index.astro' });
    store.getState().setPageState({
      editable: true,
      model: { imports: [], extraFrontmatter: '', nodes: [] },
      dirty: false,
    });
    vi.mocked(window.avb.writePage)
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);

    store.getState().mutateModel((model) => ({ ...model, extraFrontmatter: 'first' }));
    await vi.advanceTimersByTimeAsync(300);
    expect(store.getState().saveError).toBe('disk full');
    expect(store.getState().dirty).toBe(true);
    expect(window.avb.writePage).toHaveBeenCalledTimes(1);

    store.getState().mutateModel((model) => ({ ...model, extraFrontmatter: 'second' }));
    expect(store.getState().saveError).toBeNull();
    await vi.advanceTimersByTimeAsync(300);
    expect(window.avb.writePage).toHaveBeenCalledTimes(2);
    expect(store.getState().dirty).toBe(false);
  });

  it('serializes an in-flight save before a newer revision and only the newest marks clean', async () => {
    const store = createAppStore();
    store.getState().setCurrentPage({ name: 'index', path: '/project/index.astro' });
    store.getState().setPageState({
      editable: true,
      model: { imports: [], extraFrontmatter: '', nodes: [] },
      dirty: false,
    });
    let releaseFirst!: () => void;
    vi.mocked(window.avb.writePage).mockImplementationOnce(() =>
      new Promise<void>((resolve) => { releaseFirst = resolve; })
    );

    store.getState().mutateModel((model) => ({ ...model, extraFrontmatter: 'first' }));
    await vi.advanceTimersByTimeAsync(300);
    store.getState().mutateModel((model) => ({ ...model, extraFrontmatter: 'second' }));
    store.getState().cancelScheduledSave();
    const latest = store.getState();
    const flush = latest.saveSnapshot(
      latest.currentPage!.path,
      latest.pageState!,
      latest.documentRevision
    );
    expect(window.avb.writePage).toHaveBeenCalledTimes(1);
    expect(store.getState().dirty).toBe(true);

    releaseFirst();
    await flush;
    expect(window.avb.writePage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(window.avb.writePage).mock.calls[1][0].model.extraFrontmatter).toBe('second');
    expect(store.getState().dirty).toBe(false);
  });
});
