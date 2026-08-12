// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const harness = vi.hoisted(() => ({ menu: new Map() }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= () => {};

vi.mock('./panels/WelcomeScreen.jsx', () => ({
  default: ({ onOpen }) => (
    <button type="button" onClick={() => onOpen('/projects/one')}>
      Open project
    </button>
  ),
}));
vi.mock('./panels/TerminalPanel.jsx', () => ({ default: () => null }));
vi.mock('./panels/PreviewPane.tsx', () => ({
  default: () => <div className="preview-frame-wrap" />,
}));
vi.mock('./panels/GitChip.jsx', () => ({ default: () => null }));

function makeModel() {
  return {
    imports: [],
    extraFrontmatter: '',
    nodes: [
      {
        id: 'n1',
        kind: 'element',
        name: 'section',
        props: { id: { type: 'string', value: 'hero' } },
        children: [],
      },
    ],
  };
}

let writePage;

function setupAvb() {
  const subscribe = vi.fn(() => vi.fn());
  writePage = vi.fn(async () => ({ ok: true }));
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
      pages: [{ name: 'index', path: '/projects/one/src/pages/index.astro', route: '/' }],
      layouts: [],
      components: [],
    })),
    readPage: vi.fn(async () => ({ editable: true, model: makeModel(), source: '' })),
    writePage,
    writePageRaw: vi.fn(async () => ({ ok: true })),
    startDevServer: vi.fn(async () => ({ url: 'http://localhost:4321', external: false })),
    watchProject: vi.fn(),
  };
}

async function openProjectWithPage() {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
  await screen.findByTitle('Dev server: on');
  fireEvent.click(await screen.findByText('section'));
  fireEvent.click(screen.getByRole('button', { name: /settings/i }));
  await screen.findByText('hero');
}

/** Clicks the "hero" attr-row to open the AttrEditor and returns the value input. */
async function openAttrEditor() {
  fireEvent.click(screen.getByText('hero'));
  return screen.findByDisplayValue('hero');
}

describe('App undo history', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    harness.menu.clear();
    setupAvb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses same-key edits inside the 800ms window into one undo step', async () => {
    await openProjectWithPage();
    const field = await openAttrEditor();

    fireEvent.change(field, { target: { value: 'heroA' } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(field, { target: { value: 'heroAB' } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(field, { target: { value: 'heroABC' } });
    await vi.advanceTimersByTimeAsync(400);

    harness.menu.get('undo')();
    // The AttrEditor closes after undo resets the model. Verify the attr-row shows the
    // restored value.
    await waitFor(() => expect(screen.getByText('hero')).toBeInTheDocument());
  });

  it('keeps edits separated by more than 800ms as distinct undo steps', async () => {
    await openProjectWithPage();
    let field = await openAttrEditor();

    fireEvent.change(field, { target: { value: 'heroA' } });
    await vi.advanceTimersByTimeAsync(900);
    fireEvent.change(field, { target: { value: 'heroAB' } });
    await vi.advanceTimersByTimeAsync(400);

    harness.menu.get('undo')();
    await waitFor(() => expect(screen.getByText('heroA')).toBeInTheDocument());

    harness.menu.get('undo')();
    await waitFor(() => expect(screen.getByText('hero')).toBeInTheDocument());
  });

  it('redoes an undone edit and clears the redo stack on a fresh edit', async () => {
    await openProjectWithPage();
    const field = await openAttrEditor();

    fireEvent.change(field, { target: { value: 'heroA' } });
    await vi.advanceTimersByTimeAsync(900);

    harness.menu.get('undo')();
    await waitFor(() => expect(screen.getByText('hero')).toBeInTheDocument());

    harness.menu.get('redo')();
    await waitFor(() => expect(screen.getByText('heroA')).toBeInTheDocument());

    harness.menu.get('undo')();
    await waitFor(() => expect(screen.getByText('hero')).toBeInTheDocument());

    // Make a fresh edit — this should clear the future stack.
    // Close the stale AttrEditor (click outside) and open a fresh one.
    fireEvent.mouseDown(document.body);
    const field2 = await openAttrEditor();
    fireEvent.change(field2, { target: { value: 'branch' } });
    await vi.advanceTimersByTimeAsync(900);

    // Redo after a new edit is a no-op — the future was discarded.
    harness.menu.get('redo')();
    await waitFor(() => expect(screen.getByText('branch')).toBeInTheDocument());
  });

  it('resets history when a different file is opened', async () => {
    await openProjectWithPage();
    const field = await openAttrEditor();
    fireEvent.change(field, { target: { value: 'heroA' } });
    await vi.advanceTimersByTimeAsync(900);

    // Re-opening the page clears past/future (App.jsx openFile).
    fireEvent.click(screen.getByRole('button', { name: /pages/i }));
    await waitFor(() => {
      // PagesPanel renders a "Pages" heading — wait for it to appear.
      expect(screen.getByRole('heading', { name: 'Pages' })).toBeInTheDocument();
    });
    // Find the "index" label inside the Pages panel (not the titlebar switcher).
    const pageItems = screen.getAllByText('index');
    const pageItem = pageItems.find((el) => el.closest('.list-item'));
    if (!pageItem) throw new Error('Could not find page item with text "index"');
    fireEvent.click(pageItem);

    // openFile clears selection — re-select the section and go to settings.
    fireEvent.click(screen.getByRole('button', { name: /navigator/i }));
    fireEvent.click(await screen.findByText('section'));
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    await screen.findByText('hero');

    harness.menu.get('undo')();
    // Still shows hero — the undo stack was cleared when the page re-opened.
    await waitFor(() => expect(screen.getByText('hero')).toBeInTheDocument());
  });
});
