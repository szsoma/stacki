import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';

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
vi.mock('./panels/PreviewPane.jsx', () => ({
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

async function openAttrEditor() {
  fireEvent.click(screen.getByText('hero'));
  return screen.findByDisplayValue('hero');
}

describe('App save scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    harness.menu.clear();
    setupAvb();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches keystrokes into a single write after 300ms of quiet', async () => {
    await openProjectWithPage();
    const field = await openAttrEditor();

    fireEvent.change(field, { target: { value: 'a' } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(field, { target: { value: 'ab' } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(field, { target: { value: 'abc' } });

    // Still inside the debounce window: nothing written yet.
    expect(writePage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    await waitFor(() => expect(writePage).toHaveBeenCalledTimes(1));
    expect(writePage.mock.calls[0][0].model.nodes[0].props.id.value).toBe('abc');
  });

  it('writes the model, not the raw source, for an editable page', async () => {
    await openProjectWithPage();
    const field = await openAttrEditor();
    fireEvent.change(field, { target: { value: 'z' } });
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => expect(writePage).toHaveBeenCalled());
    expect(window.avb.writePageRaw).not.toHaveBeenCalled();
    expect(writePage.mock.calls[0][0]).toHaveProperty('pagePath');
  });

  it('does not write when nothing is dirty', async () => {
    await openProjectWithPage();
    await vi.advanceTimersByTimeAsync(1000);
    expect(writePage).not.toHaveBeenCalled();
  });
});
