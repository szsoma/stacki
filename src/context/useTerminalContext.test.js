import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearResolvers, registerResolver } from './contextResolvers.js';
import { CONTEXT_CHIP_STATUS } from './contextTypes.js';
import { useTerminalContext } from './useTerminalContext.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeResolver(overrides = {}) {
  return {
    type: 'fake-a',
    label: 'Fake A',
    isAvailable: () => true,
    getDefaultOptions: () => ({}),
    resolve: vi.fn(async () => ({ data: { value: 'x' }, estimatedCharacters: 1, sourceRevision: 'r1' })),
    renderMarkdown: () => '### Fake A\n\nvalue',
    ...overrides,
  };
}

describe('useTerminalContext', () => {
  beforeEach(() => {
    clearResolvers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a chip in resolving status, then moves it to ready', async () => {
    registerResolver(fakeResolver());
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    let id;
    act(() => {
      id = result.current.addChip('fake-a');
    });
    expect(result.current.chips).toHaveLength(1);
    expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.RESOLVING);

    await waitFor(() => {
      expect(result.current.chips.find((c) => c.id === id).status).toBe(CONTEXT_CHIP_STATUS.READY);
    });
    expect(result.current.chips[0].data).toEqual({ value: 'x' });
  });

  it('moves a chip to error status when resolve rejects', async () => {
    registerResolver(
      fakeResolver({ resolve: vi.fn(async () => { throw new Error('boom'); }) }),
    );
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    act(() => {
      result.current.addChip('fake-a');
    });
    await waitFor(() => {
      expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.ERROR);
    });
    expect(result.current.chips[0].error.message).toBe('boom');
  });

  it('removes a chip by id', async () => {
    registerResolver(fakeResolver());
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    let id;
    act(() => {
      id = result.current.addChip('fake-a');
    });
    act(() => {
      result.current.removeChip(id);
    });
    expect(result.current.chips).toHaveLength(0);
  });

  it('re-resolves a chip on refresh', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({ data: { value: 'first' }, estimatedCharacters: 1, sourceRevision: 'r1' })
      .mockResolvedValueOnce({ data: { value: 'second' }, estimatedCharacters: 1, sourceRevision: 'r2' });
    registerResolver(fakeResolver({ resolve }));
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    let id;
    act(() => {
      id = result.current.addChip('fake-a');
    });
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));

    act(() => {
      result.current.refreshChip(id);
    });
    expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.RESOLVING);
    await waitFor(() => expect(result.current.chips[0].data).toEqual({ value: 'second' }));
  });

  it('marks a ready current-file chip stale when the open file changes', async () => {
    registerResolver(
      fakeResolver({
        type: 'current-file',
        resolve: vi.fn(async () => ({ data: { value: 'x' }, estimatedCharacters: 1, sourceRevision: 'r1' })),
      }),
    );
    const { result, rerender } = renderHook(
      ({ appState }) => useTerminalContext(appState),
      { initialProps: { appState: { currentFile: { path: 'a.astro', content: 'one' }, projectPath: null } } },
    );

    act(() => {
      result.current.addChip('current-file');
    });
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));

    rerender({ appState: { currentFile: { path: 'a.astro', content: 'two' }, projectPath: null } });
    expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.STALE);
  });

  it('composes the prompt from the current prompt text and ready chips, then clears the prompt on insert', async () => {
    registerResolver(fakeResolver());
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    act(() => {
      result.current.setPrompt('Fix the spacing.');
    });
    act(() => {
      result.current.addChip('fake-a');
    });
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));
    expect(result.current.composedMarkdown).toContain('Fix the spacing.');
    expect(result.current.composedMarkdown).toContain('### Fake A');

    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    act(() => {
      result.current.insertIntoTerminal();
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({
      action: 'insert',
      text: expect.stringContaining('Fix the spacing.'),
    });
    expect(result.current.prompt).toBe('');
    window.removeEventListener('stacki:terminal-menu', listener);
  });
});
