import { describe, expect, it, vi } from 'vitest';
import terminalIpcModule from './terminalIpc.js';

const { registerTerminalIpc } = terminalIpcModule;

function setup() {
  const handles = new Map();
  const listeners = new Map();
  const ipcMain = {
    handle: vi.fn((channel, handler) => handles.set(channel, handler)),
    on: vi.fn((channel, listener) => listeners.set(channel, listener)),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
  };
  const manager = {
    start: vi.fn(() => ({ sessionId: 'one' })),
    write: vi.fn(() => true),
    resize: vi.fn(() => true),
    restart: vi.fn(() => ({ sessionId: 'two' })),
    dispose: vi.fn(() => true),
  };
  const allowed = { sender: { send: vi.fn() } };
  const denied = { sender: { send: vi.fn() } };
  const unregister = registerTerminalIpc({
    ipcMain,
    manager,
    isAllowedSender: (event) => event === allowed,
  });

  return {
    handles,
    listeners,
    ipcMain,
    manager,
    allowed,
    denied,
    unregister,
  };
}

describe('terminal IPC', () => {
  it('registers only the narrow terminal channels', () => {
    const { handles, listeners } = setup();

    expect([...handles.keys()]).toEqual([
      'terminal:start',
      'terminal:restart',
      'terminal:dispose',
    ]);
    expect([...listeners.keys()]).toEqual([
      'terminal:input',
      'terminal:resize',
    ]);
  });

  it('routes allowed payloads directly to the manager', async () => {
    const { handles, listeners, manager, allowed } = setup();
    const startPayload = { cols: 80, rows: 24 };
    const restartPayload = { sessionId: 'one', cols: 100, rows: 30 };
    const inputPayload = { sessionId: 'one', data: 'ls\r' };
    const resizePayload = { sessionId: 'one', cols: 100, rows: 30 };
    const disposePayload = { sessionId: 'one' };

    await expect(
      handles.get('terminal:start')(allowed, startPayload)
    ).resolves.toEqual({ sessionId: 'one' });
    await expect(
      handles.get('terminal:restart')(allowed, restartPayload)
    ).resolves.toEqual({ sessionId: 'two' });
    listeners.get('terminal:input')(allowed, inputPayload);
    listeners.get('terminal:resize')(allowed, resizePayload);
    await expect(
      handles.get('terminal:dispose')(allowed, disposePayload)
    ).resolves.toEqual({ ok: true });

    expect(manager.start.mock.calls[0][0]).toBe(startPayload);
    expect(manager.restart.mock.calls[0][0]).toBe(restartPayload);
    expect(manager.write.mock.calls[0][0]).toBe(inputPayload);
    expect(manager.resize.mock.calls[0][0]).toBe(resizePayload);
    expect(manager.dispose.mock.calls[0][0]).toBe(disposePayload);
  });

  it('throws for every denied invoke without calling the manager', async () => {
    const { handles, manager, denied } = setup();

    for (const channel of [
      'terminal:start',
      'terminal:restart',
      'terminal:dispose',
    ]) {
      await expect(handles.get(channel)(denied, {})).rejects.toThrow(
        'Terminal IPC is available only to Stacki.'
      );
    }

    expect(manager.start).not.toHaveBeenCalled();
    expect(manager.restart).not.toHaveBeenCalled();
    expect(manager.dispose).not.toHaveBeenCalled();
  });

  it('silently ignores denied one-way messages', () => {
    const { listeners, manager, denied } = setup();

    listeners.get('terminal:input')(denied, {
      sessionId: 'one',
      data: 'ignored',
    });
    listeners.get('terminal:resize')(denied, {
      sessionId: 'one',
      cols: 100,
      rows: 30,
    });

    expect(manager.write).not.toHaveBeenCalled();
    expect(manager.resize).not.toHaveBeenCalled();
    expect(denied.sender.send).not.toHaveBeenCalled();
  });

  it('reports one-way handler errors with a session and safe message', () => {
    const { listeners, manager, allowed } = setup();
    manager.write.mockImplementation(() => {
      throw 'input failed';
    });
    manager.resize.mockImplementation(() => {
      throw new Error('resize failed');
    });

    listeners.get('terminal:input')(allowed, {
      sessionId: 'one',
      data: 'pwd\r',
    });
    listeners.get('terminal:resize')(allowed, { cols: 100, rows: 30 });

    expect(allowed.sender.send).toHaveBeenNthCalledWith(1, 'terminal:error', {
      sessionId: 'one',
      message: 'input failed',
    });
    expect(allowed.sender.send).toHaveBeenNthCalledWith(2, 'terminal:error', {
      sessionId: null,
      message: 'resize failed',
    });
  });

  it('uses a generic safe message for non-string thrown values', () => {
    const { listeners, manager, allowed } = setup();
    manager.resize.mockImplementation(() => {
      throw { secret: 'do not serialize this' };
    });

    listeners.get('terminal:resize')(allowed, {
      sessionId: 'one',
      cols: 100,
      rows: 30,
    });

    expect(allowed.sender.send).toHaveBeenCalledWith('terminal:error', {
      sessionId: 'one',
      message: 'Terminal operation failed.',
    });
  });

  it('unregisters the exact handlers and listeners', () => {
    const { listeners, ipcMain, unregister } = setup();
    const input = listeners.get('terminal:input');
    const resize = listeners.get('terminal:resize');

    unregister();

    expect(ipcMain.removeHandler.mock.calls).toEqual([
      ['terminal:start'],
      ['terminal:restart'],
      ['terminal:dispose'],
    ]);
    expect(ipcMain.removeListener.mock.calls).toEqual([
      ['terminal:input', input],
      ['terminal:resize', resize],
    ]);
  });

  it('does not remove later registrations when stale cleanup runs twice', () => {
    const { ipcMain, unregister } = setup();

    unregister();
    unregister();

    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(3);
    expect(ipcMain.removeListener).toHaveBeenCalledTimes(2);
  });
});
