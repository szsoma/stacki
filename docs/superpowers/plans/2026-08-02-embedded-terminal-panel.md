# Embedded Terminal Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one resizable, persistent, fully interactive terminal to Stacki's left rail, opened with Hungarian-layout Option+T and rooted in the current Astro project.

**Architecture:** Render terminal output with xterm.js in a focused React panel while Electron's main process owns one node-pty shell. Route only typed terminal operations and session-tagged output through the existing context-isolated preload bridge, and keep both the PTY and xterm buffer alive while the panel is hidden.

**Tech Stack:** Electron 33, React 18, Vite 6, xterm.js 6, node-pty 1.1, Vitest 3.2, Testing Library, electron-builder 25

---

**Source spec:** docs/superpowers/specs/2026-08-02-embedded-terminal-panel-design.md

**Starting point:** create a dedicated implementation worktree from the commit containing this plan (immediately after design commit bbd36e5), preserve unrelated user changes, and execute each task from that worktree.

## File Structure

### New files

- electron/terminalManager.js — owns the single PTY session and its lifecycle.
- electron/terminalManager.test.js — tests the PTY lifecycle with a fake node-pty implementation.
- electron/terminalIpc.js — registers and validates the terminal-specific IPC surface.
- electron/terminalIpc.test.js — tests sender validation and IPC routing.
- src/terminal/terminalLogic.js — pure width and shortcut rules.
- src/terminal/terminalLogic.test.js — tests width clamping and Hungarian Option+T.
- src/panels/TerminalPanel.jsx — xterm renderer, resize handle, focus, restart, and clipboard behavior.
- src/panels/TerminalPanel.test.jsx — mocked xterm component tests.
- src/test/setup.js — jsdom cleanup for component tests.
- src/ui/LeftRail.test.jsx — tests the new rail entry and shortcut.

### Modified files

- package.json — dependencies, test scripts, native rebuild, and packaging rules.
- package-lock.json — exact dependency graph.
- vite.config.mjs — Vitest jsdom configuration.
- electron/main.js — instantiate the manager, bind project lifecycle, and clean up.
- electron/preload.js — restricted terminal API and iframe shortcut forwarding.
- src/ui/Icons.jsx — Terminal rail icon.
- src/ui/LeftRail.jsx — Terminal rail item and direct Option+T handling.
- src/App.jsx — persistent mounting, toggling, iframe routing, and shortcut isolation.
- src/styles.css — terminal panel, xterm surface, and drag handle.
- README.md — user-facing terminal documentation.

## Task 1: Add terminal dependencies and the test harness

**Files:**

- Modify: package.json
- Modify: package-lock.json
- Modify: vite.config.mjs
- Create: src/test/setup.js

- [ ] **Step 1: Install runtime and test dependencies**

Run:

~~~bash
rtk npm install @xterm/xterm@6.0.0 @xterm/addon-fit@0.11.0 node-pty@1.1.0
rtk npm install --save-dev vitest@3.2.4 jsdom@26.1.0 @testing-library/react@16.3.0 @testing-library/dom@10.4.1
~~~

Expected: package.json and package-lock.json contain the added packages without upgrading Electron, React, or Vite.

- [ ] **Step 2: Add test and native rebuild scripts**

Update package.json scripts to include:

~~~json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "check:electron": "node --check electron/main.js && node --check electron/preload.js && node --check electron/terminalManager.js && node --check electron/terminalIpc.js",
  "postinstall": "electron-builder install-app-deps"
}
~~~

Retain every existing script unchanged around these additions.

- [ ] **Step 3: Configure native module packaging**

Extend build.asarUnpack and build.mac in package.json:

~~~json
{
  "asarUnpack": [
    "electron/astroParser.js",
    "node_modules/node-pty/**/*"
  ],
  "mac": {
    "mergeASARs": true,
    "singleArchFiles": "node_modules/node-pty/**/*.node"
  }
}
~~~

Merge these keys into the existing objects. Retain the app ID, publish settings, targets, signing, notarization, icons, and entitlements.

- [ ] **Step 4: Configure Vitest**

Update vite.config.mjs:

~~~js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    clearMocks: true,
  },
});
~~~

- [ ] **Step 5: Add shared test cleanup**

Create src/test/setup.js:

~~~js
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
~~~

- [ ] **Step 6: Rebuild native dependencies and verify the harness**

Run:

~~~bash
rtk npm run postinstall
rtk npm test -- --passWithNoTests
rtk npm run build
~~~

Expected: install-app-deps rebuilds node-pty for Electron 33.2.0, Vitest exits 0, and Vite produces dist.

- [ ] **Step 7: Commit**

~~~bash
rtk git add package.json package-lock.json vite.config.mjs src/test/setup.js
rtk git commit -m "build: add embedded terminal dependencies"
~~~

## Task 2: Define terminal width and shortcut rules

**Files:**

- Create: src/terminal/terminalLogic.test.js
- Create: src/terminal/terminalLogic.js

- [ ] **Step 1: Write the failing tests**

Create src/terminal/terminalLogic.test.js:

~~~js
import { describe, expect, it } from 'vitest';
import {
  TERMINAL_DEFAULT_WIDTH,
  TERMINAL_MIN_WIDTH,
  clampTerminalWidth,
  isTerminalShortcut,
} from './terminalLogic.js';

describe('terminal width', () => {
  it('uses a 480px default and 320px minimum', () => {
    expect(TERMINAL_DEFAULT_WIDTH).toBe(480);
    expect(TERMINAL_MIN_WIDTH).toBe(320);
    expect(clampTerminalWidth(100, 1400)).toBe(320);
  });

  it('clamps to 70 percent of the workspace', () => {
    expect(clampTerminalWidth(1200, 1000)).toBe(700);
    expect(clampTerminalWidth(512, 1200)).toBe(512);
  });
});

describe('terminal shortcut', () => {
  it('matches Option plus physical KeyT on a Hungarian layout', () => {
    expect(
      isTerminalShortcut({
        altKey: true,
        code: 'KeyT',
        key: 'í',
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
      })
    ).toBe(true);
  });

  it('rejects modified and character-only lookalikes', () => {
    expect(isTerminalShortcut({ altKey: true, code: 'KeyI', key: 'í' })).toBe(false);
    expect(
      isTerminalShortcut({
        altKey: true,
        code: 'KeyT',
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      })
    ).toBe(false);
    expect(
      isTerminalShortcut({
        altKey: true,
        code: 'KeyT',
        metaKey: false,
        ctrlKey: false,
        shiftKey: true,
      })
    ).toBe(false);
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/terminal/terminalLogic.test.js
~~~

Expected: FAIL because terminalLogic.js does not exist.

- [ ] **Step 3: Implement the rules**

Create src/terminal/terminalLogic.js:

~~~js
export const TERMINAL_DEFAULT_WIDTH = 480;
export const TERMINAL_MIN_WIDTH = 320;
export const TERMINAL_MAX_RATIO = 0.7;

export function clampTerminalWidth(width, workspaceWidth) {
  const safeWorkspace = Math.max(TERMINAL_MIN_WIDTH, Number(workspaceWidth) || 0);
  const max = Math.max(
    TERMINAL_MIN_WIDTH,
    Math.floor(safeWorkspace * TERMINAL_MAX_RATIO)
  );
  return Math.min(max, Math.max(TERMINAL_MIN_WIDTH, Math.round(Number(width) || 0)));
}

export function isTerminalShortcut(event) {
  return (
    !!event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    event.code === 'KeyT'
  );
}
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- src/terminal/terminalLogic.test.js
~~~

Expected: all terminalLogic tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add src/terminal/terminalLogic.js src/terminal/terminalLogic.test.js
rtk git commit -m "feat: define terminal panel interaction rules"
~~~

## Task 3: Build the single-session PTY manager

**Files:**

- Create: electron/terminalManager.test.js
- Create: electron/terminalManager.js

- [ ] **Step 1: Write the failing PTY lifecycle tests**

Create electron/terminalManager.test.js:

~~~js
import { describe, expect, it, vi } from 'vitest';
import terminalManagerModule from './terminalManager.js';

const { TerminalManager } = terminalManagerModule;

function fakeChild() {
  let dataHandler = () => {};
  let exitHandler = () => {};
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((handler) => {
      dataHandler = handler;
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn((handler) => {
      exitHandler = handler;
      return { dispose: vi.fn() };
    }),
    emitData: (data) => dataHandler(data),
    emitExit: (event) => exitHandler(event),
  };
}

function setup() {
  const children = [];
  const pty = {
    spawn: vi.fn(() => {
      const child = fakeChild();
      children.push(child);
      return child;
    }),
  };
  const sent = [];
  let nextId = 0;
  const manager = new TerminalManager({
    loadPty: () => pty,
    send: (channel, payload) => sent.push({ channel, payload }),
    getProjectRoot: () => '/projects/site',
    ensureToolPath: vi.fn(),
    env: { SHELL: '/bin/zsh', PATH: '/usr/bin' },
    platform: 'darwin',
    getUserShell: () => '/bin/bash',
    makeId: () => 'session-' + ++nextId,
  });
  return { manager, pty, children, sent };
}

describe('TerminalManager', () => {
  it('starts one login shell in the current project', () => {
    const { manager, pty } = setup();
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
    manager.start({ cols: 80, rows: 24 });
    expect(pty.spawn).toHaveBeenCalledTimes(1);
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

  it('kills a running shell on disposal', () => {
    const { manager, children } = setup();
    manager.start({ cols: 80, rows: 24 });
    expect(manager.dispose({ sessionId: 'old-session' })).toBe(false);
    expect(children[0].kill).not.toHaveBeenCalled();

    expect(manager.dispose({ sessionId: 'session-1' })).toBe(true);
    expect(children[0].kill).toHaveBeenCalledTimes(1);
    expect(manager.sessionId).toBe(null);
  });

  it('uses COMSPEC on Windows and requires an open project', () => {
    const pty = { spawn: vi.fn(() => fakeChild()) };
    const windowsManager = new TerminalManager({
      loadPty: () => pty,
      send: vi.fn(),
      getProjectRoot: () => 'C:\\\\work\\\\site',
      ensureToolPath: vi.fn(),
      env: { COMSPEC: 'C:\\\\Windows\\\\System32\\\\cmd.exe' },
      platform: 'win32',
      makeId: () => 'win-session',
    });
    windowsManager.start({ cols: 80, rows: 24 });
    expect(pty.spawn.mock.calls[0][0]).toBe('C:\\\\Windows\\\\System32\\\\cmd.exe');
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
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- electron/terminalManager.test.js
~~~

Expected: FAIL because terminalManager.js does not exist.

- [ ] **Step 3: Implement the manager**

Create electron/terminalManager.js:

~~~js
const crypto = require('crypto');
const os = require('os');

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_DIMENSION = 1000;

function validDimension(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION;
}

function safeDimension(value, fallback) {
  return validDimension(value) ? value : fallback;
}

function resolveShell(platform, env, getUserShell) {
  if (platform === 'win32') {
    return env.COMSPEC || env.ComSpec || 'cmd.exe';
  }
  return env.SHELL || getUserShell() || '/bin/sh';
}

class TerminalManager {
  constructor({
    loadPty = () => require('node-pty'),
    send = () => {},
    getProjectRoot = () => null,
    ensureToolPath = () => {},
    env = process.env,
    platform = process.platform,
    getUserShell = () => os.userInfo().shell,
    makeId = () => crypto.randomUUID(),
  } = {}) {
    this.loadPty = loadPty;
    this.send = send;
    this.getProjectRoot = getProjectRoot;
    this.ensureToolPath = ensureToolPath;
    this.env = env;
    this.platform = platform;
    this.getUserShell = getUserShell;
    this.makeId = makeId;
    this.child = null;
    this.sessionId = null;
    this.dataSubscription = null;
    this.exitSubscription = null;
  }

  start({ cols = DEFAULT_COLS, rows = DEFAULT_ROWS } = {}) {
    if (this.child) return { sessionId: this.sessionId };
    const cwd = this.getProjectRoot();
    if (!cwd) throw new Error('Open a project before starting the terminal.');

    this.ensureToolPath();
    const shell = resolveShell(this.platform, this.env, this.getUserShell);
    const args = this.platform === 'win32' ? [] : ['-l'];
    const sessionId = this.makeId();
    const child = this.loadPty().spawn(shell, args, {
      name: 'xterm-256color',
      cols: safeDimension(cols, DEFAULT_COLS),
      rows: safeDimension(rows, DEFAULT_ROWS),
      cwd,
      env: {
        ...this.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    this.child = child;
    this.sessionId = sessionId;
    this.dataSubscription = child.onData((data) => {
      if (this.sessionId === sessionId) {
        this.send('terminal:data', { sessionId, data });
      }
    });
    this.exitSubscription = child.onExit(({ exitCode, signal }) => {
      if (this.sessionId !== sessionId) return;
      this.child = null;
      this.releaseSubscriptions();
      this.send('terminal:exit', { sessionId, exitCode, signal });
    });
    return { sessionId };
  }

  write({ sessionId, data } = {}) {
    if (!this.child || sessionId !== this.sessionId || typeof data !== 'string') {
      return false;
    }
    this.child.write(data);
    return true;
  }

  resize({ sessionId, cols, rows } = {}) {
    if (
      !this.child ||
      sessionId !== this.sessionId ||
      !validDimension(cols) ||
      !validDimension(rows)
    ) {
      return false;
    }
    this.child.resize(cols, rows);
    return true;
  }

  restart({ sessionId, cols = DEFAULT_COLS, rows = DEFAULT_ROWS } = {}) {
    if (sessionId !== this.sessionId || this.child) {
      throw new Error('The terminal can restart only after its shell exits.');
    }
    return this.start({ cols, rows });
  }

  releaseSubscriptions() {
    this.dataSubscription?.dispose();
    this.exitSubscription?.dispose();
    this.dataSubscription = null;
    this.exitSubscription = null;
  }

  dispose({ sessionId } = {}) {
    if (sessionId && sessionId !== this.sessionId) return false;
    const child = this.child;
    this.child = null;
    this.sessionId = null;
    this.releaseSubscriptions();
    if (child) child.kill();
    return true;
  }
}

module.exports = {
  TerminalManager,
  resolveShell,
  validDimension,
};
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- electron/terminalManager.test.js
~~~

Expected: all manager tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add electron/terminalManager.js electron/terminalManager.test.js
rtk git commit -m "feat: manage one project terminal session"
~~~

## Task 4: Add a validated terminal IPC boundary

**Files:**

- Create: electron/terminalIpc.test.js
- Create: electron/terminalIpc.js

- [ ] **Step 1: Write the failing IPC tests**

Create electron/terminalIpc.test.js:

~~~js
import { describe, expect, it, vi } from 'vitest';
import terminalIpcModule from './terminalIpc.js';

const { registerTerminalIpc } = terminalIpcModule;

function setup() {
  const handles = new Map();
  const listeners = new Map();
  const ipcMain = {
    handle: vi.fn((channel, fn) => handles.set(channel, fn)),
    on: vi.fn((channel, fn) => listeners.set(channel, fn)),
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
  registerTerminalIpc({
    ipcMain,
    manager,
    isAllowedSender: (event) => event === allowed,
  });
  return { handles, listeners, manager, allowed, denied };
}

describe('terminal IPC', () => {
  it('registers the narrow terminal channels', () => {
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

  it('routes allowed messages', async () => {
    const { handles, listeners, manager, allowed } = setup();
    await expect(handles.get('terminal:start')(allowed, { cols: 80, rows: 24 }))
      .resolves.toEqual({ sessionId: 'one' });
    listeners.get('terminal:input')(allowed, { sessionId: 'one', data: 'ls\\r' });
    listeners.get('terminal:resize')(allowed, {
      sessionId: 'one',
      cols: 100,
      rows: 30,
    });
    expect(manager.write).toHaveBeenCalledWith({ sessionId: 'one', data: 'ls\\r' });
    expect(manager.resize).toHaveBeenCalledWith({
      sessionId: 'one',
      cols: 100,
      rows: 30,
    });
    await expect(
      handles.get('terminal:dispose')(allowed, { sessionId: 'one' })
    ).resolves.toEqual({ ok: true });
    expect(manager.dispose).toHaveBeenCalledWith({ sessionId: 'one' });
  });

  it('rejects child and unrelated renderers', async () => {
    const { handles, listeners, manager, denied } = setup();
    await expect(handles.get('terminal:start')(denied, {})).rejects.toThrow(
      'Terminal IPC is available only to Stacki.'
    );
    listeners.get('terminal:input')(denied, { sessionId: 'one', data: 'ignored' });
    expect(manager.start).not.toHaveBeenCalled();
    expect(manager.write).not.toHaveBeenCalled();
  });

  it('reports one-way handler errors', () => {
    const { listeners, manager, allowed } = setup();
    manager.resize.mockImplementation(() => {
      throw new Error('resize failed');
    });
    listeners.get('terminal:resize')(allowed, {
      sessionId: 'one',
      cols: 100,
      rows: 30,
    });
    expect(allowed.sender.send).toHaveBeenCalledWith('terminal:error', {
      sessionId: 'one',
      message: 'resize failed',
    });
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- electron/terminalIpc.test.js
~~~

Expected: FAIL because terminalIpc.js does not exist.

- [ ] **Step 3: Implement IPC registration**

Create electron/terminalIpc.js:

~~~js
function registerTerminalIpc({ ipcMain, manager, isAllowedSender }) {
  const assertAllowed = (event) => {
    if (!isAllowedSender(event)) {
      throw new Error('Terminal IPC is available only to Stacki.');
    }
  };
  const reportError = (event, payload, error) => {
    event.sender.send('terminal:error', {
      sessionId: payload?.sessionId || null,
      message: error instanceof Error ? error.message : String(error),
    });
  };

  const start = async (event, payload) => {
    assertAllowed(event);
    return manager.start(payload);
  };
  const restart = async (event, payload) => {
    assertAllowed(event);
    return manager.restart(payload);
  };
  const dispose = async (event, payload) => {
    assertAllowed(event);
    return { ok: manager.dispose(payload) };
  };
  const input = (event, payload) => {
    if (!isAllowedSender(event)) return;
    try {
      manager.write(payload);
    } catch (error) {
      reportError(event, payload, error);
    }
  };
  const resize = (event, payload) => {
    if (!isAllowedSender(event)) return;
    try {
      manager.resize(payload);
    } catch (error) {
      reportError(event, payload, error);
    }
  };

  ipcMain.handle('terminal:start', start);
  ipcMain.handle('terminal:restart', restart);
  ipcMain.handle('terminal:dispose', dispose);
  ipcMain.on('terminal:input', input);
  ipcMain.on('terminal:resize', resize);

  return () => {
    ipcMain.removeHandler('terminal:start');
    ipcMain.removeHandler('terminal:restart');
    ipcMain.removeHandler('terminal:dispose');
    ipcMain.removeListener('terminal:input', input);
    ipcMain.removeListener('terminal:resize', resize);
  };
}

module.exports = { registerTerminalIpc };
~~~

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

~~~bash
rtk npm test -- electron/terminalIpc.test.js
~~~

Expected: all IPC tests pass.

- [ ] **Step 5: Commit**

~~~bash
rtk git add electron/terminalIpc.js electron/terminalIpc.test.js
rtk git commit -m "feat: add secure terminal IPC boundary"
~~~

## Task 5: Wire PTY ownership into Electron and preload

**Files:**

- Modify: electron/main.js:1-180, 478-498, 1112-1125
- Modify: electron/preload.js:20-95, 500-640

- [ ] **Step 1: Instantiate the manager and register IPC**

Add imports in electron/main.js:

~~~js
const { TerminalManager } = require('./terminalManager');
const { registerTerminalIpc } = require('./terminalIpc');
~~~

After send and ensureToolPath are defined, add:

~~~js
const terminalManager = new TerminalManager({
  send,
  getProjectRoot: () => openProjectRoot,
  ensureToolPath,
});

registerTerminalIpc({
  ipcMain,
  manager: terminalManager,
  isAllowedSender: (event) =>
    !!mainWindow &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame,
});
~~~

Do not import node-pty at module load; the manager loads it on first use so a native-load failure can be shown in the terminal panel.

- [ ] **Step 2: Bind the manager to project changes**

Change the start of watch:start:

~~~js
ipcMain.handle('watch:start', async (_e, projectPath) => {
  const nextRoot = path.resolve(projectPath);
  if (openProjectRoot && openProjectRoot !== nextRoot) {
    terminalManager.dispose();
  }
  openProjectRoot = nextRoot;
~~~

Keep the remaining watcher logic unchanged.

- [ ] **Step 3: Dispose on shutdown**

Change the existing hooks:

~~~js
app.on('window-all-closed', () => {
  terminalManager.dispose();
  stopDevServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  terminalManager.dispose();
  stopDevServer();
});
~~~

- [ ] **Step 4: Expose the restricted terminal API**

Add inside the main-frame window.avb object in electron/preload.js:

~~~js
  // Embedded project terminal
  startTerminal: invoke('terminal:start'),
  restartTerminal: invoke('terminal:restart'),
  disposeTerminal: invoke('terminal:dispose'),
  writeTerminal: (payload) => ipcRenderer.send('terminal:input', payload),
  resizeTerminal: (payload) => ipcRenderer.send('terminal:resize', payload),
  onTerminalData: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },
  onTerminalError: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('terminal:error', listener);
    return () => ipcRenderer.removeListener('terminal:error', listener);
  },
~~~

- [ ] **Step 5: Forward Option+T from design iframes**

Before the existing insert shortcut inside the design-frame keydown listener, add:

~~~js
        const terminalShortcut =
          e.altKey &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.shiftKey &&
          e.code === 'KeyT';
        if (terminalShortcut) {
          e.preventDefault();
          try {
            window.parent.postMessage(
              { type: 'avb:shortcut', name: 'terminal' },
              '*'
            );
          } catch {
            /* ignore */
          }
          return;
        }
~~~

- [ ] **Step 6: Verify and commit**

Run:

~~~bash
rtk npm test -- electron/terminalManager.test.js electron/terminalIpc.test.js
rtk npm run check:electron
rtk npm run build
~~~

Expected: backend tests pass, every Electron entry parses, and the renderer build remains green.

Commit:

~~~bash
rtk git add electron/main.js electron/preload.js
rtk git commit -m "feat: connect project terminal to Electron"
~~~

## Task 6: Implement the persistent xterm panel

**Files:**

- Create: src/panels/TerminalPanel.test.jsx
- Create: src/panels/TerminalPanel.jsx
- Modify: src/styles.css:839-930

- [ ] **Step 1: Write failing component tests**

Create src/panels/TerminalPanel.test.jsx:

~~~jsx
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalPanel from './TerminalPanel.jsx';

const terminalMocks = vi.hoisted(() => {
  let inputHandler = () => {};
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
    onData: vi.fn((handler) => {
      inputHandler = handler;
      return { dispose: vi.fn() };
    }),
  };
  const fit = vi.fn();
  return {
    terminal,
    fit,
    Terminal: vi.fn(() => terminal),
    FitAddon: vi.fn(() => ({ fit })),
    emitInput: (data) => inputHandler(data),
  };
});

vi.mock('@xterm/xterm', () => ({ Terminal: terminalMocks.Terminal }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: terminalMocks.FitAddon }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

const terminal = terminalMocks.terminal;
const emitInput = terminalMocks.emitInput;
let dataHandler = () => {};
let exitHandler = () => {};

const emitTerminalData = (payload) => dataHandler(payload);
const emitTerminalExit = (payload) => exitHandler(payload);

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  dataHandler = () => {};
  exitHandler = () => {};
  globalThis.ResizeObserver = ResizeObserverMock;
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 480,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 600,
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
      return vi.fn();
    }),
    onTerminalExit: vi.fn((handler) => {
      exitHandler = handler;
      return vi.fn();
    }),
    onTerminalError: vi.fn(() => vi.fn()),
  };
});

describe('TerminalPanel', () => {
it('does not start while hidden, then starts and focuses when opened', async () => {
  const view = render(<TerminalPanel active={false} />);
  expect(window.avb.startTerminal).not.toHaveBeenCalled();
  view.rerender(<TerminalPanel active />);
  await waitFor(() =>
    expect(window.avb.startTerminal).toHaveBeenCalledWith({
      cols: 100,
      rows: 30,
    })
  );
  expect(terminal.focus).toHaveBeenCalled();
});

it('forwards input and accepts only active-session output', async () => {
  render(<TerminalPanel active />);
  await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());
  emitInput('pwd\\r');
  expect(window.avb.writeTerminal).toHaveBeenCalledWith({
    sessionId: 'session-1',
    data: 'pwd\\r',
  });
  emitTerminalData({ sessionId: 'session-1', data: '/projects/site\\r\\n' });
  emitTerminalData({ sessionId: 'old-session', data: 'stale' });
  expect(terminal.write).toHaveBeenCalledWith('/projects/site\\r\\n');
  expect(terminal.write).not.toHaveBeenCalledWith('stale');
});

it('keeps the PTY and xterm alive while hidden', async () => {
  const view = render(<TerminalPanel active />);
  await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());
  view.rerender(<TerminalPanel active={false} />);
  expect(window.avb.disposeTerminal).not.toHaveBeenCalled();
  expect(terminal.dispose).not.toHaveBeenCalled();
});

it('restarts an exited shell only after Enter', async () => {
  render(<TerminalPanel active />);
  await waitFor(() => expect(window.avb.startTerminal).toHaveBeenCalled());
  emitTerminalExit({ sessionId: 'session-1', exitCode: 0, signal: 0 });
  expect(terminal.writeln).toHaveBeenCalledWith(
    '\\r\\nTerminal exited — press Enter to restart'
  );
  emitInput('\\r');
  await waitFor(() =>
    expect(window.avb.restartTerminal).toHaveBeenCalledWith({
      sessionId: 'session-1',
      cols: 100,
      rows: 30,
    })
  );
});
});
~~~

- [ ] **Step 2: Run the component test and confirm RED**

Run:

~~~bash
rtk npm test -- src/panels/TerminalPanel.test.jsx
~~~

Expected: FAIL because TerminalPanel.jsx does not exist.

- [ ] **Step 3: Implement TerminalPanel**

Create src/panels/TerminalPanel.jsx:

~~~jsx
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  TERMINAL_DEFAULT_WIDTH,
  clampTerminalWidth,
} from '../terminal/terminalLogic.js';

const EXIT_MESSAGE = '\\r\\nTerminal exited — press Enter to restart';
const RETRY_MESSAGE = '\\r\\nPress Enter to retry';

const errorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

export default function TerminalPanel({ active }) {
  const panelRef = useRef(null);
  const hostRef = useRef(null);
  const terminalRef = useRef(null);
  const fitRef = useRef(null);
  const sessionRef = useRef(null);
  const activeRef = useRef(active);
  const exitedRef = useRef(false);
  const retryModeRef = useRef('start');
  const startingRef = useRef(false);
  const disposedRef = useRef(false);
  const pendingEventsRef = useRef([]);
  const terminalCleanupRef = useRef(null);
  const pointerCleanupRef = useRef(null);
  const [width, setWidth] = useState(TERMINAL_DEFAULT_WIDTH);

  activeRef.current = active;

  const handleData = useCallback((payload) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (!sessionRef.current && startingRef.current) {
      pendingEventsRef.current.push({ type: 'data', payload });
      return;
    }
    if (payload.sessionId === sessionRef.current) {
      terminal.write(payload.data);
    }
  }, []);

  const handleExit = useCallback((payload) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    if (!sessionRef.current && startingRef.current) {
      pendingEventsRef.current.push({ type: 'exit', payload });
      return;
    }
    if (payload.sessionId !== sessionRef.current) return;
    exitedRef.current = true;
    retryModeRef.current = 'restart';
    terminal.writeln(EXIT_MESSAGE);
  }, []);

  const flushPending = useCallback((sessionId) => {
    const events = pendingEventsRef.current;
    pendingEventsRef.current = [];
    for (const event of events) {
      if (event.payload.sessionId !== sessionId) continue;
      if (event.type === 'data') {
        terminalRef.current?.write(event.payload.data);
      } else {
        exitedRef.current = true;
        retryModeRef.current = 'restart';
        terminalRef.current?.writeln(EXIT_MESSAGE);
      }
    }
  }, []);

  const fit = useCallback(() => {
    if (!activeRef.current || !terminalRef.current || !fitRef.current) return;
    const host = hostRef.current;
    if (!host || host.clientWidth <= 0 || host.clientHeight <= 0) return;
    fitRef.current.fit();
    const { cols, rows } = terminalRef.current;
    if (
      sessionRef.current &&
      !exitedRef.current &&
      Number.isInteger(cols) &&
      Number.isInteger(rows) &&
      cols > 0 &&
      rows > 0
    ) {
      window.avb.resizeTerminal({
        sessionId: sessionRef.current,
        cols,
        rows,
      });
    }
  }, []);

  const openSession = useCallback(
    async (mode) => {
      const terminal = terminalRef.current;
      if (!terminal || startingRef.current) return;
      startingRef.current = true;
      retryModeRef.current = mode;
      try {
        fitRef.current?.fit();
        const dimensions = {
          cols: terminal.cols,
          rows: terminal.rows,
        };
        const result =
          mode === 'restart'
            ? await window.avb.restartTerminal({
                sessionId: sessionRef.current,
                ...dimensions,
              })
            : await window.avb.startTerminal(dimensions);
        if (disposedRef.current) {
          await window.avb.disposeTerminal({ sessionId: result.sessionId });
          return;
        }
        sessionRef.current = result.sessionId;
        exitedRef.current = false;
        flushPending(result.sessionId);
      } catch (error) {
        if (disposedRef.current) return;
        exitedRef.current = true;
        terminal.writeln('\\r\\nUnable to start terminal: ' + errorMessage(error));
        terminal.writeln(RETRY_MESSAGE);
      } finally {
        startingRef.current = false;
      }
    },
    [flushPending]
  );

  const initialize = useCallback(() => {
    if (terminalRef.current || !hostRef.current) return;
    const terminal = new Terminal({
      cursorBlink: true,
      scrollback: 5000,
      fontSize: 12,
      lineHeight: 1.25,
      fontFamily:
        'SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
      theme: {
        background: '#111111',
        foreground: '#d6d6d6',
        cursor: '#f0f0f0',
        selectionBackground: '#3a3a3a',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(hostRef.current);
    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    const input = terminal.onData((data) => {
      if (exitedRef.current) {
        if (data === '\\r') void openSession(retryModeRef.current);
        return;
      }
      if (sessionRef.current) {
        window.avb.writeTerminal({
          sessionId: sessionRef.current,
          data,
        });
      }
    });
    const offData = window.avb.onTerminalData(handleData);
    const offExit = window.avb.onTerminalExit(handleExit);
    const offError = window.avb.onTerminalError(({ sessionId, message }) => {
      if (sessionId && sessionId !== sessionRef.current) return;
      terminal.writeln('\\r\\nTerminal error: ' + message);
    });
    terminalCleanupRef.current = () => {
      input.dispose();
      offData();
      offExit();
      offError();
    };

    requestAnimationFrame(() => {
      void openSession('start');
      terminal.focus();
    });
  }, [handleData, handleExit, openSession]);

  useEffect(() => {
    if (active) initialize();
  }, [active, initialize]);

  useLayoutEffect(() => {
    if (!active || !terminalRef.current) return;
    requestAnimationFrame(() => {
      fit();
      terminalRef.current?.focus();
    });
  }, [active, width, fit]);

  useEffect(() => {
    const panel = panelRef.current;
    const host = hostRef.current;
    const workspace = panel?.parentElement;
    if (!panel || !host || !workspace) return;
    const observer = new ResizeObserver(() => {
      setWidth((current) =>
        clampTerminalWidth(current, workspace.clientWidth - 44)
      );
      requestAnimationFrame(fit);
    });
    observer.observe(host);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [fit]);

  useEffect(() => {
    const onMenu = async (event) => {
      const terminal = terminalRef.current;
      if (!terminal) return;
      if (event.detail?.action === 'copy') {
        const selection = terminal.getSelection();
        if (selection) await navigator.clipboard.writeText(selection);
      }
      if (
        event.detail?.action === 'paste' &&
        sessionRef.current &&
        !exitedRef.current
      ) {
        const data = await navigator.clipboard.readText();
        if (data) {
          window.avb.writeTerminal({
            sessionId: sessionRef.current,
            data,
          });
        }
      }
    };
    window.addEventListener('stacki:terminal-menu', onMenu);
    return () => window.removeEventListener('stacki:terminal-menu', onMenu);
  }, []);

  useEffect(
    () => () => {
      disposedRef.current = true;
      pointerCleanupRef.current?.();
      terminalCleanupRef.current?.();
      const sessionId = sessionRef.current;
      if (sessionId) void window.avb.disposeTerminal({ sessionId });
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      sessionRef.current = null;
    },
    []
  );

  const beginResize = (event) => {
    event.preventDefault();
    pointerCleanupRef.current?.();
    const panel = panelRef.current;
    const workspace = panel?.parentElement;
    if (!panel || !workspace) return;
    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    const workspaceWidth = workspace.clientWidth - 44;
    const move = (moveEvent) => {
      setWidth(
        clampTerminalWidth(
          startWidth + moveEvent.clientX - startX,
          workspaceWidth
        )
      );
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      pointerCleanupRef.current = null;
    };
    pointerCleanupRef.current = end;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };

  return (
    <section
      ref={panelRef}
      className="panel left terminal-panel"
      style={{ width }}
      hidden={!active}
      aria-label="Terminal"
    >
      <header className="terminal-header">
        <h2>Terminal</h2>
      </header>
      <div className="terminal-surface" ref={hostRef} />
      <div
        className="terminal-resize-handle"
        role="separator"
        aria-label="Resize terminal panel"
        aria-orientation="vertical"
        onPointerDown={beginResize}
      />
    </section>
  );
}
~~~

The component starts only the user's shell through startTerminal. It must not
send an initial command or automatically launch OpenCode, Codex, Claude Code,
or any other CLI.

- [ ] **Step 4: Add terminal styling**

Add after the existing panel rules in src/styles.css:

~~~css
.terminal-panel {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
  background: #111;
}
.terminal-panel[hidden] { display: none; }
.terminal-header {
  height: 52px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}
.terminal-header h2 {
  font-size: 18px;
  line-height: 1;
  font-weight: 650;
  color: var(--text);
}
.terminal-surface {
  flex: 1;
  min-height: 0;
  padding: 12px 10px 10px 14px;
  overflow: hidden;
  background: #111;
}
.terminal-surface .xterm { height: 100%; }
.terminal-surface .xterm-viewport { scrollbar-width: thin; }
.terminal-resize-handle {
  position: absolute;
  z-index: 4;
  top: 0;
  right: -3px;
  bottom: 0;
  width: 7px;
  cursor: col-resize;
}
.terminal-resize-handle:hover,
.terminal-resize-handle:active {
  background: color-mix(in srgb, var(--accent) 45%, transparent);
}
~~~

- [ ] **Step 5: Run tests and commit**

Run:

~~~bash
rtk npm test -- src/panels/TerminalPanel.test.jsx src/terminal/terminalLogic.test.js
~~~

Expected: component and logic tests pass. If jsdom reports zero layout dimensions, set explicit clientWidth and clientHeight values in the test fake; keep the production visibility guard.

Commit:

~~~bash
rtk git add src/panels/TerminalPanel.jsx src/panels/TerminalPanel.test.jsx src/styles.css
rtk git commit -m "feat: render persistent xterm panel"
~~~

## Task 7: Integrate the rail, layout, and keyboard routing

**Files:**

- Modify: src/ui/Icons.jsx
- Modify: src/ui/LeftRail.jsx
- Create: src/ui/LeftRail.test.jsx
- Modify: src/App.jsx:353, 1060-1100, 1217-1340, 2172-2250

- [ ] **Step 1: Write the failing rail test**

Create src/ui/LeftRail.test.jsx:

~~~jsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LeftRail from './LeftRail.jsx';

describe('LeftRail terminal entry', () => {
  it('renders Terminal directly after CMS and selects it', () => {
    const onSelect = vi.fn();
    render(<LeftRail active={null} onSelect={onSelect} />);
    const labels = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(labels.slice(-2)).toEqual(['CMS', 'Terminal']);
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    expect(onSelect).toHaveBeenCalledWith('terminal');
  });

  it('uses physical KeyT for Hungarian Option+T', () => {
    const onSelect = vi.fn();
    render(<LeftRail active={null} onSelect={onSelect} />);
    fireEvent.keyDown(window, { altKey: true, code: 'KeyT', key: 'í' });
    expect(onSelect).toHaveBeenCalledWith('terminal');
  });
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

Run:

~~~bash
rtk npm test -- src/ui/LeftRail.test.jsx
~~~

Expected: FAIL because no Terminal rail item exists.

- [ ] **Step 3: Add the icon and rail item**

Append to src/ui/Icons.jsx:

~~~jsx
export const TerminalIcon = (p) => (
  <I {...p}>
    <path d="m3 4 3.5 4L3 12M8.5 12H13" />
  </I>
);
~~~

Import TerminalIcon and isTerminalShortcut in LeftRail.jsx. Add Terminal after CMS:

~~~jsx
  { id: 'cms', title: 'CMS', shortcut: '⌥C', Icon: CmsIcon },
  { id: 'terminal', title: 'Terminal', shortcut: '⌥T', Icon: TerminalIcon },
~~~

Destructure title in the map and add type="button" and aria-label={title} to every rail button.

- [ ] **Step 4: Reserve Option+T before the typing guard**

At the top of LeftRail's key handler, after rejecting meta/control, add:

~~~js
      if (isTerminalShortcut(e)) {
        e.preventDefault();
        onSelect('terminal');
        return;
      }
~~~

Register in capture mode:

~~~js
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
~~~

Keep Option+C and the plain panel shortcuts behind the existing typing guard.

- [ ] **Step 5: Mount the terminal once per project**

Import TerminalPanel in App.jsx. Add beside leftTab:

~~~js
  const [leftTab, setLeftTab] = useState('navigator');
  const [terminalMounted, setTerminalMounted] = useState(false);

  const selectLeftTab = useCallback((id) => {
    if (id === 'terminal') setTerminalMounted(true);
    setLeftTab((current) => (current === id ? null : id));
  }, []);
~~~

At the start of loadProject, reset the renderer session:

~~~js
      setProject({ path: projectPath, name });
      setTerminalMounted(false);
      setLeftTab('navigator');
~~~

Replace the rail and left-panel opening with:

~~~jsx
        <LeftRail active={leftTab} onSelect={selectLeftTab} />

        {terminalMounted && (
          <TerminalPanel key={project.path} active={leftTab === 'terminal'} />
        )}

        {leftTab && leftTab !== 'terminal' && (
          <div className="panel left">
~~~

Keep all existing non-terminal panel cases inside the normal left panel.
Do not add terminal tabs or toolbar buttons; this version has only the
Terminal header and xterm surface shown in Task 6.

- [ ] **Step 6: Route iframe Option+T through the same toggle**

In App's avb:shortcut message listener:

~~~js
      if (e.data.name === 'terminal') {
        selectLeftTab('terminal');
      } else if (e.data.name === 'insert') {
        openIfEditable();
~~~

Set the effect dependency array to [selectLeftTab].

- [ ] **Step 7: Protect terminal focus from editor shortcuts**

At the beginning of App's document keydown handler, before undo/redo:

~~~js
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest('.terminal-panel')
      ) {
        return;
      }
~~~

Inside the application-menu effect, add:

~~~js
    const inTerminal = () =>
      document.activeElement instanceof HTMLElement &&
      !!document.activeElement.closest('.terminal-panel');

    const terminalMenu = (action) => {
      window.dispatchEvent(
        new CustomEvent('stacki:terminal-menu', { detail: { action } })
      );
    };
~~~

For undo and redo, return without page history when inTerminal() is true. For copy and paste, dispatch terminalMenu('copy') or terminalMenu('paste') and return. Leave existing field and node behavior unchanged outside the terminal.

- [ ] **Step 8: Verify and commit**

Run:

~~~bash
rtk npm test -- src/ui/LeftRail.test.jsx src/terminal/terminalLogic.test.js src/panels/TerminalPanel.test.jsx
rtk npm run build
~~~

Expected: renderer tests pass and Vite bundles xterm without Node built-ins leaking into the renderer.

Commit:

~~~bash
rtk git add src/ui/Icons.jsx src/ui/LeftRail.jsx src/ui/LeftRail.test.jsx src/App.jsx src/panels/TerminalPanel.jsx
rtk git commit -m "feat: add terminal to Stacki left rail"
~~~

## Task 8: Document and verify the complete feature

**Files:**

- Modify: README.md

- [ ] **Step 1: Add user-facing documentation**

Add under Features:

~~~markdown
- **Embedded terminal** — open a real project-root shell inside Stacki from the left rail or with `⌥T`. The 480px panel is resizable, and hiding it keeps the running CLI and scrollback alive.
~~~

Add under Running in development:

~~~markdown
The embedded terminal uses the native `node-pty` module. `npm install` runs
electron-builder's dependency rebuild so the module targets Stacki's Electron
version rather than the system Node.js version.
~~~

- [ ] **Step 2: Run the complete automated gate**

Run:

~~~bash
rtk npm test
rtk npm run check:electron
rtk npm run build
rtk git diff --check
~~~

Expected: all tests pass, Electron files parse, Vite builds dist, and git diff reports no whitespace errors.

- [ ] **Step 3: Run the development smoke test**

Run:

~~~bash
rtk npm run dev
~~~

In Stacki:

1. Open an Astro project.
2. Toggle Terminal from the rail and with Hungarian-layout Option+T.
3. Run pwd and confirm it prints the open project root.
4. Run a command with ANSI colors and verify colors and cursor movement.
5. Resize the terminal panel and window; run stty size and confirm rows and columns change.
6. Start OpenCode and verify its full-screen UI redraws and accepts keyboard input.
7. Hide and reopen Terminal; verify OpenCode and scrollback remain.
8. Exit the shell, verify the exit message, press Enter, and verify a new shell starts.
9. Switch projects; verify the old shell is terminated and the new panel opens at 480px in the new root.

Expected: all checks pass without page-editing shortcuts firing while xterm is focused.

- [ ] **Step 4: Verify the unsigned packaged macOS app**

Stop development, then run:

~~~bash
rtk npm run dist:mac:unsigned
~~~

Expected: electron-builder produces the universal macOS application without node-pty merge, ASAR, or ABI errors.

Launch release/mac-universal/Stacki.app and repeat shell startup, input, resize, OpenCode, hide/reopen, exit/restart, and quit. After quitting, run:

~~~bash
rtk pgrep -fl "node-pty|opencode"
~~~

Expected: no process belonging to the closed Stacki terminal remains. Verify parent processes before ignoring any user-started matches.

- [ ] **Step 5: Inspect Windows packaging**

Run:

~~~bash
rtk npx electron-builder --win --dir
~~~

Expected: the unpacked Windows app contains node-pty's ConPTY native files. If the macOS host cannot create Windows artifacts, record the existing Windows release workflow as the remaining platform gate and do not claim Windows runtime verification.

- [ ] **Step 6: Commit documentation**

~~~bash
rtk git add README.md
rtk git commit -m "docs: describe embedded project terminal"
~~~

- [ ] **Step 7: Confirm final scope and history**

Run:

~~~bash
rtk git status --short --branch
rtk git log --oneline --decorate -8
~~~

Expected: the implementation worktree is clean, the design and plan requirements are covered by focused commits, and no unrelated files are included.
