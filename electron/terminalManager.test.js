import { describe, expect, it, vi } from 'vitest';
import terminalManagerModule from './terminalManager.js';

const { TerminalManager, resolveShell } = terminalManagerModule;

function fakeChild() {
  let dataHandler = () => {};
  let exitHandler = () => {};
  const dataDispose = vi.fn();
  const exitDispose = vi.fn();
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((handler) => {
      dataHandler = handler;
      return { dispose: dataDispose };
    }),
    onExit: vi.fn((handler) => {
      exitHandler = handler;
      return { dispose: exitDispose };
    }),
    emitData: (data) => dataHandler(data),
    emitExit: (event) => exitHandler(event),
    dataDispose,
    exitDispose,
  };
}

function setup(options = {}) {
  const children = [];
  const events = [];
  const pty = {
    spawn: vi.fn(() => {
      events.push('spawn');
      const child = fakeChild();
      children.push(child);
      return child;
    }),
  };
  const sent = [];
  const timers = [];
  let nextId = 0;
  const ensureToolPath = options.ensureToolPath ?? vi.fn(() => events.push('path'));
  const setTimeoutFn = options.setTimeoutFn ?? vi.fn((callback, delay) => {
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  });
  const clearTimeoutFn = options.clearTimeoutFn ?? vi.fn();
  const manager = new TerminalManager({
    loadPty: () => pty,
    send: (channel, payload) => sent.push({ channel, payload }),
    getProjectRoot: options.getProjectRoot ?? (() => '/projects/site'),
    ensureToolPath,
    env: options.env ?? { SHELL: '/bin/zsh', PATH: '/usr/bin' },
    platform: options.platform ?? 'darwin',
    getUserShell: options.getUserShell ?? (() => '/bin/bash'),
    makeId: () => 'session-' + ++nextId,
    setTimeoutFn,
    clearTimeoutFn,
    killTimeoutMs: options.killTimeoutMs ?? 2000,
  });
  return {
    manager,
    pty,
    children,
    sent,
    events,
    timers,
    ensureToolPath,
    setTimeoutFn,
    clearTimeoutFn,
  };
}

describe('TerminalManager', () => {
  it('starts one login shell in the current project', () => {
    const { manager, pty, events, ensureToolPath } = setup();
    expect(manager.start({ cols: 100, rows: 30 })).toEqual({
      sessionId: 'session-1',
    });
    expect(pty.spawn).toHaveBeenCalledWith('/bin/zsh', ['-l'], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: '/projects/site',
      env: {
        SHELL: '/bin/zsh',
        PATH: '/usr/bin',
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });
    expect(ensureToolPath).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['path', 'spawn']);
    manager.start({ cols: 80, rows: 24 });
    expect(pty.spawn).toHaveBeenCalledTimes(1);
  });

  it('falls back to safe dimensions when startup dimensions are invalid', () => {
    const { manager, pty } = setup();
    manager.start({ cols: 0, rows: 1001 });

    expect(pty.spawn.mock.calls[0][2]).toMatchObject({ cols: 80, rows: 24 });
  });

  it('forwards input, resize, output, and exit', () => {
    const { manager, children, sent } = setup();
    const { sessionId } = manager.start({ cols: 80, rows: 24 });
    expect(manager.write({ sessionId, data: 'pwd\\r' })).toBe(true);
    expect(manager.resize({ sessionId, cols: 120, rows: 40 })).toBe(true);
    expect(children[0].write).toHaveBeenCalledWith('pwd\\r');
    expect(children[0].resize).toHaveBeenCalledWith(120, 40);

    children[0].emitData('hello');
    children[0].emitExit({ exitCode: 0, signal: 0 });
    expect(sent).toEqual([
      {
        channel: 'terminal:data',
        payload: { sessionId: 'session-1', data: 'hello' },
      },
      {
        channel: 'terminal:exit',
        payload: { sessionId: 'session-1', exitCode: 0, signal: 0 },
      },
    ]);
    expect(manager.write({ sessionId, data: 'ignored' })).toBe(false);
  });

  it('rejects stale sessions and invalid dimensions', () => {
    const { manager, children } = setup();
    manager.start({ cols: 80, rows: 24 });
    expect(manager.write({ sessionId: 'old', data: 'no' })).toBe(false);
    expect(manager.resize({ sessionId: 'old', cols: 90, rows: 30 })).toBe(false);
    expect(manager.resize({ sessionId: 'session-1', cols: 0, rows: 30 })).toBe(false);
    expect(children[0].write).not.toHaveBeenCalled();
    expect(children[0].resize).not.toHaveBeenCalled();
  });

  it('restarts after exit and ignores late output', () => {
    const { manager, children, sent } = setup();
    manager.start({ cols: 80, rows: 24 });
    children[0].emitExit({ exitCode: 0, signal: 0 });
    expect(
      manager.restart({ sessionId: 'session-1', cols: 90, rows: 28 })
    ).toEqual({ sessionId: 'session-2' });
    children[0].emitData('late');
    children[1].emitData('fresh');
    expect(sent.some((entry) => entry.payload.data === 'late')).toBe(false);
    expect(sent.some((entry) => entry.payload.data === 'fresh')).toBe(true);
  });

  it('disposes subscriptions and ignores callbacks queued after exit', () => {
    const { manager, children, sent } = setup();
    manager.start({ cols: 80, rows: 24 });

    children[0].emitExit({ exitCode: 0, signal: 0 });
    children[0].emitData('late-before-restart');
    children[0].emitExit({ exitCode: 1, signal: 9 });

    expect(children[0].dataDispose).toHaveBeenCalledTimes(1);
    expect(children[0].exitDispose).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([
      {
        channel: 'terminal:exit',
        payload: { sessionId: 'session-1', exitCode: 0, signal: 0 },
      },
    ]);
  });

  it('retains exit observation while stopping disposed output immediately', () => {
    const { manager, children, sent } = setup();
    manager.start({ cols: 80, rows: 24 });
    expect(manager.dispose({ sessionId: 'old-session' })).toBe(false);
    expect(children[0].kill).not.toHaveBeenCalled();

    expect(manager.dispose({ sessionId: 'session-1' })).toBe(true);
    expect(children[0].kill).toHaveBeenCalledWith('SIGHUP');
    expect(manager.sessionId).toBe(null);
    expect(children[0].dataDispose).toHaveBeenCalledTimes(1);
    expect(children[0].exitDispose).not.toHaveBeenCalled();

    manager.start({ cols: 90, rows: 28 });
    children[0].emitData('disposed-late');
    children[1].emitData('replacement');
    children[0].emitExit({ exitCode: 0, signal: 1 });

    expect(sent).toEqual([
      {
        channel: 'terminal:data',
        payload: { sessionId: 'session-2', data: 'replacement' },
      },
    ]);
    expect(children[0].exitDispose).toHaveBeenCalledTimes(1);
    expect(manager.sessionId).toBe('session-2');
  });

  it('cancels POSIX force-kill escalation when the shell exits', () => {
    const { manager, children, timers, clearTimeoutFn } = setup();
    manager.start({ cols: 80, rows: 24 });
    manager.dispose({ sessionId: 'session-1' });

    expect(timers).toHaveLength(1);
    expect(timers[0].delay).toBe(2000);
    children[0].emitExit({ exitCode: 0, signal: 1 });

    expect(clearTimeoutFn).toHaveBeenCalledWith(timers[0]);
    expect(children[0].exitDispose).toHaveBeenCalledTimes(1);
    timers[0].callback();
    expect(children[0].kill).toHaveBeenCalledTimes(1);
  });

  it('escalates to SIGKILL when a POSIX shell ignores SIGHUP', () => {
    const { manager, children, timers } = setup();
    manager.start({ cols: 80, rows: 24 });
    manager.dispose({ sessionId: 'session-1' });

    timers[0].callback();
    expect(children[0].kill.mock.calls).toEqual([['SIGHUP'], ['SIGKILL']]);
    expect(children[0].exitDispose).not.toHaveBeenCalled();

    children[0].emitExit({ exitCode: 0, signal: 9 });
    expect(children[0].exitDispose).toHaveBeenCalledTimes(1);
  });

  it('force-disposes a POSIX shell with immediate SIGKILL and no timer', () => {
    const { manager, children, setTimeoutFn } = setup();
    manager.start({ cols: 80, rows: 24 });

    manager.dispose({ sessionId: 'session-1', force: true });

    expect(children[0].kill.mock.calls).toEqual([['SIGKILL']]);
    expect(setTimeoutFn).not.toHaveBeenCalled();
    expect(children[0].dataDispose).toHaveBeenCalledTimes(1);
    expect(children[0].exitDispose).not.toHaveBeenCalled();

    children[0].emitExit({ exitCode: 0, signal: 9 });
    expect(children[0].exitDispose).toHaveBeenCalledTimes(1);
  });

  it('force-disposes all pending POSIX shells once and cancels their timers', () => {
    const { manager, children, timers, clearTimeoutFn } = setup();
    manager.start({ cols: 80, rows: 24 });
    manager.dispose({ sessionId: 'session-1' });
    manager.start({ cols: 90, rows: 28 });
    manager.dispose({ sessionId: 'session-2' });

    expect(timers).toHaveLength(2);
    manager.dispose({ force: true });

    expect(children[0].kill.mock.calls).toEqual([['SIGHUP'], ['SIGKILL']]);
    expect(children[1].kill.mock.calls).toEqual([['SIGHUP'], ['SIGKILL']]);
    expect(clearTimeoutFn).toHaveBeenCalledWith(timers[0]);
    expect(clearTimeoutFn).toHaveBeenCalledWith(timers[1]);

    manager.dispose({ force: true });
    timers[0].callback();
    timers[1].callback();
    expect(children[0].kill).toHaveBeenCalledTimes(2);
    expect(children[1].kill).toHaveBeenCalledTimes(2);

    children[0].emitExit({ exitCode: 0, signal: 9 });
    children[1].emitExit({ exitCode: 0, signal: 9 });
    expect(children[0].exitDispose).toHaveBeenCalledTimes(1);
    expect(children[1].exitDispose).toHaveBeenCalledTimes(1);
  });

  it('force-disposes a Windows shell without an unsupported signal', () => {
    const { manager, children, setTimeoutFn } = setup({
      platform: 'win32',
      env: { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' },
    });
    manager.start({ cols: 80, rows: 24 });

    manager.dispose({ sessionId: 'session-1', force: true });

    expect(children[0].kill).toHaveBeenCalledWith();
    expect(setTimeoutFn).not.toHaveBeenCalled();
    expect(children[0].exitDispose).not.toHaveBeenCalled();
  });

  it('kills without a signal on Windows and waits for exit cleanup', () => {
    const { manager, children, setTimeoutFn } = setup({
      platform: 'win32',
      env: { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' },
    });
    manager.start({ cols: 80, rows: 24 });
    manager.dispose({ sessionId: 'session-1' });

    expect(children[0].kill).toHaveBeenCalledWith();
    expect(setTimeoutFn).not.toHaveBeenCalled();
    expect(children[0].exitDispose).not.toHaveBeenCalled();

    children[0].emitExit({ exitCode: 0 });
    expect(children[0].exitDispose).toHaveBeenCalledTimes(1);
  });

  it('uses COMSPEC on Windows and requires an open project', () => {
    const pty = { spawn: vi.fn(() => fakeChild()) };
    const windowsManager = new TerminalManager({
      loadPty: () => pty,
      send: vi.fn(),
      getProjectRoot: () => 'C:\\work\\site',
      ensureToolPath: vi.fn(),
      env: { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' },
      platform: 'win32',
      makeId: () => 'win-session',
    });
    windowsManager.start({ cols: 80, rows: 24 });
    expect(pty.spawn.mock.calls[0][0]).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(pty.spawn.mock.calls[0][1]).toEqual([]);

    const closedManager = new TerminalManager({
      loadPty: () => pty,
      send: vi.fn(),
      getProjectRoot: () => null,
    });
    expect(() => closedManager.start({ cols: 80, rows: 24 })).toThrow(
      'Open a project before starting the terminal.'
    );
  });

  it('falls back from SHELL to the user shell and then /bin/sh', () => {
    expect(resolveShell('linux', {}, () => '/bin/fish')).toBe('/bin/fish');
    expect(resolveShell('linux', {}, () => '')).toBe('/bin/sh');
  });
});
