import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';

const harness = vi.hoisted(() => ({
  menu: new Map(),
  openProject: null,
}));

vi.mock('./panels/WelcomeScreen.jsx', () => ({
  default: ({ onOpen }) => {
    harness.openProject = onOpen;
    return (
      <button type="button" onClick={() => onOpen('/projects/one')}>
        Open project
      </button>
    );
  },
}));

vi.mock('./panels/TerminalPanel.jsx', () => ({
  default: ({ active }) => (
    <section
      className="terminal-panel"
      aria-label="Terminal panel integration"
      hidden={!active}
    >
      <textarea aria-label="Terminal input" />
    </section>
  ),
}));

vi.mock('./panels/PreviewPane.jsx', () => ({
  default: () => (
    <div className="preview-frame-wrap">
      <iframe title="Design preview" />
    </div>
  ),
}));

vi.mock('./panels/GitChip.jsx', () => ({
  default: () => null,
}));

function setupAvb() {
  const subscribe = vi.fn(() => vi.fn());
  window.avb = {
    addRecent: vi.fn(),
    hasNodeModules: vi.fn(async () => true),
    listProjectClasses: vi.fn(async () => []),
    nativeCopy: vi.fn(),
    nativePaste: vi.fn(),
    onDevExit: subscribe,
    onDevLog: subscribe,
    onFsChanged: subscribe,
    onMenu: vi.fn((name, callback) => {
      harness.menu.set(name, callback);
      return vi.fn();
    }),
    onProgress: subscribe,
    scanProject: vi.fn(async () => ({
      pages: [],
      layouts: [],
      components: [],
    })),
    startDevServer: vi.fn(async () => ({
      url: 'http://localhost:4321',
      external: false,
    })),
    watchProject: vi.fn(),
  };
}

async function openProject() {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
  await screen.findByRole('button', { name: 'Terminal' });
  await screen.findByTitle('Dev server: on');
}

function dispatchPreviewShortcut({ source = null, origin = 'http://localhost:4321' } = {}) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'avb:shortcut', name: 'terminal' },
      origin,
      source,
    }),
  );
}

describe('App terminal integration', () => {
  beforeEach(() => {
    harness.menu.clear();
    harness.openProject = null;
    setupAvb();
  });

  it('mounts once, toggles from the rail and iframe, and resets for a project switch', async () => {
    await openProject();
    expect(screen.queryByLabelText('Terminal panel integration')).toBeNull();

    const terminalButton = screen.getByRole('button', { name: 'Terminal' });
    fireEvent.keyDown(window, { altKey: true, code: 'KeyT', key: 'í' });
    const firstPanel = screen.getByLabelText('Terminal panel integration');
    expect(firstPanel.hidden).toBe(false);

    fireEvent.click(terminalButton);
    expect(firstPanel.hidden).toBe(true);

    const designFrame = screen.getByTitle('Design preview');
    act(() => {
      dispatchPreviewShortcut();
    });
    expect(firstPanel.hidden).toBe(true);

    act(() => {
      dispatchPreviewShortcut({
        source: designFrame.contentWindow,
        origin: 'http://localhost:43210',
      });
    });
    expect(firstPanel.hidden).toBe(true);

    const unrelatedFrame = document.createElement('iframe');
    document.body.append(unrelatedFrame);
    act(() => {
      dispatchPreviewShortcut({ source: unrelatedFrame.contentWindow });
    });
    expect(firstPanel.hidden).toBe(true);
    unrelatedFrame.remove();

    act(() => {
      dispatchPreviewShortcut({ source: designFrame.contentWindow });
    });
    expect(screen.getByLabelText('Terminal panel integration')).toBe(firstPanel);
    expect(firstPanel.hidden).toBe(false);

    await act(async () => {
      await harness.openProject('/projects/two');
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Terminal panel integration')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    const secondPanel = screen.getByLabelText('Terminal panel integration');
    expect(secondPanel).not.toBe(firstPanel);
    expect(secondPanel.hidden).toBe(false);
  });

  it('routes native copy and paste to a focused terminal and preserves field behavior outside it', async () => {
    await openProject();
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    screen.getByRole('textbox', { name: 'Terminal input' }).focus();

    const actions = [];
    const onTerminalMenu = (event) => actions.push(event.detail?.action);
    window.addEventListener('stacki:terminal-menu', onTerminalMenu);

    act(() => harness.menu.get('copy')());
    act(() => harness.menu.get('paste')());

    expect(actions).toEqual(['copy', 'paste']);
    expect(window.avb.nativeCopy).not.toHaveBeenCalled();
    expect(window.avb.nativePaste).not.toHaveBeenCalled();

    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    act(() => harness.menu.get('copy')());
    act(() => harness.menu.get('paste')());

    expect(window.avb.nativeCopy).toHaveBeenCalledTimes(1);
    expect(window.avb.nativePaste).toHaveBeenCalledTimes(1);

    field.remove();
    window.removeEventListener('stacki:terminal-menu', onTerminalMenu);
  });
});
