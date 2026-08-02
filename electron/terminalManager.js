const crypto = require('crypto');
const os = require('os');

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_DIMENSION = 1000;
const DEFAULT_KILL_TIMEOUT_MS = 2000;

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
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    killTimeoutMs = DEFAULT_KILL_TIMEOUT_MS,
  } = {}) {
    this.loadPty = loadPty;
    this.send = send;
    this.getProjectRoot = getProjectRoot;
    this.ensureToolPath = ensureToolPath;
    this.env = env;
    this.platform = platform;
    this.getUserShell = getUserShell;
    this.makeId = makeId;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.killTimeoutMs = killTimeoutMs;
    this.child = null;
    this.sessionId = null;
    this.activeSession = null;
    this.terminatingSessions = new Set();
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

    const session = {
      child,
      sessionId,
      state: 'active',
      dataSubscription: null,
      exitSubscription: null,
      killTimer: null,
    };
    this.child = child;
    this.sessionId = sessionId;
    this.activeSession = session;

    session.dataSubscription = child.onData((data) => {
      if (this.activeSession === session && session.state === 'active') {
        this.send('terminal:data', { sessionId, data });
      }
    });
    const exitSubscription = child.onExit(({ exitCode, signal }) => {
      this.finishSession(session, { exitCode, signal });
    });
    if (session.state === 'exited') {
      exitSubscription.dispose();
    } else {
      session.exitSubscription = exitSubscription;
    }
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

  finishSession(session, { exitCode, signal }) {
    if (session.state === 'exited') return;

    const wasActive = this.activeSession === session;
    const shouldNotify = wasActive && session.state === 'active';
    session.state = 'exited';

    if (wasActive) {
      this.activeSession = null;
      this.child = null;
    }
    this.terminatingSessions.delete(session);

    if (session.killTimer) {
      this.clearTimeoutFn(session.killTimer);
      session.killTimer = null;
    }
    session.dataSubscription?.dispose();
    session.exitSubscription?.dispose();
    session.dataSubscription = null;
    session.exitSubscription = null;

    if (shouldNotify) {
      this.send('terminal:exit', { sessionId: session.sessionId, exitCode, signal });
    }
  }

  terminateSession(session, { force = false } = {}) {
    session.state = 'terminating';
    session.dataSubscription?.dispose();
    session.dataSubscription = null;
    this.terminatingSessions.add(session);

    if (this.platform === 'win32') {
      session.child.kill();
      return;
    }

    if (force) {
      session.child.kill('SIGKILL');
      return;
    }

    session.child.kill('SIGHUP');
    if (session.state !== 'terminating') return;

    session.killTimer = this.setTimeoutFn(() => {
      if (session.state !== 'terminating') return;
      session.killTimer = null;
      session.child.kill('SIGKILL');
    }, this.killTimeoutMs);
    session.killTimer?.unref?.();
  }

  dispose({ sessionId, force = false } = {}) {
    if (sessionId && sessionId !== this.sessionId) return false;
    const session = this.activeSession;
    this.activeSession = null;
    this.child = null;
    this.sessionId = null;
    if (session) this.terminateSession(session, { force });
    return true;
  }
}

module.exports = {
  TerminalManager,
  resolveShell,
  validDimension,
};
