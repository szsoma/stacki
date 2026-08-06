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

  it('marks a ready chip stale when its resolver-reported key changes', async () => {
    registerResolver(
      fakeResolver({
        resolve: vi.fn(async () => ({ data: { value: 'x' }, estimatedCharacters: 1, sourceRevision: 'r1' })),
        computeStaleKey: (appState) => appState.currentFile?.content ?? null,
      }),
    );
    const { result, rerender } = renderHook(
      ({ appState }) => useTerminalContext(appState),
      { initialProps: { appState: { currentFile: { path: 'a.astro', content: 'one' }, projectPath: null } } },
    );

    act(() => {
      result.current.addChip('fake-a');
    });
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));

    rerender({ appState: { currentFile: { path: 'a.astro', content: 'two' }, projectPath: null } });
    expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.STALE);
  });

  it('resolves against the appState captured at resolve-start, not whatever appState arrives mid-flight', async () => {
    const { promise: resolvePromise, resolve: releaseResolve } = deferred();
    let capturedForResolve = null;
    let capturedForStaleKey = null;
    registerResolver(
      fakeResolver({
        resolve: vi.fn(async (appState) => {
          capturedForResolve = appState;
          await resolvePromise;
          return { data: { value: appState.currentFile?.content }, estimatedCharacters: 1, sourceRevision: 'r1' };
        }),
        computeStaleKey: (appState) => {
          capturedForStaleKey = appState;
          return appState.currentFile?.content ?? null;
        },
      }),
    );
    const { result, rerender } = renderHook(
      ({ appState }) => useTerminalContext(appState),
      { initialProps: { appState: { currentFile: { path: 'a.astro', content: 'one' }, projectPath: null } } },
    );

    act(() => {
      result.current.addChip('fake-a');
    });
    // Still resolving: resolve() has captured the original appState, but
    // hasn't returned yet.
    expect(capturedForResolve.currentFile.content).toBe('one');

    // An ordinary re-render happens while resolve() is still in flight (e.g.
    // the user selected a different canvas node).
    rerender({ appState: { currentFile: { path: 'a.astro', content: 'two' }, projectPath: null } });

    // Let resolve() finish.
    releaseResolve({});
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));

    // The fix: computeStaleKey() must have been called with the SAME
    // appState snapshot as resolve() (the "one" state captured before the
    // await), not the "two" state that arrived mid-flight.
    expect(capturedForStaleKey.currentFile.content).toBe('one');
    expect(result.current.chips[0].data).toEqual({ value: 'one' });

    // Proof the fix closes the race: the staleness effect only re-evaluates
    // a chip when appState's reference changes (it already ran once, mid-
    // flight, while this chip was still RESOLVING and so was skipped) — so
    // re-render with a fresh "two"-content appState object to trigger it
    // again now that the chip is READY. This must immediately mark the chip
    // STALE, because the staleKey stored on the chip was derived from "one"
    // and no longer matches computeStaleKey(current appState) = "two".
    // Before the fix, staleKey was itself derived from "two" (the same
    // state that arrived mid-flight), so this check would incorrectly stay
    // READY forever — the bug this test guards against.
    rerender({ appState: { currentFile: { path: 'a.astro', content: 'two' }, projectPath: null } });
    expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.STALE);
  });

  it('never auto-stales a chip whose resolver has no computeStaleKey', async () => {
    registerResolver(fakeResolver());
    const { result, rerender } = renderHook(
      ({ appState }) => useTerminalContext(appState),
      { initialProps: { appState: { currentFile: { path: 'a.astro', content: 'one' }, projectPath: null } } },
    );

    act(() => {
      result.current.addChip('fake-a');
    });
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));

    rerender({ appState: { currentFile: { path: 'a.astro', content: 'two' }, projectPath: null } });
    expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY);
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

  it('does not clear the prompt when nothing was there to receive the insert', async () => {
    registerResolver(fakeResolver());
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    act(() => {
      result.current.setPrompt('Fix the spacing.');
    });
    act(() => {
      result.current.addChip('fake-a');
    });
    await waitFor(() => expect(result.current.chips[0].status).toBe(CONTEXT_CHIP_STATUS.READY));

    // Simulate TerminalPanel's handler: no live shell session, so it cancels
    // the event instead of pasting.
    const preventingListener = vi.fn((event) => event.preventDefault());
    window.addEventListener('stacki:terminal-menu', preventingListener);
    act(() => {
      result.current.insertIntoTerminal();
    });
    expect(preventingListener).toHaveBeenCalledTimes(1);
    expect(result.current.prompt).toBe('Fix the spacing.');
    window.removeEventListener('stacki:terminal-menu', preventingListener);
  });

  it('dispatches a cancelable event', async () => {
    registerResolver(fakeResolver());
    const { result } = renderHook(() => useTerminalContext({ currentFile: null, projectPath: null }));

    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    act(() => {
      result.current.insertIntoTerminal();
    });
    expect(listener.mock.calls[0][0].cancelable).toBe(true);
    window.removeEventListener('stacki:terminal-menu', listener);
  });

  it('writes a context-file bundle and inserts a short reference when the content is large', async () => {
    registerResolver(fakeResolver());
    const writeContextBundle = vi.fn(async () => ({ relPath: '.stacki/tmp/context/request-1.md' }));
    const { result } = renderHook(() =>
      useTerminalContext({ currentFile: null, projectPath: null, writeContextBundle }),
    );

    act(() => {
      result.current.setPrompt('x'.repeat(9000));
    });

    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    act(() => {
      result.current.insertIntoTerminal();
    });
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(writeContextBundle).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.text).toBe(
      'Read the Stacki context at:\n\n.stacki/tmp/context/request-1.md\n\nThen complete this request:\n\n' +
        'x'.repeat(9000),
    );
    expect(result.current.prompt).toBe('');
    window.removeEventListener('stacki:terminal-menu', listener);
  });

  it('falls back to inline delivery when writing the context file fails', async () => {
    registerResolver(fakeResolver());
    const writeContextBundle = vi.fn(async () => {
      throw new Error('disk full');
    });
    const { result } = renderHook(() =>
      useTerminalContext({ currentFile: null, projectPath: null, writeContextBundle }),
    );

    act(() => {
      result.current.setPrompt('x'.repeat(9000));
    });

    const listener = vi.fn();
    window.addEventListener('stacki:terminal-menu', listener);
    act(() => {
      result.current.insertIntoTerminal();
    });
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(listener.mock.calls[0][0].detail.text).not.toContain('Read the Stacki context at:');
    expect(listener.mock.calls[0][0].detail.text).toContain('x'.repeat(9000));
    expect(result.current.prompt).toBe('');
    expect(writeContextBundle).toHaveBeenCalledTimes(1);
    window.removeEventListener('stacki:terminal-menu', listener);
  });
});
