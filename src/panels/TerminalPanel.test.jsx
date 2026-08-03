import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TerminalPanel from './TerminalPanel.jsx';

const terminalMocks = vi.hoisted(() => {
  let inputHandler = () => {};
  const inputDispose = vi.fn();
  const terminal = {
    cols: 100,
    rows: 30,
    open: vi.fn(),
    loadAddon: vi.fn(),
    focus: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
    dispose: vi.fn(),
    getSelection: vi.fn(() => ''),
    paste: vi.fn((data) => inputHandler(`\x1b[200~${data}\x1b[201~`)),
    onData: vi.fn((handler) => {
      inputHandler = handler;
      return { dispose: inputDispose };
    }),
  };
  const fit = vi.fn();

  return {
    terminal,
    fit,
    inputDispose,
    Terminal: vi.fn(() => terminal),
    FitAddon: vi.fn(() => ({ fit })),
    emitInput: (data) => inputHandler(data),
    resetInput: () => {
      inputHandler = () => {};
    },
  };
});

vi.mock('@xterm/xterm', () => ({ Terminal: terminalMocks.Terminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: terminalMocks.FitAddon }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

const terminal = terminalMocks.terminal;
const emitInput = terminalMocks.emitInput;

let dataHandler;
let exitHandler;
let errorHandler;
let resizeObserverCallback;
let workspaceWidth;
let panelWidth;
let offData;
let offExit;
let offError;

const emitTerminalData = (payload) => act(() => dataHandler(payload));
const emitTerminalExit = (payload) => act(() => exitHandler(payload));
const emitTerminalError = (payload) => act(() => errorHandler(payload));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

class ResizeObserverMock {
  constructor(callback) {
    resizeObserverCallback = callback;
  }

  observe() {}

  disconnect() {}
}

beforeEach(() => {
  terminalMocks.resetInput();
  dataHandler = () => {};
  exitHandler = () => {};
  errorHandler = () => {};
  resizeObserverCallback = () => {};
  workspaceWidth = 1_044;
  panelWidth = 480;
  offData = vi.fn();
  offExit = vi.fn();
  offError = vi.fn();

  globalThis.ResizeObserver = ResizeObserverMock;
  globalThis.PointerEvent = MouseEvent;
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  globalThis.cancelAnimationFrame = vi.fn();

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return this.classList?.contains('terminal-surface') ? panelWidth : workspaceWidth;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 600,
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: panelWidth,
      height: 600,
      top: 0,
      right: panelWidth,
      bottom: 600,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async () => {}),
      readText: vi.fn(async () => 'pasted'),
    },
  });

  window.avb = {
    startTerminal: vi.fn(async () => ({ sessionId: 'session-1' })),
    restartTerminal: vi.fn(async () => ({ sessionId: 'session-2' })),
    disposeTerminal: vi.fn(async () => ({ ok: true })),
    writeTerminal: vi.fn(),
    resizeTerminal: vi.fn(),
    onTerminalData: vi.fn((handler) => {
      dataHandler = handler;
      return offData;
    }),
    onTerminalExit: vi.fn((handler) => {
      exitHandler = handler;
      return offExit;
    }),
    onTerminalError: vi.fn((handler) => {
      errorHandler = handler;
      return offError;
    }),
  };
});

describe('TerminalPanel lifecycle', () => {
  it('does not initialize while hidden, then starts one shell and focuses when opened', async () => {
    const view = render(<TerminalPanel active={false} />);

    expect(window.avb.startTerminal).not.toHaveBeenCalled();
    expect(terminalMocks.Terminal).not.toHaveBeenCalled();

    view.rerender(<TerminalPanel active />);

    await waitFor(() =>
      expect(window.avb.startTerminal).toHaveBeenCalledWith({
        cols: 100,
        rows: 30,
      }),
    );
    expect(terminal.open).toHaveBeenCalled();
    expect(terminal.focus).toHaveBeenCalled();

    view.rerender(<TerminalPanel active={false} />);
    view.rerender(<TerminalPanel active />);
    expect(window.avb.startTerminal).toHaveBeenCalledTimes(1);
  });

  it('forwards input and accepts output only from the active session', async () => {
    render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

    emitInput('pwd\r');
    expect(window.avb.writeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
      data: 'pwd\r',
    });

    emitTerminalData({ sessionId: 'session-1', data: '/projects/site\r\n' });
    emitTerminalData({ sessionId: 'old-session', data: 'stale' });
    emitTerminalError({ sessionId: 'old-session', message: 'stale error' });

    expect(terminal.write).toHaveBeenCalledWith('/projects/site\r\n');
    expect(terminal.write).not.toHaveBeenCalledWith('stale');
    expect(terminal.writeln).not.toHaveBeenCalledWith(
      '\r\nTerminal error: stale error',
    );
  });

  it('buffers PTY data and exit events that race the initial start response', async () => {
    const start = deferred();
    window.avb.startTerminal.mockReturnValue(start.promise);
    render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

    emitTerminalData({ sessionId: 'session-1', data: 'early output' });
    emitTerminalExit({ sessionId: 'session-1', exitCode: 0, signal: 0 });
    expect(terminal.write).not.toHaveBeenCalledWith('early output');

    await act(async () => start.resolve({ sessionId: 'session-1' }));

    expect(terminal.write).toHaveBeenCalledWith('early output');
    expect(terminal.writeln).toHaveBeenCalledWith(
      '\r\nTerminal exited — press Enter to restart',
    );
  });

  it('turns an active-session error into a failed state and blocks live operations', async () => {
    render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());
    window.avb.writeTerminal.mockClear();
    window.avb.resizeTerminal.mockClear();

    emitTerminalError({ sessionId: 'session-1', message: 'transport failed' });

    expect(terminal.writeln).toHaveBeenCalledWith(
      '\r\nTerminal error: transport failed',
    );
    expect(terminal.writeln).toHaveBeenCalledWith('\r\nPress Enter to retry');
    expect(window.avb.disposeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
    });

    emitInput('pwd\r');
    act(() => resizeObserverCallback());
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('stacki:terminal-menu', {
          detail: { action: 'paste' },
        }),
      );
    });

    expect(window.avb.writeTerminal).not.toHaveBeenCalled();
    expect(window.avb.resizeTerminal).not.toHaveBeenCalled();
    expect(navigator.clipboard.readText).not.toHaveBeenCalled();
  });

  it('treats a sessionless terminal error as a failure of the active session', async () => {
    render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

    emitTerminalError({ sessionId: null, message: 'resize failed' });

    expect(window.avb.disposeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
    });
    expect(terminal.writeln).toHaveBeenCalledWith(
      '\r\nTerminal error: resize failed',
    );
  });

  it('disposes an error-racing initial session and retries it with a fresh start', async () => {
    const start = deferred();
    window.avb.startTerminal
      .mockReturnValueOnce(start.promise)
      .mockResolvedValueOnce({ sessionId: 'session-2' });
    render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalledOnce());

    emitTerminalError({ sessionId: 'session-1', message: 'early failure' });
    await act(async () => start.resolve({ sessionId: 'session-1' }));

    expect(window.avb.disposeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
    });
    emitInput('\r');

    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalledTimes(2));
    expect(window.avb.restartTerminal).not.toHaveBeenCalled();
    emitInput('ls\r');
    expect(window.avb.writeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-2',
      data: 'ls\r',
    });
  });

  it('keeps the PTY, xterm instance, and scrollback alive while hidden', async () => {
    const view = render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());
    emitTerminalData({ sessionId: 'session-1', data: 'kept output' });

    view.rerender(<TerminalPanel active={false} />);

    expect(window.avb.disposeTerminal).not.toHaveBeenCalled();
    expect(terminal.dispose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Terminal').hidden).toBe(true);

    view.rerender(<TerminalPanel active />);
    expect(window.avb.startTerminal).toHaveBeenCalledTimes(1);
    expect(terminalMocks.Terminal).toHaveBeenCalledTimes(1);
    expect(terminal.write).toHaveBeenCalledWith('kept output');
  });

  it('fully cleans up the renderer subscriptions and PTY only on unmount', async () => {
    const view = render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

    view.unmount();

    expect(window.avb.disposeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
    });
    expect(terminalMocks.inputDispose).toHaveBeenCalled();
    expect(offData).toHaveBeenCalled();
    expect(offExit).toHaveBeenCalled();
    expect(offError).toHaveBeenCalled();
    expect(terminal.dispose).toHaveBeenCalled();
  });

  it('disposes a session whose start resolves after unmount', async () => {
    const start = deferred();
    window.avb.startTerminal.mockReturnValue(start.promise);
    const view = render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

    view.unmount();
    await act(async () => start.resolve({ sessionId: 'late-session' }));

    expect(window.avb.disposeTerminal).toHaveBeenCalledWith({
      sessionId: 'late-session',
    });
  });

  it('swallows asynchronous PTY-disposal rejection during unmount', async () => {
    const view = render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());
    window.avb.disposeTerminal.mockRejectedValueOnce(new Error('dispose failed'));

    view.unmount();
    await act(async () => Promise.resolve());

    expect(window.avb.disposeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
    });
  });

  it('swallows synchronous PTY-disposal errors during unmount', async () => {
    const view = render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());
    window.avb.disposeTerminal.mockImplementationOnce(() => {
      throw new Error('dispose threw');
    });

    expect(() => view.unmount()).not.toThrow();
    expect(window.avb.disposeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
    });
  });

  it('cancels pending animation frames on unmount', () => {
    const frames = [];
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const view = render(<TerminalPanel active />);
    expect(window.avb.startTerminal).not.toHaveBeenCalled();

    view.unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    act(() => frames[0]());
    expect(window.avb.startTerminal).not.toHaveBeenCalled();
    expect(terminal.focus).not.toHaveBeenCalled();
  });
});

describe('TerminalPanel exit and retry behavior', () => {
  it('waits for failed-session disposal and coalesces Enter before a fresh start', async () => {
    const disposal = deferred();
    window.avb.startTerminal
      .mockResolvedValueOnce({ sessionId: 'session-1' })
      .mockResolvedValueOnce({ sessionId: 'session-2' });
    window.avb.disposeTerminal.mockReturnValue(disposal.promise);
    render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalledOnce());

    emitTerminalError({ sessionId: 'session-1', message: 'transport failed' });
    emitInput('\r');
    emitInput('\r');

    expect(window.avb.disposeTerminal).toHaveBeenCalledTimes(1);
    expect(window.avb.disposeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
    });
    expect(window.avb.startTerminal).toHaveBeenCalledTimes(1);
    expect(window.avb.restartTerminal).not.toHaveBeenCalled();

    await act(async () => disposal.resolve({ ok: true }));

    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalledTimes(2));
    expect(window.avb.startTerminal).toHaveBeenLastCalledWith({
      cols: 100,
      rows: 30,
    });
    expect(window.avb.restartTerminal).not.toHaveBeenCalled();
  });

  it('does not start a replacement if unmounted while failed-session disposal is pending', async () => {
    const disposal = deferred();
    window.avb.disposeTerminal.mockReturnValue(disposal.promise);
    const view = render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalledOnce());

    emitTerminalError({ sessionId: 'session-1', message: 'transport failed' });
    emitInput('\r');
    view.unmount();
    await act(async () => disposal.resolve({ ok: true }));

    expect(window.avb.disposeTerminal).toHaveBeenCalledTimes(1);
    expect(window.avb.startTerminal).toHaveBeenCalledTimes(1);
    expect(terminal.dispose).toHaveBeenCalled();
  });

  it('shows the explicit exit message and restarts only after Enter', async () => {
    render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

    emitTerminalExit({ sessionId: 'session-1', exitCode: 0, signal: 0 });
    expect(terminal.writeln).toHaveBeenCalledWith(
      '\r\nTerminal exited — press Enter to restart',
    );

    emitInput('x');
    expect(window.avb.restartTerminal).not.toHaveBeenCalled();
    emitInput('\r');

    await waitFor(() =>
      expect(window.avb.restartTerminal).toHaveBeenCalledWith({
        sessionId: 'session-1',
        cols: 100,
        rows: 30,
      }),
    );
    emitInput('ls\r');
    expect(window.avb.writeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-2',
      data: 'ls\r',
    });
  });

  it('retires a rejected restart and waits before one fresh start', async () => {
    const disposal = deferred();
    window.avb.startTerminal
      .mockResolvedValueOnce({ sessionId: 'session-1' })
      .mockResolvedValueOnce({ sessionId: 'session-2' });
    window.avb.restartTerminal.mockRejectedValueOnce(
      new Error('restart rejected'),
    );
    window.avb.disposeTerminal.mockReturnValue(disposal.promise);
    render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalledOnce());

    emitTerminalExit({ sessionId: 'session-1', exitCode: 1, signal: 0 });
    emitInput('\r');
    await waitFor(() =>
      expect(terminal.writeln).toHaveBeenCalledWith(
        '\r\nUnable to start terminal: restart rejected',
      ),
    );

    expect(window.avb.restartTerminal).toHaveBeenCalledTimes(1);
    expect(window.avb.disposeTerminal).toHaveBeenCalledTimes(1);
    expect(window.avb.disposeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
    });

    emitInput('\r');
    emitInput('\r');
    expect(window.avb.startTerminal).toHaveBeenCalledTimes(1);
    await act(async () => disposal.resolve({ ok: true }));

    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalledTimes(2));
    expect(window.avb.startTerminal).toHaveBeenLastCalledWith({
      cols: 100,
      rows: 30,
    });
    expect(window.avb.restartTerminal).toHaveBeenCalledTimes(1);
  });

  it('ignores stale exit events', async () => {
    render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

    emitTerminalExit({ sessionId: 'old-session', exitCode: 1, signal: 0 });
    emitInput('echo alive\r');

    expect(terminal.writeln).not.toHaveBeenCalledWith(
      '\r\nTerminal exited — press Enter to restart',
    );
    expect(window.avb.writeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
      data: 'echo alive\r',
    });
  });

  it('shows start errors and retries the initial start only after Enter', async () => {
    window.avb.startTerminal
      .mockRejectedValueOnce(new Error('No project root'))
      .mockResolvedValueOnce({ sessionId: 'session-1' });
    render(<TerminalPanel active />);

    await waitFor(() =>
      expect(terminal.writeln).toHaveBeenCalledWith(
        '\r\nUnable to start terminal: No project root',
      ),
    );
    expect(terminal.writeln).toHaveBeenCalledWith('\r\nPress Enter to retry');

    emitInput('x');
    expect(window.avb.startTerminal).toHaveBeenCalledTimes(1);
    emitInput('\r');

    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalledTimes(2));
    expect(window.avb.restartTerminal).not.toHaveBeenCalled();
  });
});

describe('TerminalPanel sizing and terminal menu', () => {
  it('starts at 480px, fits on open, and clamps pointer resizing to 320px/70%', async () => {
    render(<TerminalPanel active />);
    const panel = screen.getByLabelText('Terminal');
    const handle = screen.getByRole('separator', {
      name: 'Resize terminal panel',
    });

    expect(panel.style.width).toBe('480px');
    await waitFor(() => expect(terminalMocks.fit).toHaveBeenCalled());

    fireEvent.pointerDown(handle, { clientX: 480 });
    fireEvent.pointerMove(window, { clientX: 1_000 });
    expect(panel.style.width).toBe('700px');

    panelWidth = 700;
    fireEvent.pointerUp(window);
    fireEvent.pointerDown(handle, { clientX: 700 });
    fireEvent.pointerMove(window, { clientX: 0 });
    expect(panel.style.width).toBe('320px');
    fireEvent.pointerUp(window);
  });

  it('refits and reports valid PTY dimensions when its host resizes', async () => {
    render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());
    window.avb.resizeTerminal.mockClear();

    act(() => resizeObserverCallback());

    expect(terminalMocks.fit).toHaveBeenCalled();
    expect(window.avb.resizeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
      cols: 100,
      rows: 30,
    });
  });

  it('exposes accurate separator values and resizes with the arrow keys', async () => {
    render(<TerminalPanel active />);
    const panel = screen.getByLabelText('Terminal');
    const handle = screen.getByRole('separator', {
      name: 'Resize terminal panel',
    });
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

    expect(handle.tabIndex).toBe(0);
    expect(handle.getAttribute('aria-valuemin')).toBe('320');
    expect(handle.getAttribute('aria-valuemax')).toBe('700');
    expect(handle.getAttribute('aria-valuenow')).toBe('480');

    const expand = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(handle, expand);
    expect(expand.defaultPrevented).toBe(true);
    expect(panel.style.width).toBe('496px');
    expect(handle.getAttribute('aria-valuenow')).toBe('496');

    const shrink = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(handle, shrink);
    expect(shrink.defaultPrevented).toBe(true);
    expect(panel.style.width).toBe('480px');

    workspaceWidth = 844;
    act(() => resizeObserverCallback());
    expect(handle.getAttribute('aria-valuemax')).toBe('560');
  });

  it('routes terminal-menu paste through xterm without launching a CLI command', async () => {
    terminal.getSelection.mockReturnValue('selected text');
    render(<TerminalPanel active />);
    await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('stacki:terminal-menu', {
          detail: { action: 'copy' },
        }),
      );
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('selected text');

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('stacki:terminal-menu', {
          detail: { action: 'paste' },
        }),
      );
    });
    expect(terminal.paste).toHaveBeenCalledWith('pasted');
    expect(window.avb.writeTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
      data: '\x1b[200~pasted\x1b[201~',
    });
    expect(window.avb.startTerminal).toHaveBeenCalledWith({
      cols: 100,
      rows: 30,
    });
    expect(window.avb.startTerminal).toHaveBeenCalledTimes(1);
  });
});
