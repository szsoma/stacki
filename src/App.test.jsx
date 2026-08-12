// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const harness = vi.hoisted(() => ({
  menu: new Map(),
  openProject: null,
  terminalPanelProps: null,
}));

// jsdom has no ResizeObserver. Only exercised once a page is actually open
// (StylePanel, mounted behind the right-hand "Style" tab, observes its own
// width) — the currentFileContext tests below are the first in this file to
// get that far.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
// jsdom doesn't implement scrollIntoView either — StructurePanel calls it to
// reveal the selected row.
Element.prototype.scrollIntoView ??= () => {};

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
  default: (props) => {
    const { active } = props;
    // Captured so tests can assert what App.jsx computes for `currentFile`
    // (the "Current file" context chip's source) without re-implementing a
    // real terminal.
    harness.terminalPanelProps = props;
    return (
      <section
        className="terminal-panel"
        aria-label="Terminal panel integration"
        hidden={!active}
      >
        {/* Stands in for ContextChipBar's prompt textarea: a real field that
            lives inside .terminal-panel but is NOT the terminal itself. */}
        <textarea placeholder="Ask Codex to…" />
        <div className="terminal-surface">
          <textarea aria-label="Terminal input" />
        </div>
      </section>
    );
  },
}));

vi.mock('./panels/PreviewPane.tsx', () => ({
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
    listStyleFiles: vi.fn(async () => ({ files: [] })),
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
    readPage: vi.fn(async () => ({ editable: false, reason: 'not used in this test', source: '' })),
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
    harness.terminalPanelProps = null;
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

  // ContextChipBar's prompt textarea lives inside .terminal-panel (Task 14
  // mounts it between the header and .terminal-surface), but it is not the
  // terminal itself — copying/pasting there must behave like any other text
  // field, not get redirected into the live shell.
  it('does not route native copy and paste from the context prompt into the terminal', async () => {
    await openProject();
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    screen.getByPlaceholderText('Ask Codex to…').focus();

    const actions = [];
    const onTerminalMenu = (event) => actions.push(event.detail?.action);
    window.addEventListener('stacki:terminal-menu', onTerminalMenu);

    act(() => harness.menu.get('copy')());
    act(() => harness.menu.get('paste')());

    expect(actions).toEqual([]);
    expect(window.avb.nativeCopy).toHaveBeenCalledTimes(1);
    expect(window.avb.nativePaste).toHaveBeenCalledTimes(1);

    window.removeEventListener('stacki:terminal-menu', onTerminalMenu);
  });
});

// Task 15 added `currentFileContext` (what the "Current file" context chip
// attaches, fed to TerminalPanel as the `currentFile` prop) but nothing
// asserted its shape for any of the floating code editor's variants — which
// is how the path/kind bugs fixed here survived per-task review. These drive
// the app through the same UI a user would use (select frontmatter or an
// asset file, open its code editor) and inspect what TerminalPanel actually
// received.
describe('App currentFileContext (Current file chip)', () => {
  beforeEach(() => {
    harness.menu.clear();
    harness.openProject = null;
    harness.terminalPanelProps = null;
    setupAvb();
  });

  function setupPageAvb({ pagePath, model }) {
    window.avb.scanProject = vi.fn(async () => ({
      pages: [{ path: pagePath, name: 'index.astro', route: '/' }],
      layouts: [],
      components: [],
    }));
    window.avb.readPage = vi.fn(async () => ({ editable: true, model, source: '' }));
  }

  it('attaches a project-relative fragment for the frontmatter editor', async () => {
    setupPageAvb({
      pagePath: '/projects/one/src/pages/index.astro',
      model: { imports: [], nodes: [], extraFrontmatter: 'const title = "Hi";' },
    });
    await openProject();
    // Mounts TerminalPanel (it only mounts on first open), then switches
    // back to the navigator — TerminalPanel stays mounted (just hidden)
    // once mounted once, so `harness.terminalPanelProps` keeps updating.
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Navigator' }));

    fireEvent.click(screen.getByText('Frontmatter'));
    // PropsPanel (which has the "Edit code" button for the selected
    // frontmatter node) is only exposed to the accessibility tree once the
    // right rail's Settings tab is active.
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit code' }));

    await waitFor(() => {
      expect(harness.terminalPanelProps.currentFile).toMatchObject({
        path: 'src/pages/index.astro',
        title: 'Frontmatter',
        language: 'javascript',
        kind: 'fragment',
      });
    });
    // Project-relative, not the absolute filesystem path `currentPage.path`
    // actually holds — an absolute path would leak the user's home
    // directory into whatever gets pasted into the terminal.
    expect(harness.terminalPanelProps.currentFile.path.startsWith('/')).toBe(false);
    expect(harness.terminalPanelProps.currentFile.content).toContain('const title');
  });

  it('attaches a project-relative fragment for a raw <style> node', async () => {
    setupPageAvb({
      pagePath: '/projects/one/src/pages/index.astro',
      model: {
        imports: [],
        nodes: [{ id: 'raw1', kind: 'raw', name: 'style', inner: 'body { color: red; }' }],
        extraFrontmatter: '',
      },
    });
    await openProject();
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Navigator' }));

    fireEvent.click(document.querySelector('[data-node-id="raw1"]'));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit code' }));

    await waitFor(() => {
      expect(harness.terminalPanelProps.currentFile).toMatchObject({
        path: 'src/pages/index.astro',
        title: '<style>',
        language: 'css',
        kind: 'fragment',
        content: 'body { color: red; }',
      });
    });
  });

  it('attaches a public/-prefixed whole file for an open asset file', async () => {
    setupPageAvb({
      pagePath: '/projects/one/src/pages/index.astro',
      model: { imports: [], nodes: [], extraFrontmatter: '' },
    });
    window.avb.listAssets = vi.fn(async () => ({
      entries: [
        {
          rel: 'styles/site.css',
          name: 'site.css',
          parent: '',
          isDir: false,
          size: 10,
          abs: '/projects/one/public/styles/site.css',
        },
      ],
      missing: false,
    }));
    window.avb.onAssetsChanged = vi.fn(() => vi.fn());
    window.avb.readAssetText = vi.fn(async () => ({ text: 'body { color: red; }' }));

    await openProject();
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assets' }));

    const tile = await screen.findByTitle('/styles/site.css — click to edit');
    fireEvent.click(tile.querySelector('.asset-thumb'));

    await waitFor(() => {
      expect(harness.terminalPanelProps.currentFile).toMatchObject({
        // `codeWin.rel` is relative to public/, not the project root — the
        // bug this covers reported this file as `styles/site.css`, which
        // could resolve to an unrelated file elsewhere in the project.
        path: 'public/styles/site.css',
        title: 'site.css',
        language: 'css',
        kind: 'file',
      });
    });
    expect(harness.terminalPanelProps.currentFile.content).toBe('body { color: red; }');
  });
});
