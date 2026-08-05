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
  TERMINAL_MIN_WIDTH,
  clampTerminalWidth,
} from '../terminal/terminalLogic.js';
import ContextChipBar from './ContextChipBar.jsx';

const RAIL_WIDTH = 44;
const KEYBOARD_RESIZE_STEP = 16;
const EXIT_MESSAGE = '\r\nTerminal exited — press Enter to restart';
const RETRY_MESSAGE = '\r\nPress Enter to retry';

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function requestTerminalDisposal(sessionId) {
  try {
    return Promise.resolve(window.avb.disposeTerminal({ sessionId }));
  } catch (error) {
    return Promise.reject(error);
  }
}

export default function TerminalPanel({ active, currentFile, projectPath }) {
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
  const failedSessionRef = useRef(null);
  const failureDisposalRef = useRef(null);
  const pendingEventsRef = useRef([]);
  const terminalCleanupRef = useRef(null);
  const pointerCleanupRef = useRef(null);
  const animationFramesRef = useRef(new Set());
  const [width, setWidth] = useState(TERMINAL_DEFAULT_WIDTH);
  const [maxWidth, setMaxWidth] = useState(TERMINAL_DEFAULT_WIDTH);

  activeRef.current = active;

  const scheduleFrame = useCallback((callback) => {
    const token = { id: null };
    animationFramesRef.current.add(token);
    token.id = requestAnimationFrame(() => {
      animationFramesRef.current.delete(token);
      if (!disposedRef.current) callback();
    });
    return token.id;
  }, []);

  const workspaceWidth = useCallback(() => {
    const workspace = panelRef.current?.parentElement;
    return Math.max(0, (workspace?.clientWidth ?? 0) - RAIL_WIDTH);
  }, []);

  const updateWidthBounds = useCallback(() => {
    const availableWidth = workspaceWidth();
    setMaxWidth(clampTerminalWidth(Number.MAX_SAFE_INTEGER, availableWidth));
    setWidth((current) => clampTerminalWidth(current, availableWidth));
    return availableWidth;
  }, [workspaceWidth]);

  const ensureFailedSessionDisposed = useCallback(() => {
    const failedSessionId = failedSessionRef.current;
    if (!failedSessionId) return Promise.resolve();
    if (failureDisposalRef.current) return failureDisposalRef.current;

    const request = requestTerminalDisposal(failedSessionId);

    let trackedRequest;
    trackedRequest = request.then(
      (result) => {
        if (failureDisposalRef.current === trackedRequest) {
          failureDisposalRef.current = null;
          if (failedSessionRef.current === failedSessionId) {
            failedSessionRef.current = null;
          }
        }
        return result;
      },
      (error) => {
        if (failureDisposalRef.current === trackedRequest) {
          failureDisposalRef.current = null;
        }
        throw error;
      },
    );
    failureDisposalRef.current = trackedRequest;
    return trackedRequest;
  }, []);

  const applyEvent = useCallback((event) => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    if (event.type === 'data') {
      terminal.write(event.payload.data);
      return;
    }

    if (event.type === 'exit') {
      exitedRef.current = true;
      retryModeRef.current = 'restart';
      terminal.writeln(EXIT_MESSAGE);
      return;
    }

    const failedSessionId = sessionRef.current;
    if (!failedSessionId) return;
    sessionRef.current = null;
    failedSessionRef.current = failedSessionId;
    exitedRef.current = true;
    retryModeRef.current = 'start';
    terminal.writeln(
      '\r\nTerminal error: ' + errorMessage(event.payload.message),
    );
    terminal.writeln(RETRY_MESSAGE);
    void ensureFailedSessionDisposed().catch(() => {});
  }, [ensureFailedSessionDisposed]);

  const receiveEvent = useCallback(
    (type, payload) => {
      if (!terminalRef.current) return;

      if (startingRef.current) {
        pendingEventsRef.current.push({ type, payload });
        return;
      }

      const appliesWithoutSession =
        type === 'error' && payload?.sessionId == null;
      if (
        !sessionRef.current ||
        (!appliesWithoutSession && payload?.sessionId !== sessionRef.current)
      ) {
        return;
      }

      applyEvent({ type, payload });
    },
    [applyEvent],
  );

  const flushPending = useCallback(
    (sessionId) => {
      const pending = pendingEventsRef.current;
      pendingEventsRef.current = [];

      for (const event of pending) {
        if (!sessionRef.current) break;
        const appliesWithoutSession =
          event.type === 'error' && event.payload?.sessionId == null;
        if (appliesWithoutSession || event.payload?.sessionId === sessionId) {
          applyEvent(event);
        }
      }
    },
    [applyEvent],
  );

  const fit = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitRef.current;
    const host = hostRef.current;
    if (
      !activeRef.current ||
      !terminal ||
      !fitAddon ||
      !host ||
      host.clientWidth <= 0 ||
      host.clientHeight <= 0
    ) {
      return;
    }

    fitAddon.fit();
    const { cols, rows } = terminal;
    if (
      sessionRef.current &&
      !exitedRef.current &&
      Number.isInteger(cols) &&
      cols > 0 &&
      Number.isInteger(rows) &&
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
      if (!terminal || startingRef.current || disposedRef.current) return;

      startingRef.current = true;
      retryModeRef.current = mode;

      try {
        if (mode === 'start' && failedSessionRef.current) {
          await ensureFailedSessionDisposed();
          if (disposedRef.current) return;
        }

        fitRef.current?.fit();
        const dimensions = { cols: terminal.cols, rows: terminal.rows };
        const result =
          mode === 'restart'
            ? await window.avb.restartTerminal({
                sessionId: sessionRef.current,
                ...dimensions,
              })
            : await window.avb.startTerminal(dimensions);

        if (disposedRef.current) {
          await requestTerminalDisposal(result.sessionId);
          return;
        }

        sessionRef.current = result.sessionId;
        exitedRef.current = false;
        flushPending(result.sessionId);
      } catch (error) {
        pendingEventsRef.current = [];
        if (disposedRef.current) return;

        if (mode === 'restart') {
          const failedSessionId = sessionRef.current;
          sessionRef.current = null;
          retryModeRef.current = 'start';
          if (failedSessionId) {
            failedSessionRef.current = failedSessionId;
            void ensureFailedSessionDisposed().catch(() => {});
          }
        }
        exitedRef.current = true;
        terminal.writeln(
          '\r\nUnable to start terminal: ' + errorMessage(error),
        );
        terminal.writeln(RETRY_MESSAGE);
      } finally {
        startingRef.current = false;
      }
    },
    [ensureFailedSessionDisposed, flushPending],
  );

  const initialize = useCallback(() => {
    if (terminalRef.current || !hostRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      scrollback: 5_000,
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

    const inputSubscription = terminal.onData((data) => {
      if (exitedRef.current) {
        if (data === '\r') void openSession(retryModeRef.current);
        return;
      }

      if (sessionRef.current) {
        window.avb.writeTerminal({
          sessionId: sessionRef.current,
          data,
        });
      }
    });
    const offData = window.avb.onTerminalData((payload) =>
      receiveEvent('data', payload),
    );
    const offExit = window.avb.onTerminalExit((payload) =>
      receiveEvent('exit', payload),
    );
    const offError = window.avb.onTerminalError((payload) =>
      receiveEvent('error', payload),
    );

    terminalCleanupRef.current = () => {
      inputSubscription.dispose();
      offData();
      offExit();
      offError();
    };

    scheduleFrame(() => {
      void openSession('start');
      terminal.focus();
    });
  }, [openSession, receiveEvent, scheduleFrame]);

  useEffect(() => {
    if (active) initialize();
  }, [active, initialize]);

  useLayoutEffect(() => {
    if (!active || !terminalRef.current) return;

    scheduleFrame(() => {
      fit();
      terminalRef.current?.focus();
    });
  }, [active, fit, scheduleFrame, width]);

  useEffect(() => {
    const panel = panelRef.current;
    const host = hostRef.current;
    const workspace = panel?.parentElement;
    if (!panel || !host || !workspace) return undefined;

    const observer = new ResizeObserver(() => {
      updateWidthBounds();
      scheduleFrame(fit);
    });
    observer.observe(host);
    observer.observe(workspace);
    updateWidthBounds();
    return () => observer.disconnect();
  }, [fit, scheduleFrame, updateWidthBounds]);

  useEffect(() => {
    const onMenu = async (event) => {
      const terminal = terminalRef.current;
      if (!terminal) {
        if (event.detail?.action === 'insert') event.preventDefault();
        return;
      }

      try {
        if (event.detail?.action === 'copy') {
          const selection = terminal.getSelection();
          if (selection) await navigator.clipboard.writeText(selection);
          return;
        }

        if (event.detail?.action === 'insert' && typeof event.detail.text === 'string') {
          // No live shell session to paste into (not started yet, or the
          // shell exited) — tell the caller the text was NOT delivered so it
          // knows not to discard what the user typed.
          if (!sessionRef.current || exitedRef.current) {
            event.preventDefault();
            return;
          }
          terminal.paste(event.detail.text);
          return;
        }

        if (
          event.detail?.action === 'paste' &&
          sessionRef.current &&
          !exitedRef.current
        ) {
          const data = await navigator.clipboard.readText();
          if (data) {
            terminal.paste(data);
          }
        }
      } catch (error) {
        terminal.writeln('\r\nTerminal error: ' + errorMessage(error));
      }
    };

    window.addEventListener('stacki:terminal-menu', onMenu);
    return () => window.removeEventListener('stacki:terminal-menu', onMenu);
  }, []);

  useEffect(
    () => () => {
      disposedRef.current = true;
      for (const frame of animationFramesRef.current) {
        if (frame.id != null) cancelAnimationFrame(frame.id);
      }
      animationFramesRef.current.clear();
      pointerCleanupRef.current?.();
      terminalCleanupRef.current?.();
      const sessionId = sessionRef.current;
      if (sessionId) void requestTerminalDisposal(sessionId).catch(() => {});
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitRef.current = null;
      sessionRef.current = null;
      failedSessionRef.current = null;
      pendingEventsRef.current = [];
    },
    [],
  );

  const beginResize = (event) => {
    event.preventDefault();
    pointerCleanupRef.current?.();

    const panel = panelRef.current;
    const workspace = panel?.parentElement;
    if (!panel || !workspace) return;

    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    const availableWidth = workspace.clientWidth - RAIL_WIDTH;
    setMaxWidth(clampTerminalWidth(Number.MAX_SAFE_INTEGER, availableWidth));
    const move = (moveEvent) => {
      setWidth(
        clampTerminalWidth(
          startWidth + moveEvent.clientX - startX,
          availableWidth,
        ),
      );
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      pointerCleanupRef.current = null;
    };

    pointerCleanupRef.current = end;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const resizeWithKeyboard = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    const availableWidth = workspaceWidth();
    setMaxWidth(clampTerminalWidth(Number.MAX_SAFE_INTEGER, availableWidth));
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    setWidth((current) =>
      clampTerminalWidth(
        current + direction * KEYBOARD_RESIZE_STEP,
        availableWidth,
      ),
    );
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
      <ContextChipBar currentFile={currentFile} projectPath={projectPath} />
      <div className="terminal-surface" ref={hostRef} />
      <div
        className="terminal-resize-handle"
        role="separator"
        tabIndex={0}
        aria-label="Resize terminal panel"
        aria-orientation="vertical"
        aria-valuemin={TERMINAL_MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        onPointerDown={beginResize}
        onKeyDown={resizeWithKeyboard}
      />
    </section>
  );
}
